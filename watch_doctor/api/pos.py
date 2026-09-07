"""POS endpoints split from watch_doctor/api.py (API_PY_AUDIT.md item 5).

POS invoicing, drafts, POS customers, daily report.
"""

import json

import frappe
from frappe import _  # noqa: F401

from watch_doctor.pos_enhancements import (
    apply_pos_profile,
    build_pos_print_url,
    get_pos_profile_settings,
)
from watch_doctor.permissions import require_roles, get_dw_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY


def _get_default_company():
	"""Return the user's default company or the first available company."""
	company = frappe.defaults.get_user_default("Company")
	if company:
		return company

	companies = frappe.get_all("Company", fields=["name"], limit_page_length=1)
	if companies:
		return companies[0].get("name")

	frappe.throw("No Company is configured for POS invoicing")



def _get_currency_precision(company: str) -> int:
	"""Return the currency precision for the company."""
	precision = frappe.get_system_settings("currency_precision")
	if precision is not None:
		try:
			return int(precision)
		except (TypeError, ValueError):
			pass

	try:
		currency = frappe.db.get_value("Company", company, "default_currency")
		if currency:
			fraction_units = int(frappe.db.get_value("Currency", currency, "fraction_units") or 100)
			if fraction_units > 1:
				import math
				return int(round(math.log10(fraction_units)))
			return 0
	except Exception:
		pass

	return 2



def _get_allowed_pos_payment_modes():
	"""Return all active POS payment modes configured for the app."""
	rows = frappe.db.sql("""
		SELECT pmc.payment_mode
		FROM `tabDW Payment Mode Config` pmc
		INNER JOIN `tabMode of Payment` mop ON pmc.payment_mode = mop.name
		WHERE pmc.is_active = 1 AND mop.enabled = 1
	""", as_dict=True)
	return {row["payment_mode"] for row in rows}



def _get_payment_account_for_mode(payment_mode: str, company: str):
	"""Resolve the default account for a payment mode within the company."""
	payment_account = None
	try:
		mode_of_payment = frappe.get_doc("Mode of Payment", payment_mode)
		for account in mode_of_payment.accounts:
			if account.company == company and account.default_account:
				payment_account = account.default_account
				break
	except Exception:
		payment_account = None

	if payment_account:
		return payment_account

	fallback_account = frappe.db.get_value(
		"Account",
		{"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0},
		"name"
	)
	if fallback_account and payment_mode.lower() == "cash":
		return fallback_account

	frappe.throw(f"No default account is configured for payment mode {payment_mode} in company {company}")



def _parse_pos_payments(payments_json=None, payment_mode: str = "Cash"):
	"""Normalize split-payment input from the client while preserving row order."""
	if payments_json:
		raw_payments = json.loads(payments_json) if isinstance(payments_json, str) else payments_json
		if not isinstance(raw_payments, list) or not raw_payments:
			frappe.throw("Payments must be provided as a non-empty list")
	else:
		fallback_mode = (payment_mode or "Cash").strip() or "Cash"
		return [{"mode_of_payment": fallback_mode, "amount": None}]

	allowed_modes = _get_allowed_pos_payment_modes()
	normalized_payments = []

	for row in raw_payments:
		mode = str((row or {}).get("mode_of_payment") or (row or {}).get("payment_mode") or "").strip()
		amount = frappe.utils.flt((row or {}).get("amount") or 0)

		if not mode:
			frappe.throw("Each payment row must include a payment mode")
		if allowed_modes and mode not in allowed_modes:
			frappe.throw(f"Payment mode {mode} is not enabled for POS")
		if amount <= 0:
			frappe.throw(f"Payment amount for {mode} must be greater than zero")

		normalized_payments.append({
			"mode_of_payment": mode,
			"amount": amount,
		})

	return normalized_payments


def _parse_pos_options(options_json=None):
	"""Normalize POS option payload sent by the React frontend."""
	if not options_json:
		return {}
	return json.loads(options_json) if isinstance(options_json, str) else options_json



def _set_invoice_payments(invoice, payments, precision: int):
	"""Replace the invoice payment rows with validated split payments."""
	if not payments:
		frappe.throw("At least one payment method is required")

	invoice.set("payments", [])
	grand_total = frappe.utils.flt(invoice.grand_total, precision)
	tolerance = (0.5 / (10 ** precision)) if precision > 0 else 0
	total_allocated = 0

	for row in payments:
		mode = row.get("mode_of_payment")
		amount = row.get("amount")
		if amount in (None, ""):
			if len(payments) == 1:
				amount = grand_total
			else:
				frappe.throw("Each split payment row requires an amount")

		amount = frappe.utils.flt(amount, precision)
		if amount <= 0:
			frappe.throw(f"Payment amount for {mode} must be greater than zero")

		total_allocated += amount
		invoice.append("payments", {
			"mode_of_payment": mode,
			"account": _get_payment_account_for_mode(mode, invoice.company),
			"amount": amount,
		})

	total_allocated = frappe.utils.flt(total_allocated, precision)
	if abs(total_allocated - grand_total) > tolerance:
		frappe.throw(
			f"Allocated payments must equal the invoice total. Allocated: {total_allocated}, Total: {grand_total}"
		)


def _validate_pos_pms_item_mix(items) -> bool:
	"""Ensure POS carts do not mix PMS items with standard-VAT items."""
	from watch_doctor.pms import validate_pms_item_mix

	item_codes = [item.get("item_code") for item in (items or []) if item.get("item_code")]
	pms_item_codes, _non_pms_item_codes = validate_pms_item_mix(item_codes)
	return bool(pms_item_codes)


@frappe.whitelist()
def get_pos_runtime_config(company: str = "", pos_profile: str = ""):
	"""Return runtime POS defaults and selector options for the custom POS UI."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	resolved_company = company or _get_default_company()
	return get_pos_profile_settings(resolved_company, pos_profile or None)


@frappe.whitelist()
def get_pos_items(search: str = "", limit: int = 100, in_stock_only: int = 1):
	"""Get items for POS with stock and pricing info. Only returns enabled items with stock.

	Search is token-based: each whitespace-separated word in `search` must appear
	somewhere in the item name, item code, or a scanned barcode, in any order
	(e.g. "632 clock movement" matches "632 Pendulum With Alarm Clock Movement").
	Results are ranked so exact/prefix code, name, or barcode matches surface first.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	search = (search or "").strip()
	tokens = search.split() if search else []
	conditions = ["i.disabled = 0", "i.is_stock_item = 1"]
	values = []
	for token in tokens:
		conditions.append("(i.item_name LIKE %s OR i.item_code LIKE %s OR ib.barcode LIKE %s)")
		like_token = f"%{token}%"
		values.extend([like_token, like_token, like_token])
	where_clause = " AND ".join(conditions)

	if search:
		rank_expr = """
			CASE
				WHEN LOWER(i.item_code) = LOWER(%s) THEN 0
				WHEN MAX(CASE WHEN LOWER(ib.barcode) = LOWER(%s) THEN 1 ELSE 0 END) = 1 THEN 0
				WHEN LOWER(i.item_name) = LOWER(%s) THEN 1
				WHEN LOWER(i.item_code) LIKE LOWER(%s) THEN 2
				WHEN LOWER(i.item_name) LIKE LOWER(%s) THEN 2
				ELSE 3
			END,
		"""
		rank_params = [search, search, search, f"{search}%", f"{search}%"]
	else:
		rank_expr = ""
		rank_params = []

	if int(in_stock_only):
		items = frappe.db.sql(f"""
			SELECT i.name, i.item_name, i.item_code, i.item_group, i.standard_rate, i.image,
				SUM(b.actual_qty) as stock_qty
			FROM `tabItem` i
			INNER JOIN `tabBin` b ON b.item_code = i.name
			LEFT JOIN `tabItem Barcode` ib ON ib.parent = i.name
			WHERE {where_clause}
			GROUP BY i.name
			HAVING SUM(b.actual_qty) > 0
			ORDER BY {rank_expr} i.item_name ASC
			LIMIT %s
		""", values + rank_params + [int(limit)], as_dict=True)
	else:
		items = frappe.db.sql(f"""
			SELECT i.name, i.item_name, i.item_code, i.item_group, i.standard_rate, i.image
			FROM `tabItem` i
			LEFT JOIN `tabItem Barcode` ib ON ib.parent = i.name
			WHERE {where_clause}
			GROUP BY i.name
			ORDER BY {rank_expr} i.item_name ASC
			LIMIT %s
		""", values + rank_params + [int(limit)], as_dict=True)

		item_names = [item['name'] for item in items]
		stock_rows = frappe.db.sql("""
			SELECT item_code, SUM(actual_qty) as qty
			FROM `tabBin`
			WHERE item_code IN %s
			GROUP BY item_code
		""", (item_names,), as_dict=True) if item_names else []
		stock_map = {row['item_code']: row['qty'] for row in stock_rows}
		for item in items:
			item['stock_qty'] = stock_map.get(item['name'], 0)

	# Enrich with PMS info for items in the configured PMS group
	from watch_doctor.pms import _get_pms_item_groups
	pms_groups = _get_pms_item_groups()
	for item in items:
		item['is_pms'] = 1 if item.get('item_group') in pms_groups else 0

	return items


@frappe.whitelist()
def get_pos_customers(search: str = "", limit: int = 20):
	"""Get customers for POS selection. Matches by name or mobile number."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if search:
		customers = frappe.get_all(
			"Customer",
			or_filters=[
				["customer_name", "like", f"%{search}%"],
				["name", "like", f"%{search}%"],
				["mobile_no", "like", f"%{search}%"]
			],
			fields=["name", "customer_name", "mobile_no"],
			limit_page_length=int(limit),
			order_by="customer_name asc"
		)
	else:
		customers = frappe.get_all(
			"Customer",
			fields=["name", "customer_name", "mobile_no"],
			limit_page_length=int(limit),
			order_by="modified desc"
		)

	return customers


@frappe.whitelist()
def get_customer_repair_history(customer: str, limit: int = 20):
	"""Return a customer's prior repair orders, newest first."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	return frappe.db.sql(
		"""
		SELECT o.name, o.status, o.received_date, o.delivery_date,
		       o.invoiced_amount, COUNT(i.name) AS watch_count
		FROM `tabDW Repair Order` o
		LEFT JOIN `tabDW Repair Item` i ON i.parent = o.name
		WHERE o.customer = %s
		GROUP BY o.name
		ORDER BY o.received_date DESC
		LIMIT %s
		""",
		(customer, int(limit)),
		as_dict=True,
	)


@frappe.whitelist()
def get_repair_history_detail(name: str):
	"""Return items and tasks for a repair order with resolved display names."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	items = frappe.db.sql(
		"""
		SELECT ri.name, ri.idx, ri.watch_brand, ri.watch_model,
		       COALESCE(wm.model_name, ri.watch_model) AS watch_model_name,
		       ri.serial_number, ri.status
		FROM `tabDW Repair Item` ri
		LEFT JOIN `tabDW Watch Model` wm ON wm.name = ri.watch_model
		WHERE ri.parent = %s
		ORDER BY ri.idx
		""",
		(name,),
		as_dict=True,
	)

	tasks = frappe.db.sql(
		"""
		SELECT rt.repair_item_key, rt.service,
		       COALESCE(tt.task_name, rt.service) AS service_name,
		       rt.status
		FROM `tabDW Repair Task` rt
		LEFT JOIN `tabDW Task Template` tt ON tt.name = rt.service
		WHERE rt.parent = %s
		ORDER BY rt.idx
		""",
		(name,),
		as_dict=True,
	)

	return {"items": items, "all_tasks": tasks}


@frappe.whitelist()
def create_pos_customer(customer_name: str = "", customer_id: str = "", mobile_no: str = "", email_id: str = ""):
	"""Create a new Customer from POS quick-create form."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	customer_name = " ".join((customer_name or "").split())
	customer_id = (customer_id or "").strip()
	mobile_no = (mobile_no or "").strip()
	email_id = (email_id or "").strip()

	if not customer_name:
		frappe.throw("Customer name is required")

	if email_id and not frappe.utils.validate_email_address(email_id, throw=False):
		frappe.throw("Please enter a valid email address")

	if mobile_no:
		existing = frappe.db.get_value(
			"Customer", {"mobile_no": mobile_no}, ["name", "customer_name"], as_dict=True
		)
		if existing:
			frappe.throw(
				f"A customer with mobile {mobile_no} already exists: "
				f"{existing.customer_name} ({existing.name}). "
				"Search for the existing customer instead of creating a duplicate.",
				title="Duplicate Mobile Number",
			)

	customer_doc = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Individual",
		"customer_group": "Individual",
		"territory": "All Territories",
		"mobile_no": mobile_no,
		"email_id": email_id,
	})

	if customer_id:
		meta = frappe.get_meta("Customer")
		for fieldname in (
			"customer_pos_id",
			"customer_id",
			"custom_customer_id",
			"id_number",
			"custom_id_number",
			"identification_number",
			"custom_identification_number",
			"identification_document_number",
			"custom_identification_document_number",
			"civil_id",
			"national_id",
		):
			if meta.has_field(fieldname):
				customer_doc.set(fieldname, customer_id)
				break

	customer_doc.insert(ignore_permissions=True)

	return {
		"name": customer_doc.name,
		"customer_name": customer_doc.customer_name,
		"mobile_no": customer_doc.mobile_no,
		"email_id": customer_doc.email_id,
	}


@frappe.whitelist()
def create_pos_invoice(
	customer: str = "",
	items_json: str = "[]",
	payment_mode: str = "Cash",
	discount_percent: float = 0,
	payments_json=None,
	options_json=None,
	is_credit_sale: int = 0,
	due_date: str = "",
):
	"""Create a POS Sales Invoice with immediate single/split payment, or as a credit sale.

	A credit sale takes no payment at time of sale: the invoice is submitted with
	is_pos=0 (so core doesn't require a payment row) and the full amount is left
	outstanding on the customer's account, to be collected later via
	collect_pos_payment.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	is_credit_sale = frappe.utils.cint(is_credit_sale)
	payments = [] if is_credit_sale else _parse_pos_payments(payments_json, payment_mode)
	options = _parse_pos_options(options_json)
	discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0

	if not items or len(items) == 0:
		frappe.throw("At least one item is required")

	if is_credit_sale and not (customer or "").strip():
		frappe.throw("A customer is required for a credit sale")

	has_pms_items = _validate_pos_pms_item_mix(items)
	from watch_doctor.pms import get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	standard_sales_taxes_template = get_standard_sales_taxes_template()

	company = options.get("company") or _get_default_company()
	precision = _get_currency_precision(company)

	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": due_date or (frappe.utils.add_days(frappe.utils.today(), 15) if is_credit_sale else frappe.utils.today()),
		"is_pos": 0 if is_credit_sale else 1,
		"dw_is_credit_sale": 1 if is_credit_sale else 0,
		"update_stock": 1,
		"additional_discount_percentage": discount_percent,
		"items": []
	})
	invoice.flags.ignore_permissions = True

	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})

	profile_settings = apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=customer,
		pos_profile=options.get("pos_profile") or "",
		sales_person=options.get("sales_person") or "",
		commission_rate=options.get("commission_rate") or 0,
		receipt_format=options.get("receipt_format") or "",
		naming_series=options.get("naming_series") or "",
	)

	# PMS invoices must NOT have standard Sales Taxes applied —
	# the PMS VAT is calculated via margin and posted as GL entries on submit.
	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before creating POS invoices.")

	invoice.insert(ignore_permissions=True)
	if not is_credit_sale:
		_set_invoice_payments(invoice, payments, precision)
	invoice.save(ignore_permissions=True)
	invoice.submit()

	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer,
		"has_pms_items": has_pms_items,
		"pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
		"is_credit_sale": is_credit_sale,
		"outstanding_amount": invoice.outstanding_amount,
		"due_date": str(invoice.due_date),
		"auto_print": profile_settings.get("auto_print") or 0,
		"print_format": invoice.get("dw_pos_receipt_format") or "",
		"print_url": build_pos_print_url(invoice, profile_settings),
	}


@frappe.whitelist()
def get_pos_outstanding_invoices(search: str = "", limit: int = 20):
	"""List submitted, unpaid invoices for the POS Collect Payment screen."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	conditions = ["si.docstatus = 1", "si.is_return = 0", "si.outstanding_amount > 0"]
	values = []
	if search:
		conditions.append(
			"(si.name LIKE %s OR si.customer_name LIKE %s OR si.customer LIKE %s OR c.mobile_no LIKE %s)"
		)
		like = f"%{search}%"
		values.extend([like, like, like, like])
	where_clause = " AND ".join(conditions)

	return frappe.db.sql(f"""
		SELECT si.name, si.customer, si.customer_name, c.mobile_no,
			si.posting_date, si.due_date, si.grand_total, si.outstanding_amount,
			si.dw_is_credit_sale
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		WHERE {where_clause}
		ORDER BY si.due_date ASC, si.posting_date ASC
		LIMIT %s
	""", values + [int(limit)], as_dict=True)


@frappe.whitelist()
def collect_pos_payment(invoice_name: str, mode_of_payment: str = "Cash", amount: float = 0):
	"""Record a payment against an outstanding invoice (e.g. settling a credit sale)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	if invoice.docstatus != 1:
		frappe.throw("Only submitted invoices can be collected against")

	outstanding = frappe.utils.flt(invoice.outstanding_amount)
	if outstanding <= 0:
		frappe.throw("This invoice has no outstanding balance")

	amount = frappe.utils.flt(amount)
	if amount <= 0:
		frappe.throw("Enter a payment amount greater than zero")

	precision = _get_currency_precision(invoice.company)
	tolerance = (0.5 / (10 ** precision)) if precision > 0 else 0
	if frappe.utils.flt(amount, precision) > frappe.utils.flt(outstanding, precision) + tolerance:
		frappe.throw(f"Payment amount cannot exceed the outstanding balance of {outstanding}")

	mode_of_payment = (mode_of_payment or "Cash").strip()
	allowed_modes = _get_allowed_pos_payment_modes()
	if allowed_modes and mode_of_payment not in allowed_modes:
		frappe.throw(f"Payment mode {mode_of_payment} is not enabled for POS")

	payment_entry = get_payment_entry("Sales Invoice", invoice_name, party_amount=amount)
	payment_entry.mode_of_payment = mode_of_payment
	payment_entry.paid_to = _get_payment_account_for_mode(mode_of_payment, invoice.company)
	payment_entry.reference_no = payment_entry.reference_no or invoice_name
	payment_entry.reference_date = frappe.utils.today()
	payment_entry.flags.ignore_permissions = True
	payment_entry.insert(ignore_permissions=True)
	payment_entry.submit()

	# If this invoice was finalized against a repair order, keep the repair order's
	# own paid/balance snapshot (set at finalize time, e.g. 0 paid for a credit sale)
	# in sync with payments collected later against the invoice.
	repair_order_name = frappe.db.get_value("DW Repair Order", {"sales_invoice": invoice_name}, "name")
	if repair_order_name:
		prev_paid = frappe.utils.flt(frappe.db.get_value("DW Repair Order", repair_order_name, "paid_amount") or 0)
		prev_balance = frappe.utils.flt(frappe.db.get_value("DW Repair Order", repair_order_name, "balance_amount") or 0)
		frappe.db.set_value(
			"DW Repair Order",
			repair_order_name,
			{
				"paid_amount": prev_paid + amount,
				"balance_amount": max(0.0, prev_balance - amount),
			},
			update_modified=False,
		)

	frappe.db.commit()

	invoice.reload()
	return {
		"payment_entry": payment_entry.name,
		"invoice_name": invoice_name,
		"amount_collected": amount,
		"outstanding_amount": invoice.outstanding_amount,
	}


@frappe.whitelist()
def get_pos_return_candidates(search: str = "", limit: int = 20):
	"""Search submitted, non-return invoices to start a return, by invoice number, customer, or mobile."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	conditions = ["si.docstatus = 1", "si.is_return = 0"]
	values = []
	if search:
		conditions.append(
			"(si.name LIKE %s OR si.customer_name LIKE %s OR si.customer LIKE %s OR c.mobile_no LIKE %s)"
		)
		like = f"%{search}%"
		values.extend([like, like, like, like])
	where_clause = " AND ".join(conditions)

	return frappe.db.sql(f"""
		SELECT si.name, si.customer, si.customer_name, c.mobile_no,
			si.posting_date, si.grand_total, si.is_pos
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		WHERE {where_clause}
		ORDER BY si.posting_date DESC, si.creation DESC
		LIMIT %s
	""", values + [int(limit)], as_dict=True)


@frappe.whitelist()
def get_pos_invoice_return_items(invoice_name: str):
	"""Return each line item on an invoice with how much of it is still returnable."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from erpnext.controllers.sales_and_purchase_return import make_return_doc

	original = frappe.get_doc("Sales Invoice", invoice_name)
	if original.docstatus != 1:
		frappe.throw("Only submitted invoices can be returned")
	if original.is_return:
		frappe.throw("This invoice is already a return")

	return_doc = make_return_doc("Sales Invoice", invoice_name)

	items = []
	for row in return_doc.items:
		returnable_qty = abs(frappe.utils.flt(row.qty))
		if returnable_qty <= 0:
			continue
		items.append({
			"row_name": row.sales_invoice_item,
			"item_code": row.item_code,
			"item_name": row.item_name,
			"rate": row.rate,
			"returnable_qty": returnable_qty,
		})

	if not items:
		frappe.throw("All items on this invoice have already been fully returned")

	# How much has actually been collected on this invoice so far — this is what
	# can be handed back as a cash/card refund. It is NOT the same as is_pos: a
	# credit sale (is_pos=0) can have since been fully or partially settled via
	# collect_pos_payment, and that money is just as refundable as a checkout payment.
	precision = _get_currency_precision(original.company)
	amount_paid = frappe.utils.flt(
		frappe.utils.flt(original.grand_total, precision) - frappe.utils.flt(original.outstanding_amount, precision),
		precision,
	)

	return {
		"invoice_name": original.name,
		"customer": original.customer,
		"customer_name": original.customer_name,
		"posting_date": str(original.posting_date),
		"grand_total": original.grand_total,
		"is_pos": original.is_pos,
		"amount_paid": max(amount_paid, 0),
		"items": items,
	}


@frappe.whitelist()
def create_pos_return(invoice_name: str, items_json: str = "[]", payments_json=None):
	"""Create and submit a partial or full return against a POS sale.

	Reuses ERPNext's standard return-doc construction (correct tax/qty reversal,
	stock re-entry, and over-return protection across repeated partial returns),
	then prunes it down to only the items/quantities the cashier selected and
	applies whatever refund the cashier chose to hand back — capped at how much
	was actually collected on the original invoice (checked at checkout, or since
	via collect_pos_payment if it was a credit sale). Anything not refunded in
	cash is left as a reduced/negative outstanding balance (a credit note).
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from erpnext.controllers.sales_and_purchase_return import make_return_doc
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	requested_items = json.loads(items_json) if isinstance(items_json, str) else items_json
	requested_items = [r for r in (requested_items or []) if frappe.utils.flt(r.get("qty")) > 0]
	if not requested_items:
		frappe.throw("Select at least one item to return")
	requested_qty_map = {r.get("row_name"): frappe.utils.flt(r.get("qty")) for r in requested_items}

	original = frappe.get_doc("Sales Invoice", invoice_name)
	if original.docstatus != 1:
		frappe.throw("Only submitted invoices can be returned")
	if original.is_return:
		frappe.throw("Cannot return a return invoice")

	precision = _get_currency_precision(original.company)
	amount_paid = max(frappe.utils.flt(
		frappe.utils.flt(original.grand_total, precision) - frappe.utils.flt(original.outstanding_amount, precision),
		precision,
	), 0)

	return_doc = make_return_doc("Sales Invoice", invoice_name)
	return_doc.flags.ignore_permissions = True

	# naming_series has no_copy=1 on Sales Invoice, so make_return_doc never
	# copies it from the original — left alone it falls back to ERPNext's
	# generic default series instead of continuing this app's own series
	# (PMS vs standard retail vs repair), so returns must pick it explicitly.
	from watch_doctor.invoice_settings import apply_workflow_naming_series, detect_sales_invoice_workflow
	apply_workflow_naming_series(return_doc, detect_sales_invoice_workflow(original))

	kept_rows = []
	for row in return_doc.items:
		requested_qty = requested_qty_map.get(row.sales_invoice_item)
		if not requested_qty:
			continue
		max_returnable = abs(frappe.utils.flt(row.qty))
		if requested_qty > max_returnable + 1e-6:
			frappe.throw(
				f"Cannot return {requested_qty} of {row.item_code}; "
				f"only {max_returnable} remaining from {invoice_name}"
			)
		row.qty = -abs(requested_qty)
		row.stock_qty = row.qty * frappe.utils.flt(row.conversion_factor or 1)
		kept_rows.append(row)

	if not kept_rows:
		frappe.throw("Selected items do not match this invoice")

	return_doc.set("items", kept_rows)
	return_doc.run_method("calculate_taxes_and_totals")

	refund_total = abs(frappe.utils.flt(return_doc.grand_total, precision))
	max_refundable = min(refund_total, amount_paid)

	# Refund payments are optional here (unlike checkout) — an empty/omitted list
	# just means "no cash refund, leave it as a credit note", which is valid.
	requested_payments = json.loads(payments_json) if isinstance(payments_json, str) else (payments_json or [])
	allowed_modes = _get_allowed_pos_payment_modes()
	total_requested = 0
	refund_rows = []
	for row in requested_payments or []:
		mode = str((row or {}).get("mode_of_payment") or (row or {}).get("payment_mode") or "").strip()
		amount = frappe.utils.flt((row or {}).get("amount") or 0, precision)
		if amount <= 0:
			continue
		if not mode:
			frappe.throw("Each refund row must include a payment mode")
		if allowed_modes and mode not in allowed_modes:
			frappe.throw(f"Payment mode {mode} is not enabled for POS")
		total_requested += amount
		refund_rows.append({"mode_of_payment": mode, "amount": amount})

	total_requested = frappe.utils.flt(total_requested, precision)
	tolerance = (0.5 / (10 ** precision)) if precision > 0 else 0
	if total_requested > max_refundable + tolerance:
		frappe.throw(
			f"Refund amount cannot exceed {max_refundable} — that is all that has been collected on {invoice_name} so far."
		)

	return_doc.set("payments", [])
	if return_doc.is_pos and total_requested > 0:
		# The original sale collected payment through this same POS-payments
		# mechanism, so refund it the same way — the standard, core-supported
		# path for a POS credit note (verify_payment_amount_is_negative).
		for row in refund_rows:
			return_doc.append("payments", {
				"mode_of_payment": row["mode_of_payment"],
				"account": _get_payment_account_for_mode(row["mode_of_payment"], return_doc.company),
				"amount": -row["amount"],
			})
		return_doc.paid_amount = -total_requested

	return_doc.insert(ignore_permissions=True)
	return_doc.submit()

	refunded_amount = 0
	if not return_doc.is_pos and total_requested > 0:
		# A non-POS invoice's payments table isn't wired into its outstanding/GL,
		# so refunding money paid on a (now-settled) credit sale needs a real
		# Payment Entry — the same mechanism collect_pos_payment uses in reverse.
		for row in refund_rows:
			# party_amount must carry the same sign as the return invoice's
			# outstanding_amount (negative) — get_payment_entry uses it directly
			# to compute the reference's allocated_amount.
			payment_entry = get_payment_entry("Sales Invoice", return_doc.name, party_amount=-row["amount"])
			payment_entry.mode_of_payment = row["mode_of_payment"]
			payment_entry.paid_from = _get_payment_account_for_mode(row["mode_of_payment"], return_doc.company)
			payment_entry.reference_no = payment_entry.reference_no or return_doc.name
			payment_entry.reference_date = frappe.utils.today()
			payment_entry.flags.ignore_permissions = True
			payment_entry.insert(ignore_permissions=True)
			payment_entry.submit()
			refunded_amount += row["amount"]
	elif return_doc.is_pos:
		refunded_amount = total_requested

	frappe.db.commit()

	return {
		"return_invoice": return_doc.name,
		"original_invoice": invoice_name,
		"grand_total": return_doc.grand_total,
		"refunded_amount": refunded_amount,
	}


@frappe.whitelist()
def save_pos_draft(customer: str = "", items_json: str = "[]", options_json=None):
	"""Save POS cart as draft Sales Invoice (not submitted)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	options = _parse_pos_options(options_json)
	
	if not items or len(items) == 0:
		frappe.throw("At least one item is required")

	has_pms_items = _validate_pos_pms_item_mix(items)
	from watch_doctor.pms import get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	standard_sales_taxes_template = get_standard_sales_taxes_template()
	
	# Get company from settings or first company
	company = options.get("company") or _get_default_company()
	
	# Create draft Sales Invoice (is_pos but not submitted)
	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": frappe.utils.today(),
		"is_pos": 1,
		"update_stock": 1,
		"items": []
	})
	invoice.flags.ignore_permissions = True
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})

	apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=customer,
		pos_profile=options.get("pos_profile") or "",
		sales_person=options.get("sales_person") or "",
		commission_rate=options.get("commission_rate") or 0,
		receipt_format=options.get("receipt_format") or "",
		naming_series=options.get("naming_series") or "",
	)

	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before saving POS drafts.")

	invoice.insert(ignore_permissions=True)

	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer
	}


@frappe.whitelist()
def get_pos_drafts(limit: int = 20):
	"""Get draft POS invoices (held orders)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	drafts = frappe.get_all(
		"Sales Invoice",
		filters={
			"is_pos": 1,
			"docstatus": 0  # Draft
		},
		fields=["name", "customer", "customer_name", "grand_total", "creation", "modified"],
		limit_page_length=int(limit),
		order_by="modified desc"
	)
	
	# Get item count for each draft
	for draft in drafts:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": draft["name"]},
			fields=["COUNT(*) as count"]
		)
		draft["item_count"] = items[0]["count"] if items else 0
	
	return drafts


@frappe.whitelist()
def load_pos_draft(invoice_name: str):
	"""Load a draft invoice to continue in POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	items = []
	for item in invoice.items:
		items.append({
			"item_code": item.item_code,
			"item_name": item.item_name,
			"qty": item.qty,
			"rate": item.rate
		})
	
	return {
		"invoice_name": invoice.name,
		"customer": invoice.customer,
		"customer_name": invoice.customer_name,
		"items": items,
		"grand_total": invoice.grand_total,
		"pos_profile": invoice.get("dw_pos_profile") or "",
		"sales_person": invoice.get("dw_pos_sales_person") or "",
		"commission_rate": invoice.get("dw_pos_commission_rate") or 0,
		"receipt_format": invoice.get("dw_pos_receipt_format") or "",
		"naming_series": invoice.naming_series or "",
	}


@frappe.whitelist()
def delete_pos_draft(invoice_name: str):
	"""Delete a draft POS invoice."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Can only delete draft invoices")
	
	frappe.delete_doc("Sales Invoice", invoice_name)

	return {"success": True}


@frappe.whitelist()
def submit_pos_draft(invoice_name: str, payment_mode: str = "Cash", discount_percent: float = 0, payments_json=None, options_json=None):
	"""Submit a draft POS invoice with single or split payment."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	invoice.flags.ignore_permissions = True
	payments = _parse_pos_payments(payments_json, payment_mode)
	options = _parse_pos_options(options_json)
	discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	invoice.additional_discount_percentage = discount_percent

	# Clear standard taxes for PMS invoices (if any PMS item present)
	from watch_doctor.pms import validate_pms_item_mix, get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	pms_item_codes, _non_pms_item_codes = validate_pms_item_mix(
		[item.item_code for item in invoice.items if item.item_code]
	)
	has_pms_items = bool(pms_item_codes)
	profile_settings = apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=invoice.customer,
		pos_profile=options.get("pos_profile") or invoice.get("dw_pos_profile") or "",
		sales_person=options.get("sales_person") or invoice.get("dw_pos_sales_person") or "",
		commission_rate=options.get("commission_rate") or invoice.get("dw_pos_commission_rate") or 0,
		receipt_format=options.get("receipt_format") or invoice.get("dw_pos_receipt_format") or "",
		naming_series=options.get("naming_series") or invoice.naming_series or "",
	)
	standard_sales_taxes_template = get_standard_sales_taxes_template()
	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before submitting POS drafts.")

	invoice.save(ignore_permissions=True)
	precision = _get_currency_precision(invoice.company)
	_set_invoice_payments(invoice, payments, precision)
	invoice.save(ignore_permissions=True)
	invoice.submit()

	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer,
		"has_pms_items": has_pms_items,
		"pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
		"auto_print": profile_settings.get("auto_print") or 0,
		"print_format": invoice.get("dw_pos_receipt_format") or "",
		"print_url": build_pos_print_url(invoice, profile_settings),
	}




# ==================== Daily Report API ====================

@frappe.whitelist()
def get_daily_report(report_date=None):
	"""Get a comprehensive daily report for repair works and POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	import datetime
	is_executive = "executive" in get_dw_roles()
	if not report_date:
		report_date = datetime.date.today().isoformat()

	# ---- REPAIR SECTION ----

	# Orders received on report_date
	received_orders = frappe.db.sql("""
		SELECT name, customer, status, priority, received_date,
			promised_delivery_date, invoiced_amount
		FROM `tabDW Repair Order`
		WHERE received_date = %s
		ORDER BY creation ASC
	""", (report_date,), as_dict=True)
	for o in received_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Orders completed on report_date (status=Completed, modified on that date)
	completed_orders = frappe.db.sql("""
		SELECT name, customer, status, received_date, invoiced_amount,
			DATE(modified) as completed_date
		FROM `tabDW Repair Order`
		WHERE status = 'Completed' AND DATE(modified) = %s
		ORDER BY modified DESC
	""", (report_date,), as_dict=True)
	for o in completed_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Pending / In Progress counts (current snapshot)
	pending_count = frappe.db.count("DW Repair Order", {"status": "Pending"})
	inprogress_count = frappe.db.count("DW Repair Order", {"status": "In Progress"})

	# Repair revenue: submitted Sales Invoices posted on report_date linked to a repair order
	repair_revenue_rows = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.customer, si.is_return
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date = %s
	""", (report_date,), as_dict=True)
	repair_revenue = sum(r["grand_total"] for r in repair_revenue_rows)
	repair_invoice_count = len(repair_revenue_rows)

	# Repair invoice payment mode breakdown. Excludes returns (see sales_inv_names
	# comment below) — none exist in repair invoices today, but this keeps the same
	# invariant if one ever does.
	repair_payment_breakdown = []
	ri_names = [r["name"] for r in repair_revenue_rows if not r["is_return"]]
	if ri_names:
		ri_placeholders = ", ".join(["%s"] * len(ri_names))
		repair_payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({ri_placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(ri_names), as_dict=True
		)

	# Tasks completed per technician on report_date
	technician_tasks = frappe.db.sql("""
		SELECT
			t.technician,
			tech.technician_name,
			COUNT(*) as tasks_completed
		FROM `tabDW Repair Task` t
		LEFT JOIN `tabDW Technician` tech ON t.technician = tech.name
		WHERE t.status = 'Completed' AND DATE(t.modified) = %s
			AND t.technician IS NOT NULL AND t.technician != ''
		GROUP BY t.technician, tech.technician_name
		ORDER BY tasks_completed DESC
	""", (report_date,), as_dict=True)

	# Top issues from orders received on report_date
	top_issues = frappe.db.sql("""
		SELECT
			COALESCE(it.issue_name, ri.issue) as issue_name,
			COUNT(*) as count
		FROM `tabDW Repair Item Issue` ri
		INNER JOIN `tabDW Repair Order` ro ON ri.parent = ro.name
		LEFT JOIN `tabDW Issue Template` it ON ri.issue = it.name
		WHERE ro.received_date = %s
		GROUP BY ri.issue, it.issue_name
		ORDER BY count DESC
		LIMIT 10
	""", (report_date,), as_dict=True)

	# Parts used in orders received on report_date
	parts_used = frappe.db.sql("""
		SELECT
			rp.part,
			COALESCE(rp.item_name, i.item_name, rp.part) as item_name,
			SUM(rp.quantity) as total_qty,
			SUM(rp.quantity * COALESCE(rp.rate, rp.auto_rate, 0)) as total_amount
		FROM `tabDW Repair Part Used` rp
		INNER JOIN `tabDW Repair Order` ro ON rp.parent = ro.name
		LEFT JOIN `tabItem` i ON rp.part = i.name
		WHERE ro.received_date = %s
		GROUP BY rp.part, item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- FINANCIAL / EXPENSES SECTION ----

	# ---- FINANCIAL / EXPENSES SECTION ----

	expense_entries = []

	# 1) Payment Entry expenses — outgoing payments on ALL modes
	pe_rows = frappe.db.sql(
		"""SELECT
			pe.name,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			pe.paid_to AS debit_account
		FROM `tabPayment Entry` pe
		WHERE pe.payment_type = 'Pay'
			AND pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.creation ASC""",
		(report_date,),
		as_dict=True
	)
	expense_entries.extend(pe_rows)

	def _mode_breakdown_dicts(rows):
		m = {}
		for r in rows:
			mode = r.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(r.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	# 2) Journal Entry debits — credit on ANY mode-of-payment account = cash out
	default_company = frappe.defaults.get_defaults().get("company")
	mode_account_rows = frappe.db.sql(
		"""SELECT mopa.default_account, mop.name AS mode_of_payment
		FROM `tabMode of Payment Account` mopa
		INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
		WHERE (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
		(default_company or "",),
		as_dict=True
	)
	account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}
	payment_accounts = list(account_to_mode.keys())

	je_detail_rows = []
	je_receipt_rows = []  # JE debits on cash/bank = cash received via journal entry
	if payment_accounts:
		pa_placeholders = ", ".join(["%s"] * len(payment_accounts))

		# JE credits on cash/bank accounts = cash paid out.
		# A credit is only a genuine EXPENSE to the extent its offsetting DEBIT lines
		# hit non-cash accounts. When the debit side is another cash/bank account the
		# JE is a pure internal transfer (e.g. EOD float: Dr HO CASH / Cr AUB) and must
		# NOT be counted as an expense. This mirrors the debit→income logic below, which
		# already splits internal corrections from external receipts.
		je_credit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.credit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name
				   AND jea2.debit_in_account_currency > 0
				 LIMIT 1) AS debit_account,
				(SELECT COALESCE(SUM(jea3.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name
				   AND jea3.debit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_placeholders})
				) AS external_debit_amount,
				(SELECT COALESCE(SUM(jea4.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name
				   AND jea4.debit_in_account_currency > 0
				   AND jea4.account IN ({pa_placeholders})
				) AS internal_debit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date = %s
				AND jea.account IN ({pa_placeholders})
				AND jea.credit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [report_date] + payment_accounts),
			as_dict=True
		)
		for row in je_credit_rows:
			mode      = account_to_mode.get(row["account"], row["account"])
			ext_dr    = float(row.get("external_debit_amount") or 0)
			int_dr    = float(row.get("internal_debit_amount") or 0)
			total_dr  = ext_dr + int_dr
			# Fraction of this credit that funds a genuine (non-cash) expense account
			ext_fraction = (ext_dr / total_dr) if total_dr > 0 else 0.0
			amount       = float(row["amount"] or 0)
			expense_amt  = amount * ext_fraction
			# Pure internal transfers (ext_fraction == 0) contribute no expense
			if expense_amt > 0:
				je_detail_rows.append({
					"name": row["name"],
					"mode_of_payment": mode,
					"against_account": row.get("debit_account") or "",
					"amount": expense_amt,
					"remarks": row.get("remarks") or "",
				})
		# Extend with je_detail_rows (has resolved mode_of_payment) NOT the raw SQL result
		# (which only has `account`), otherwise expense_breakdown maps them all to "Other".
		expense_entries.extend(je_detail_rows)

		# JE debits on cash/bank accounts — three categories:
		#
		# 1. PURE CORRECTION (inter-account transfer): ALL credit lines are also cash/bank
		#    accounts (e.g. Dr Cash, Cr AFS Card to fix a wrong payment mode).
		#    Not new income; just redistributes cash across modes.
		#
		# 2. PURE EXTERNAL RECEIPT: ALL credit lines are non-cash accounts (e.g. Dr Cash,
		#    Cr Accounts Payable for a supplier refund). Genuine new cash inflow.
		#
		# 3. MIXED JE: some credit lines are cash/bank (correction portion) and some are
		#    non-cash (external portion). e.g. Dr Cash 100, Cr Card 50, Cr Creditors 50.
		#    Only the proportional external fraction counts as income.
		#
		# We fetch the SUM of external credits and internal credits per JE so we can
		# compute the exact income fraction for each debit line.
		je_debit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.debit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name
				   AND jea2.credit_in_account_currency > 0
				 LIMIT 1) AS credit_account,
				(SELECT COALESCE(SUM(jea3.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name
				   AND jea3.credit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_placeholders})
				) AS external_credit_amount,
				(SELECT COALESCE(SUM(jea4.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name
				   AND jea4.credit_in_account_currency > 0
				   AND jea4.account IN ({pa_placeholders})
				) AS internal_credit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date = %s
				AND jea.account IN ({pa_placeholders})
				AND jea.debit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [report_date] + payment_accounts),
			as_dict=True
		)
		for row in je_debit_rows:
			mode     = account_to_mode.get(row["account"], row["account"])
			ext_cr   = float(row.get("external_credit_amount") or 0)
			int_cr   = float(row.get("internal_credit_amount") or 0)
			total_cr = ext_cr + int_cr
			# Fraction of this debit that is genuinely new income (non-correction)
			ext_fraction    = (ext_cr / total_cr) if total_cr > 0 else 0.0
			amount          = float(row["amount"] or 0)
			external_amount = amount * ext_fraction
			je_receipt_rows.append({
				"name": row["name"],
				"mode_of_payment": mode,
				"against_account": row.get("credit_account") or "",
				"amount": amount,
				"external_amount": external_amount,
				"is_correction": (ext_fraction == 0.0),
				"remarks": row.get("remarks") or "",
			})

	je_count = len(je_detail_rows)
	je_total = sum(r["amount"] for r in je_detail_rows)
	je_by_mode = _mode_breakdown_dicts(je_detail_rows)
	# Sum the proportional external_amount — handles pure corrections (0), pure externals
	# (full amount), and mixed JEs (fractional) correctly.
	je_receipt_total = sum(r.get("external_amount", 0) for r in je_receipt_rows)
	# Build je_receipt_by_mode from the proportional external amounts
	_je_ext_mode: dict = {}
	for _r in je_receipt_rows:
		_ext = _r.get("external_amount", 0)
		if _ext <= 0:
			continue
		_m = _r["mode_of_payment"]
		if _m not in _je_ext_mode:
			_je_ext_mode[_m] = {"mode_of_payment": _m, "total": 0.0, "count": 0}
		_je_ext_mode[_m]["total"] += _ext
		_je_ext_mode[_m]["count"] += 1
	je_receipt_by_mode = sorted(_je_ext_mode.values(), key=lambda x: x["total"], reverse=True)
	# All JE debits (including corrections) for per-mode cash flow table
	je_all_debits_by_mode = _mode_breakdown_dicts(je_receipt_rows)

	# Paid-at-invoice Purchase Invoices (is_paid=1): cash purchases settled directly
	# without a separate Payment Entry — must be fetched here so they're included in
	# expense_breakdown (→ Cash Flow by Payment Mode) and paid_purchases_by_mode.
	paid_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.paid_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name,
			COALESCE(pi.cash_bank_account, '') AS cash_bank_account
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s AND pi.is_paid = 1
		ORDER BY pi.grand_total DESC
	""", (report_date,), as_dict=True)
	# Cash outflow for a paid invoice is the amount actually disbursed (paid_amount),
	# NOT the invoice face value — these differ when part of the bill is settled by an
	# advance or write-off (e.g. a 700 invoice with 650 paid in cash). Fall back to
	# grand_total when paid_amount is not set.
	for inv in paid_purchase_invoices:
		pa = inv.get("paid_amount")
		inv["cash_paid"] = float(pa if pa not in (None, 0) else (inv.get("grand_total") or 0))
	total_paid_purchases = sum(inv["cash_paid"] for inv in paid_purchase_invoices)

	def _account_to_payment_mode(acct):
		"""Resolve a GL cash/bank account name to its payment mode label.
		Falls back to the account name itself if no mapping exists."""
		return account_to_mode.get(acct) or acct or "Cash"

	# Group paid invoices by payment mode (not raw account name)
	paid_purchases_mode_map = {}
	for inv in paid_purchase_invoices:
		mode = _account_to_payment_mode(inv.get("cash_bank_account") or "")
		if mode not in paid_purchases_mode_map:
			paid_purchases_mode_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		paid_purchases_mode_map[mode]["total"] += inv["cash_paid"]
		paid_purchases_mode_map[mode]["count"] += 1
	paid_purchases_by_mode = sorted(paid_purchases_mode_map.values(), key=lambda x: x["total"], reverse=True)

	# Aggregate by payment mode — include paid purchase invoice outflows
	mode_expense_map = {}
	for e in expense_entries:
		mode = e.get("mode_of_payment", "Other")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(e.get("amount") or 0)
		mode_expense_map[mode]["count"] += 1
	for inv in paid_purchase_invoices:
		mode = _account_to_payment_mode(inv.get("cash_bank_account") or "")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += inv["cash_paid"]
		mode_expense_map[mode]["count"] += 1

	expense_breakdown = sorted(mode_expense_map.values(), key=lambda x: x["total"], reverse=True)
	total_expenses = sum(b["total"] for b in expense_breakdown)

	# ---- PAYMENT ENTRIES OVERVIEW ----
	# All submitted Payment Entries for the day — Receive (collections) and Pay (disbursements)
	pe_all = frappe.db.sql("""
		SELECT
			pe.name,
			pe.payment_type,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			COALESCE(pe.party_name, '') AS party_name,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			COALESCE(pe.reference_no, '') AS reference_no
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.payment_type DESC, pe.creation ASC
	""", (report_date,), as_dict=True)

	pe_receive = [p for p in pe_all if p["payment_type"] == "Receive"]
	pe_pay_all = [p for p in pe_all if p["payment_type"] == "Pay"]

	total_pe_received = sum(float(p["amount"] or 0) for p in pe_receive)
	total_pe_paid = sum(float(p["amount"] or 0) for p in pe_pay_all)
	net_pe_cash = total_pe_received - total_pe_paid

	def _mode_breakdown(entries):
		m = {}
		for p in entries:
			mode = p.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(p.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	pe_receive_by_mode = _mode_breakdown(pe_receive)
	pe_pay_by_mode = _mode_breakdown(pe_pay_all)

	# Split outgoing PEs: Purchases (Supplier) vs Operating (everything else)
	pe_purchases = [p for p in pe_pay_all if p.get("party_type") == "Supplier"]
	pe_operating = [p for p in pe_pay_all if p.get("party_type") != "Supplier"]
	total_pe_purchases = sum(float(p["amount"] or 0) for p in pe_purchases)
	total_pe_operating = sum(float(p["amount"] or 0) for p in pe_operating)
	pe_purchases_by_mode = _mode_breakdown(pe_purchases)
	pe_operating_by_mode = _mode_breakdown(pe_operating)

	# ---- CUSTOMER COLLECTIONS (PE Receive against credit Sales Invoices) ----
	pe_customer_collections = []
	# Settlements of invoices posted on the report date itself: the paid portion of
	# today's invoices is already captured by the sales figure (grand_total − outstanding),
	# so counting the same-day payment here as a "collection" would double-count it. But
	# that payment's mode is otherwise invisible — a non-POS invoice has no `Sales Invoice
	# Payment` row, and a POS invoice topped up later the same day only has its initial
	# partial payment there — so the mode-of-payment breakdown still needs to see it even
	# though total_customer_collections must not.
	same_period_settlements = []
	for p in pe_receive:
		if p.get("party_type") == "Customer":
			# Check if this PE references a Sales Invoice
			refs = frappe.db.sql("""
				SELECT per.reference_name, per.allocated_amount, si.posting_date
				FROM `tabPayment Entry Reference` per INNER JOIN `tabSales Invoice` si ON si.name = per.reference_name
				WHERE per.parent = %s AND per.reference_doctype = 'Sales Invoice'
			""", (p["name"],), as_dict=True)
			if refs:
				for ref in refs:
					if ref["posting_date"] and frappe.utils.getdate(ref["posting_date"]) >= frappe.utils.getdate(report_date):
						same_period_settlements.append({
							"mode_of_payment": p.get("mode_of_payment") or "",
							"amount": float(ref["allocated_amount"] or 0),
						})
						continue
					pe_customer_collections.append({
						"pe_name": p["name"],
						"customer": p.get("party") or "",
						"customer_name": p.get("party_name") or p.get("party") or "",
						"invoice": ref["reference_name"],
						"amount": float(ref["allocated_amount"] or 0),
						"mode_of_payment": p.get("mode_of_payment") or "",
					})
			else:
				# No explicit invoice references (on-account/customer collection).
				# Count this as collection so income stream reflects actual cash received.
				pe_customer_collections.append({
					"pe_name": p["name"],
					"customer": p.get("party") or "",
					"customer_name": p.get("party_name") or p.get("party") or "",
					"invoice": "",
					"amount": float(p.get("amount") or 0),
					"mode_of_payment": p.get("mode_of_payment") or "",
				})
	total_customer_collections = sum(c["amount"] for c in pe_customer_collections)

	# PE Receives from non-Customer parties (owner deposits, employee advance returns,
	# supplier refunds received via PE, etc.) — genuine cash in, but not "collections".
	pe_other_receipts  = [p for p in pe_receive if p.get("party_type") != "Customer"]
	total_other_receipts = sum(float(p.get("amount") or 0) for p in pe_other_receipts)

	# ---- CREDIT INVOICES FOR THE DAY ----
	# Credit Sales Invoices: submitted today, still outstanding AS OF today's report date.
	# `outstanding_amount` is a live, mutable field: a payment, write-off, or credit note
	# posted on a LATER day retroactively shrinks it. Trusting it here would silently
	# understate today's still-owed figure (inflating today's Total Income) AND
	# double-count the same cash — once here (the invoice now looks paid) and again on
	# whatever later day actually collects it. Reconstruct the balance as of `report_date`
	# instead, from the documents that actually settle an invoice's receivable balance:
	#   - Sales Invoice Payment (immediate POS payment, always same-day as the invoice)
	#   - Payment Entry Reference (works for both single- and multi-invoice reconciliations
	#     — GL Entry.against_voucher is NOT reliable here: a Payment Entry that settles
	#     several invoices in one go posts ONE lump Debtors GL line with no per-invoice
	#     link, and some single-invoice PEs also carry an extra unlinked leftover line)
	#   - Journal Entry Account (write-offs / corrections — GL Entry.against_voucher is
	#     NEVER populated for Journal-Entry-sourced postings, only the source document row)
	#   - Return invoices explicitly reconciled against this invoice, read from the GL: a
	#     return's own Debtors line posted with against_voucher = this invoice (not
	#     itself) — a return merely referencing this invoice via return_against without
	#     such a GL linkage settled independently and must NOT be netted out here.
	# This combination was validated against every historical invoice in this system: it
	# reproduces the live `outstanding_amount` field exactly, present-day, for all but two
	# invoices (off by 0.02-0.04 BHD of float rounding).
	credit_candidate_invoices = frappe.db.sql("""
		SELECT si.name, si.customer, si.grand_total,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.posting_date = %s
	""", (report_date,), as_dict=True)

	credit_sales_invoices = []
	total_credit_sales = 0.0
	# Sum of Journal-Entry write-offs applying to invoices posted THIS report date (see
	# je_map below) — a write-off reduces the reconstructed balance above just like a
	# real payment, but no cash actually moved and it has no mode_of_payment, so it never
	# appears in any income-mode-breakdown component. Netted out of total_income
	# client-side (mirrors how cash_refunded_returns is netted out for real cash refunds),
	# or Total Income would silently count non-cash write-offs as collected revenue.
	total_written_off = 0.0
	if credit_candidate_invoices:
		cci_names = [inv["name"] for inv in credit_candidate_invoices]
		cci_ph = ", ".join(["%s"] * len(cci_names))

		sip_rows = frappe.db.sql(
			f"""SELECT parent, SUM(amount) AS t FROM `tabSales Invoice Payment`
			WHERE parent IN ({cci_ph}) GROUP BY parent""",
			tuple(cci_names), as_dict=True,
		)
		sip_map = {r["parent"]: float(r["t"] or 0) for r in sip_rows}

		pe_rows = frappe.db.sql(
			f"""SELECT per.reference_name AS invoice, SUM(per.allocated_amount) AS t
			FROM `tabPayment Entry Reference` per
			INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
			WHERE per.reference_doctype = 'Sales Invoice' AND per.reference_name IN ({cci_ph})
				AND pe.docstatus = 1 AND pe.posting_date <= %s
			GROUP BY per.reference_name""",
			tuple(cci_names + [report_date]), as_dict=True,
		)
		pe_map = {r["invoice"]: float(r["t"] or 0) for r in pe_rows}

		je_rows = frappe.db.sql(
			f"""SELECT jea.reference_name AS invoice,
				SUM(jea.credit_in_account_currency - jea.debit_in_account_currency) AS t
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON je.name = jea.parent
			WHERE jea.reference_type = 'Sales Invoice' AND jea.reference_name IN ({cci_ph})
				AND je.docstatus = 1 AND je.posting_date <= %s
			GROUP BY jea.reference_name""",
			tuple(cci_names + [report_date]), as_dict=True,
		)
		je_map = {r["invoice"]: float(r["t"] or 0) for r in je_rows}
		total_written_off = sum(je_map.values())

		return_rows = frappe.db.sql(
			f"""SELECT gle.against_voucher AS invoice, SUM(gle.credit - gle.debit) AS t
			FROM `tabGL Entry` gle
			WHERE gle.voucher_type = 'Sales Invoice'
				AND gle.against_voucher_type = 'Sales Invoice'
				AND gle.against_voucher IN ({cci_ph})
				AND gle.voucher_no != gle.against_voucher
				AND gle.docstatus = 1 AND gle.is_cancelled = 0
				AND gle.posting_date <= %s
			GROUP BY gle.against_voucher""",
			tuple(cci_names + [report_date]), as_dict=True,
		)
		return_map = {r["invoice"]: float(r["t"] or 0) for r in return_rows}

		for inv in credit_candidate_invoices:
			balance = (
				float(inv["grand_total"])
				- sip_map.get(inv["name"], 0.0)
				- pe_map.get(inv["name"], 0.0)
				- je_map.get(inv["name"], 0.0)
				- return_map.get(inv["name"], 0.0)
			)
			if balance > 0.0009:
				credit_sales_invoices.append({
					"name": inv["name"],
					"customer": inv["customer"],
					"grand_total": inv["grand_total"],
					"outstanding_amount": balance,
					"customer_name": inv["customer_name"],
				})
		credit_sales_invoices.sort(key=lambda x: x["outstanding_amount"], reverse=True)
		total_credit_sales = sum(inv["outstanding_amount"] for inv in credit_sales_invoices)

	# Credit Purchase Invoices: submitted today, outstanding > 0
	credit_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.outstanding_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s
			AND pi.outstanding_amount > 0
		ORDER BY pi.outstanding_amount DESC
	""", (report_date,), as_dict=True)
	total_credit_purchases = sum(float(inv["outstanding_amount"] or 0) for inv in credit_purchase_invoices)

	# ---- GL-BASED CASH POSITION (ground truth — same source as the "Day Report") ----
	# Query all leaf cash/bank accounts for the company, then sum their GL movements.
	# This captures every voucher type (PE, JE, PI, SI, POS) without reconstruction bugs.
	# We also UNION in every Mode of Payment account: such an account is a cash/settlement
	# account by definition, so it must be in the cash position even if its account_type
	# field was left blank (otherwise that payment mode's cash flow goes uncounted).
	cash_bank_accounts = frappe.db.sql("""
		SELECT name FROM `tabAccount`
		WHERE is_group = 0
		  AND company = %s
		  AND (account_type IN ('Cash', 'Bank') OR name IN (
		        SELECT mopa.default_account
		        FROM `tabMode of Payment Account` mopa
		        WHERE mopa.default_account IS NOT NULL AND mopa.default_account != ''
		  ))
	""", (default_company,), pluck="name")

	gl_total_cash_in  = 0.0
	gl_total_cash_out = 0.0
	gl_account_summary = []

	if cash_bank_accounts:
		cb_ph = ", ".join(["%s"] * len(cash_bank_accounts))
		gl_rows = frappe.db.sql(
			f"""SELECT
				gle.account,
				SUM(gle.debit)  AS total_debit,
				SUM(gle.credit) AS total_credit
			FROM `tabGL Entry` gle
			WHERE gle.posting_date = %s
			  AND gle.docstatus = 1
			  AND gle.is_cancelled = 0
			  AND gle.account IN ({cb_ph})
			GROUP BY gle.account
			ORDER BY (SUM(gle.debit) + SUM(gle.credit)) DESC""",
			tuple([report_date] + list(cash_bank_accounts)),
			as_dict=True,
		)
		for row in gl_rows:
			d = float(row.get("total_debit")  or 0)
			c = float(row.get("total_credit") or 0)
			gl_total_cash_in  += d
			gl_total_cash_out += c
			gl_account_summary.append({
				"account":      row["account"],
				"total_debit":  d,
				"total_credit": c,
				"net":          d - c,
			})

	# Aggregate per-account GL into a per-mode summary.
	# This covers ALL voucher types — PE Internal Transfer, SI returns, JE corrections,
	# anything — without any document-level reconstruction gaps.
	_gl_mode_map: dict = {}
	for _row in gl_account_summary:
		_mode = account_to_mode.get(_row["account"]) or _row["account"]
		if _mode not in _gl_mode_map:
			_gl_mode_map[_mode] = {"mode_of_payment": _mode, "total_debit": 0.0, "total_credit": 0.0, "net": 0.0}
		_gl_mode_map[_mode]["total_debit"]  += _row["total_debit"]
		_gl_mode_map[_mode]["total_credit"] += _row["total_credit"]
		_gl_mode_map[_mode]["net"]          += _row["net"]
	gl_mode_summary = sorted(
		_gl_mode_map.values(),
		key=lambda x: abs(x["total_debit"] + x["total_credit"]),
		reverse=True,
	)

	# ---- INTERNAL TRANSFERS (cash ↔ cash) ----
	# Vouchers that only move money between the shop's own cash/bank accounts are
	# neither income nor expense (e.g. the EOD float: Dr HO CASH / Cr AUB, or the till
	# being topped up from head-office cash). They show up in the raw GL totals on both
	# sides and inflate them. We identify these so the KPI cards and the per-mode table
	# reflect EXTERNAL cash flow only, while still surfacing the transfers for audit.
	cash_bank_set = set(cash_bank_accounts)
	transfer_mode_in:  dict = {}   # mode -> cash that entered it via a transfer
	transfer_mode_out: dict = {}   # mode -> cash that left it via a transfer
	internal_transfers = []
	gl_transfer_total = 0.0
	if cash_bank_set:
		# JEs whose EVERY posting line hits a cash/bank account = pure internal transfer
		_je_lines = frappe.db.sql(
			"""SELECT jea.parent AS je, jea.account,
				jea.debit_in_account_currency  AS dr,
				jea.credit_in_account_currency AS cr
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1 AND je.posting_date = %s""",
			(report_date,), as_dict=True
		)
		_by_je: dict = {}
		for _l in _je_lines:
			_by_je.setdefault(_l["je"], []).append(_l)
		for _je, _lines in _by_je.items():
			if not _lines or not all(l["account"] in cash_bank_set for l in _lines):
				continue
			for _l in _lines:
				_mode = account_to_mode.get(_l["account"], _l["account"])
				_cr = float(_l["cr"] or 0)
				_dr = float(_l["dr"] or 0)
				if _cr > 0:
					transfer_mode_out[_mode] = transfer_mode_out.get(_mode, 0.0) + _cr
					gl_transfer_total += _cr
				if _dr > 0:
					transfer_mode_in[_mode] = transfer_mode_in.get(_mode, 0.0) + _dr
			_outs = [l for l in _lines if float(l["cr"] or 0) > 0]
			_ins  = [l for l in _lines if float(l["dr"] or 0) > 0]
			internal_transfers.append({
				"voucher": _je,
				"from": ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _outs),
				"to":   ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _ins),
				"amount": sum(float(l["cr"] or 0) for l in _outs),
			})
		# Payment Entries explicitly typed as Internal Transfer between two cash/bank accts
		_pe_xfers = frappe.db.sql(
			"""SELECT name, paid_from, paid_to, paid_amount
			FROM `tabPayment Entry`
			WHERE docstatus = 1 AND posting_date = %s AND payment_type = 'Internal Transfer'""",
			(report_date,), as_dict=True
		)
		for _t in _pe_xfers:
			if _t["paid_from"] in cash_bank_set and _t["paid_to"] in cash_bank_set:
				_om = account_to_mode.get(_t["paid_from"], _t["paid_from"])
				_im = account_to_mode.get(_t["paid_to"], _t["paid_to"])
				_amt = float(_t["paid_amount"] or 0)
				transfer_mode_out[_om] = transfer_mode_out.get(_om, 0.0) + _amt
				transfer_mode_in[_im]  = transfer_mode_in.get(_im, 0.0) + _amt
				gl_transfer_total += _amt
				internal_transfers.append({"voucher": _t["name"], "from": _om, "to": _im, "amount": _amt})

	# External (non-transfer) cash flow — what the KPI cards should show
	gl_external_cash_in  = gl_total_cash_in  - gl_transfer_total
	gl_external_cash_out = gl_total_cash_out - gl_transfer_total

	# Strip internal transfers out of the per-mode table so its gross totals stop
	# inflating; drop any mode that becomes entirely a transfer (nothing external left).
	_net_mode_summary = []
	for _m in gl_mode_summary:
		_md = _m["mode_of_payment"]
		_d = _m["total_debit"]  - transfer_mode_in.get(_md, 0.0)
		_c = _m["total_credit"] - transfer_mode_out.get(_md, 0.0)
		_d = _d if _d > 0.0001 else 0.0
		_c = _c if _c > 0.0001 else 0.0
		if _d == 0.0 and _c == 0.0:
			continue
		_net_mode_summary.append({
			"mode_of_payment": _md,
			"total_debit": _d,
			"total_credit": _c,
			"net": _d - _c,
		})
	gl_mode_summary = _net_mode_summary

	# Purchased items summary (for purchase-focused daily view)
	items_purchased = frappe.db.sql("""
		SELECT
			pii.item_code,
			pii.item_name,
			SUM(pii.qty) AS total_qty,
			CASE WHEN SUM(pii.qty) = 0 THEN 0 ELSE SUM(pii.amount) / SUM(pii.qty) END AS rate,
			SUM(pii.amount) AS total_amount
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pi.docstatus = 1
			AND pi.posting_date = %s
		GROUP BY pii.item_code, pii.item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- POS / SALES OVERVIEW SECTION ----

	# Fetch all submitted Sales Invoices for the date
	# We exclude invoices that are explicitly linked to a Repair Order (already counted above)
	# This ensures Repair + Sales = Total Revenue
	all_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.outstanding_amount, si.is_pos, si.is_return, si.owner, si.customer,
			si.dw_is_credit_sale, COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
			AND si.posting_date = %s
			AND ro.name IS NULL
	""", (report_date,), as_dict=True)

	# A POS credit sale has is_pos=0 (so core doesn't demand a payment row) but is
	# still a retail sale, not a B2B one — so it must count on the retail side here.
	total_retail_sales = sum(inv["grand_total"] for inv in all_sales_invoices if (inv["is_pos"] == 1 or inv["dw_is_credit_sale"] == 1) and inv["is_return"] == 0)
	total_b2b_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 0 and inv["dw_is_credit_sale"] != 1 and inv["is_return"] == 0)
	total_returns = sum(abs(inv["grand_total"]) for inv in all_sales_invoices if inv["is_return"] == 1)
	net_sales = (total_retail_sales + total_b2b_sales) - total_returns

	# Only the portion of a return actually refunded in cash should reduce collected
	# income; a credit note with no cash paid back (store credit, unsettled B2B
	# adjustment) has zero GL cash impact. Read this straight from the GL (credits on a
	# cash/bank account posted against the return voucher) rather than inferring it from
	# grand_total/outstanding_amount, so it is denominated in exactly the same figures
	# used below to adjust gl_external_cash_in/out — guaranteeing "Net Collected Income"
	# and the "Cash In" KPI reconcile exactly instead of merely being close.
	return_invoice_names = [inv["name"] for inv in all_sales_invoices if inv["is_return"] == 1]
	return_invoice_customers = {inv["name"]: (inv.get("customer_name") or inv.get("customer") or "") for inv in all_sales_invoices}
	cash_refunded_returns = 0.0
	cash_refunded_by_mode: dict = {}
	customer_refunds = []  # visible list, like internal_transfers: one row per refund voucher/mode
	if return_invoice_names and cash_bank_set:
		ri_ph = ", ".join(["%s"] * len(return_invoice_names))
		refund_gl_rows = frappe.db.sql(
			f"""SELECT gle.voucher_no, gle.account, SUM(gle.credit) AS amount
			FROM `tabGL Entry` gle
			WHERE gle.voucher_no IN ({ri_ph})
				AND gle.docstatus = 1
				AND gle.is_cancelled = 0
				AND gle.account IN ({cb_ph})
			GROUP BY gle.voucher_no, gle.account
			ORDER BY gle.voucher_no""",
			tuple(return_invoice_names + list(cash_bank_accounts)),
			as_dict=True,
		)
		for row in refund_gl_rows:
			amt = float(row.get("amount") or 0)
			if amt <= 0:
				continue
			mode = account_to_mode.get(row["account"], row["account"])
			cash_refunded_by_mode[mode] = cash_refunded_by_mode.get(mode, 0.0) + amt
			cash_refunded_returns += amt
			customer_refunds.append({
				"voucher": row["voucher_no"],
				"customer": return_invoice_customers.get(row["voucher_no"], ""),
				"mode_of_payment": mode,
				"amount": amt,
			})
	non_cash_returns = total_returns - cash_refunded_returns

	# Customer refunds are a return of previously collected income, not a new business
	# expense — net them out of both sides of the external GL totals (same treatment as
	# internal transfers above) so the KPI cards and per-mode table stay in the same
	# "external, collected-income" basis as the doc-based Total Income calc.
	gl_external_cash_in  -= cash_refunded_returns
	gl_external_cash_out -= cash_refunded_returns
	if cash_refunded_by_mode:
		_refund_adjusted_mode_summary = []
		for _m in gl_mode_summary:
			_md = _m["mode_of_payment"]
			_refund = cash_refunded_by_mode.get(_md, 0.0)
			_c = _m["total_credit"] - _refund
			_c = _c if _c > 0.0001 else 0.0
			_d = _m["total_debit"] - _refund
			_d = _d if _d > 0.0001 else 0.0
			if _d == 0.0 and _c == 0.0:
				continue
			_refund_adjusted_mode_summary.append({
				"mode_of_payment": _md,
				"total_debit": _d,
				"total_credit": _c,
				"net": _d - _c,
			})
		gl_mode_summary = _refund_adjusted_mode_summary

	transaction_count = len([inv for inv in all_sales_invoices if inv["is_return"] == 0])
	# Returns are excluded here: their refund is derived from the GL above
	# (cash_refunded_by_mode) instead, since a return's `Sales Invoice Payment` row is
	# not reliably negative (seen in production data with a positive-amount refund row)
	# — trusting that sign here would silently flip a refund into income.
	sales_inv_names = [inv["name"] for inv in all_sales_invoices if inv["is_return"] == 0]

	# Payment method breakdown for all general sales
	payment_breakdown = []
	sales_payment_modes = {}
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total, COUNT(DISTINCT parent) as txn_count "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_rows = frappe.db.sql(
			f"SELECT parent, GROUP_CONCAT(DISTINCT mode_of_payment ORDER BY mode_of_payment SEPARATOR ', ') AS payment_modes "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY parent",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_modes = {r["parent"]: (r.get("payment_modes") or "") for r in sales_payment_rows}

	# Items sold & Category Breakdown
	items_sold = []
	category_breakdown = []
	item_profit_summary = []
	item_group_profit_summary = []
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		# Detailed items
		items_sold = frappe.db.sql(
			f"SELECT item_code, item_name, SUM(qty) as total_qty, "
			f"CASE WHEN SUM(qty) = 0 THEN 0 ELSE SUM(amount) / SUM(qty) END as rate, "
			f"SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"AND IFNULL(dw_is_internal_line, 0) = 0 "
			f"GROUP BY item_code, item_name ORDER BY total_qty DESC",
			tuple(sales_inv_names), as_dict=True
		)
		# Categorical summary
		category_breakdown = frappe.db.sql(
			f"SELECT item_group, SUM(qty) as total_qty, SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"AND IFNULL(dw_is_internal_line, 0) = 0 "
			f"GROUP BY item_group ORDER BY total_amount DESC",
			tuple(sales_inv_names), as_dict=True
		)

	# Item-wise profit summary should include ALL submitted Sales Invoices for the day
	# (both standalone sales and repair-linked invoices).
	profit_invoice_names = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": report_date},
		pluck="name",
	)
	if profit_invoice_names:
		profit_placeholders = ", ".join(["%s"] * len(profit_invoice_names))
		has_last_purchase_rate = frappe.db.has_column("Item", "last_purchase_rate")
		last_purchase_component = ", NULLIF(i.last_purchase_rate, 0)" if has_last_purchase_rate else ""
		cogs_rate_expr = (
			"CASE WHEN i.is_stock_item = 1 "
			f"THEN COALESCE(NULLIF(sii.incoming_rate, 0), NULLIF(i.valuation_rate, 0){last_purchase_component}, 0) "
			"ELSE 0 END"
		)
		item_group_profit_summary = frappe.db.sql(
			f"""
			SELECT
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				SUM(sii.base_net_amount) AS sales_amount,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			  AND IFNULL(sii.dw_is_internal_line, 0) = 0
			GROUP BY COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

		item_profit_summary = frappe.db.sql(
			f"""
			SELECT
				sii.item_code,
				COALESCE(sii.item_name, sii.item_code) AS item_name,
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.base_net_amount) / SUM(sii.qty) END AS selling_rate,
				SUM(sii.base_net_amount) AS sales_amount,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.qty * {cogs_rate_expr}) / SUM(sii.qty) END AS cogs_rate,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			  AND IFNULL(sii.dw_is_internal_line, 0) = 0
			GROUP BY sii.item_code, sii.item_name, COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

	# Cashier / Staff Breakdown
	cashier_breakdown = []
	if all_sales_invoices:
		cashier_map = {}
		for inv in all_sales_invoices:
			owner = inv["owner"]
			if owner not in cashier_map:
				cashier_map[owner] = {"owner": owner, "total": 0.0, "count": 0}
			if inv["is_return"] == 0:
				cashier_map[owner]["total"] += float(inv["grand_total"])
				cashier_map[owner]["count"] += 1
			else:
				cashier_map[owner]["total"] -= float(abs(inv["grand_total"]))
		cashier_breakdown = sorted(cashier_map.values(), key=lambda x: x["total"], reverse=True)

	# Detailed sales and purchase entries for executive drill-down tables
	sales_entries = []
	for inv in all_sales_invoices:
		amount = float(inv.get("grand_total") or 0)
		outstanding = float(inv.get("outstanding_amount") or 0)
		if inv.get("is_return") == 1:
			payment_status = "Returned"
		elif outstanding <= 0:
			payment_status = "Paid"
		elif outstanding < amount:
			payment_status = "Partially Paid"
		else:
			payment_status = "Unpaid"

		sales_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("customer_name") or inv.get("customer") or "",
			"amount": amount,
			"payment_status": payment_status,
			"payment_mode": sales_payment_modes.get(inv.get("name"), "Credit" if outstanding > 0 else "N/A"),
			"source": "Sales Invoice",
		})

	purchase_entries = []
	for p in pe_purchases:
		purchase_entries.append({
			"id": p.get("name"),
			"party_name": p.get("party_name") or p.get("party") or "",
			"amount": float(p.get("amount") or 0),
			"payment_status": "Paid",
			"payment_mode": p.get("mode_of_payment") or "",
			"source": "Payment Entry",
		})

	for inv in credit_purchase_invoices:
		outstanding = float(inv.get("outstanding_amount") or 0)
		grand_total = float(inv.get("grand_total") or 0)
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": outstanding,
			"payment_status": "Partially Paid" if (grand_total > 0 and outstanding < grand_total) else "Unpaid",
			"payment_mode": "Credit",
			"source": "Purchase Invoice",
		})

	for inv in paid_purchase_invoices:
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": inv.get("cash_paid", float(inv.get("grand_total") or 0)),
			"payment_status": "Paid",
			"payment_mode": inv.get("cash_bank_account") or "Cash",
			"source": "Purchase Invoice",
		})

	# ---- PMS VAT SECTION ----
	# Collect PMS (Profit Margin Scheme) VAT data for the report date
	pms_vat_rows = frappe.db.sql("""
		SELECT
			si.name AS invoice,
			si.customer_name,
			sii.item_code,
			sii.item_name,
			sii.amount AS selling_price,
			sii.dw_pms_purchase_cost AS purchase_cost,
			sii.dw_pms_margin AS margin,
			sii.dw_pms_vat AS vat_amount
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
		WHERE si.docstatus = 1
		  AND si.dw_has_pms_items = 1
		  AND sii.dw_is_pms_item = 1
		  AND si.posting_date = %s
		ORDER BY si.name
	""", (report_date,), as_dict=True)
	pms_total_vat = sum(float(r.get("vat_amount") or 0) for r in pms_vat_rows)
	pms_total_sales = sum(float(r.get("selling_price") or 0) for r in pms_vat_rows)

	return {
		"date": report_date,
		"repair": {
			"received_count": len(received_orders),
			"received_orders": received_orders,
			"completed_count": len(completed_orders),
			"completed_orders": completed_orders,
			"pending_count": pending_count,
			"inprogress_count": inprogress_count,
			"revenue": repair_revenue,
			"invoice_count": repair_invoice_count,
			"technician_tasks": technician_tasks,
			"top_issues": top_issues,
			"parts_used": parts_used,
		},
		"pos": {
			"total_sales": total_retail_sales + total_b2b_sales,
			"total_retail_sales": total_retail_sales,
			"total_b2b_sales": total_b2b_sales,
			"total_returns": total_returns,
			"cash_refunded_returns": cash_refunded_returns,
			"non_cash_returns": non_cash_returns,
			"net_sales": net_sales,
			"transaction_count": transaction_count,
			"payment_breakdown": payment_breakdown,
			"items_sold": items_sold,
			"category_breakdown": category_breakdown,
			"cashier_breakdown": cashier_breakdown,
		},
		"pms": {
			"total_vat": pms_total_vat,
			"total_sales": pms_total_sales,
			"item_count": len(pms_vat_rows),
			"rows": pms_vat_rows if is_executive else [],
		},
		"financial": {
			"total_expenses": total_expenses,
			"expense_breakdown": expense_breakdown,
			"expense_entries": expense_entries,
			"repair_payment_breakdown": repair_payment_breakdown,
			# Payment Entries overview (Receive + Pay)
			"pe_entries": pe_all,
			"pe_receive": pe_receive,
			"pe_pay": pe_pay_all,
			"total_pe_received": total_pe_received,
			"total_pe_paid": total_pe_paid,
			"net_pe_cash": net_pe_cash,
			"pe_receive_by_mode": pe_receive_by_mode,
			"pe_pay_by_mode": pe_pay_by_mode,
			# Purchase vs Operating split
			"pe_purchases": pe_purchases,
			"pe_operating": pe_operating,
			"total_pe_purchases": total_pe_purchases,
			"total_pe_operating": total_pe_operating,
			"pe_purchases_by_mode": pe_purchases_by_mode,
			"pe_operating_by_mode": pe_operating_by_mode,
			# Journal Entry detail
			"je_entries": je_detail_rows,
			"je_count": je_count,
			"je_total": je_total,
			"je_by_mode": je_by_mode,
			# JE debits on cash/bank = cash received via JE
			# je_receipt_total / je_receipt_by_mode: external only (supplier refunds etc.) → adds to income
			# je_all_debits_by_mode: all JE debits including mode-corrections → used for per-mode table
			"je_receipts": je_receipt_rows,
			"je_receipt_total": je_receipt_total,
			"je_receipt_by_mode": je_receipt_by_mode,
			"je_all_debits_by_mode": je_all_debits_by_mode,
			# Customer collections against credit invoices
			"pe_customer_collections": pe_customer_collections,
			"total_customer_collections": total_customer_collections,
			# Same-day settlements of today's own invoices — excluded from
			# total_customer_collections (already in the sales figure) but needed for the
			# by-payment-mode income breakdown, since it's otherwise the only record of
			# that payment's mode.
			"same_period_settlements": same_period_settlements,
			# Non-Customer PE Receives (owner deposits, supplier refunds, etc.)
			"pe_other_receipts":    pe_other_receipts,
			"total_other_receipts": total_other_receipts,
			# Credit invoices
			"credit_sales_invoices": credit_sales_invoices,
			"total_credit_sales": total_credit_sales,
			# Non-cash Journal Entry write-offs applying to today's invoices — reduces what's
			# still owed (already reflected in total_credit_sales above) but is NOT collected
			# cash, so it must also be netted out of Total Income (see comment above).
			"total_written_off": total_written_off,
			"credit_purchase_invoices": credit_purchase_invoices,
			"total_credit_purchases": total_credit_purchases,
			"paid_purchase_invoices": paid_purchase_invoices,
			"total_paid_purchases": total_paid_purchases,
			"paid_purchases_by_mode": paid_purchases_by_mode,
			"items_purchased": items_purchased,
			"item_group_profit_summary": item_group_profit_summary if is_executive else [],
			"item_profit_summary": item_profit_summary if is_executive else [],
			"sales_entries": sales_entries,
			"purchase_entries": purchase_entries,
			# GL ground-truth cash position (matches "Day Report")
			"gl_total_cash_in":   gl_total_cash_in,
			"gl_total_cash_out":  gl_total_cash_out,
			"gl_net_cash":        gl_total_cash_in - gl_total_cash_out,
			"gl_account_summary": gl_account_summary,
			# External cash flow = GL totals minus internal (cash↔cash) transfers.
			# These drive the KPI cards so they reflect real income/expense, not float moves.
			"gl_external_cash_in":  gl_external_cash_in,
			"gl_external_cash_out": gl_external_cash_out,
			"gl_external_net_cash": gl_external_cash_in - gl_external_cash_out,
			"gl_transfer_total":    gl_transfer_total,
			"internal_transfers":   internal_transfers,
			# Customer cash refunds — netted out of gl_external_cash_in/out above (same
			# treatment as internal transfers: not new income, not a business expense) but
			# surfaced here for visibility, same pattern as the Internal Transfers table.
			"cash_refunded_returns": cash_refunded_returns,
			"cash_refunded_by_mode": cash_refunded_by_mode,
			"non_cash_returns":      non_cash_returns,
			"customer_refunds":      customer_refunds,
			# GL aggregated by payment mode — used for S5 per-mode table (covers all voucher types)
			"gl_mode_summary":    gl_mode_summary,
		}
	}
