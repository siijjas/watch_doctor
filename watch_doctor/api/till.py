"""Point of sale (UI_REDESIGN_SPEC.md D9 / D10, B5.8).

Built on the existing POS invoice code in api/pos.py; adds what the till
screen needs: live totals from the real invoice (VAT, PMS margin VAT,
rounding), a discount kept as an amount, held sales that keep their edits,
and a reprint of the last receipt.
"""

import hashlib
import json

import frappe
from frappe.utils import cint, flt

from watch_doctor.api.pos import (
	_check_held_sale,
	_get_currency_precision,
	_parse_pos_options,
	_parse_pos_payments,
	_set_invoice_payments,
	build_pos_invoice,
)
from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, get_dw_roles, require_roles
from watch_doctor.pos_enhancements import build_pos_print_url


def _items(items_json):
	items = json.loads(items_json) if isinstance(items_json, str) else (items_json or [])
	return [i for i in items if i.get("item_code") and flt(i.get("qty")) > 0]


def _discount(discount, discount_type):
	"""(percent, amount) from what the cashier typed."""
	discount = flt(discount)
	if discount <= 0:
		return 0, 0
	if discount_type == "percent":
		return min(discount, 100), 0
	return 0, discount


def _hold_charge_lock(client_ref):
	"""Make a retried charge wait for the first attempt to finish.

	Without this, two requests with the same ref (a double tap, or a retry
	while the first is still running) both find no sale and both charge.
	The named lock lasts until this request's transaction ends; the commit
	after taking it starts a fresh snapshot, so the replay check then sees
	the sale the first request committed.
	"""
	key = "dw_till_charge:" + hashlib.sha1(client_ref.encode()).hexdigest()
	if not frappe.db.sql("SELECT GET_LOCK(%s, 30)", key)[0][0]:
		frappe.throw("This sale is still being charged on another request. Try again in a moment.")
	frappe.db.commit()

	def release():
		frappe.db.sql("SELECT RELEASE_LOCK(%s)", key)

	frappe.db.after_commit.add(release)
	frappe.db.after_rollback.add(release)


def _check_held(name):
	return _check_held_sale(name) if name else None


@frappe.whitelist()
def till_categories():
	"""Item groups that have stock, for the category chips."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	return frappe.db.sql(
		"""
		SELECT i.item_group AS name, COUNT(DISTINCT i.name) AS items
		FROM `tabItem` i INNER JOIN `tabBin` b ON b.item_code = i.name
		WHERE i.disabled = 0 AND i.is_stock_item = 1 AND b.actual_qty > 0
		GROUP BY i.item_group
		ORDER BY items DESC
		LIMIT 12
		""",
		as_dict=True,
	)


@frappe.whitelist()
def till_items(search: str = "", item_group: str = "", limit: int = 60):
	"""In-stock items for the till, optionally within one group."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.api.pos import get_pos_items

	rows = get_pos_items(search=search, limit=500 if item_group else limit, in_stock_only=1)
	if item_group:
		rows = [r for r in rows if r.get("item_group") == item_group][: int(limit)]
	return rows


@frappe.whitelist()
def till_preview(customer: str = "", items_json: str = "[]", discount: float = 0, discount_type: str = "amount", options_json=None):
	"""Totals the cart would be charged, from a real draft invoice that is rolled back.

	Also returns the PMS margin figures per line; purchase cost and margin
	only to an Executive.
	A cart that mixes PMS and standard items returns `mixed` instead of throwing,
	so the till can say so before anyone presses Pay.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = _items(items_json)
	if not items:
		return {"grand_total": 0, "net_total": 0, "taxes": 0, "discount": 0, "lines": [], "has_pms_items": 0}

	pms_codes, std_codes = _split_pms([i["item_code"] for i in items])
	if pms_codes and std_codes:
		return {"mixed": 1, "pms_items": pms_codes, "standard_items": std_codes}

	percent, amount = _discount(discount, discount_type)
	options = _parse_pos_options(options_json)
	show_cost = "executive" in get_dw_roles()
	frappe.db.savepoint("dw_till_preview")
	try:
		invoice, profile, has_pms = build_pos_invoice(customer, items, options, discount_percent=percent, discount_amount=amount)
		invoice.insert(ignore_permissions=True)
		# The PMS hook clears tax rows after totals are worked out; the next
		# save recalculates, so do the same here before reading them.
		invoice.calculate_taxes_and_totals()
		totals = {
			"net_total": flt(invoice.total),
			"taxes": flt(invoice.total_taxes_and_charges),
			"discount": flt(invoice.discount_amount),
			"grand_total": flt(invoice.rounded_total or invoice.grand_total),
			"has_pms_items": 1 if has_pms else 0,
			"pms_total_vat": flt(invoice.get("dw_pms_total_vat")),
			"receipt_format": invoice.get("dw_pos_receipt_format") or profile.get("default_receipt_format") or "",
			"lines": [
				{
					"item_code": row.item_code,
					"is_pms": cint(row.get("dw_is_pms_item")),
					"cost": flt(row.get("dw_pms_purchase_cost")) if show_cost else None,
					"margin": flt(row.get("dw_pms_margin")) if show_cost else None,
					"vat": flt(row.get("dw_pms_vat")),
				}
				for row in invoice.items
			],
		}
	finally:
		frappe.db.rollback(save_point="dw_till_preview")
		frappe.local.message_log = []
	return totals


def _split_pms(codes):
	from watch_doctor.pms import _is_pms_item
	pms = [c for c in codes if _is_pms_item(c)]
	return pms, [c for c in codes if c not in pms]


@frappe.whitelist()
def till_charge(
	customer: str = "",
	items_json: str = "[]",
	discount: float = 0,
	discount_type: str = "amount",
	payment_mode: str = "",
	payments_json: str = "",
	is_credit_sale: int = 0,
	due_date: str = "",
	options_json=None,
	held_name: str = "",
	client_ref: str = "",
):
	"""Charge the cart as it is on screen. A resumed held sale is charged with
	the cashier's edits and its draft removed (the old screen submitted the
	stored draft and lost the edits).

	`client_ref` makes the charge safe to retry: the till sends the same ref
	again after a dropped connection, and the sale already made is returned
	instead of charging twice."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	client_ref = (client_ref or "").strip()[:64]
	if client_ref:
		_hold_charge_lock(client_ref)
		done = frappe.db.get_value("Sales Invoice", {"remarks": f"till_ref:{client_ref}", "docstatus": 1}, "name")
		if done:
			return _charge_result(frappe.get_doc("Sales Invoice", done), replayed=True)
	items = _items(items_json)
	held_name = _check_held(held_name)
	is_credit_sale = cint(is_credit_sale)
	payments = [] if is_credit_sale else _parse_pos_payments(payments_json or None, payment_mode or "Cash")
	percent, amount = _discount(discount, discount_type)
	options = _parse_pos_options(options_json)

	invoice, profile, has_pms = build_pos_invoice(
		customer, items, options, discount_percent=percent, discount_amount=amount,
		is_credit_sale=is_credit_sale, due_date=due_date,
	)
	if client_ref:
		invoice.remarks = f"till_ref:{client_ref}"
	invoice.insert(ignore_permissions=True)
	if not is_credit_sale:
		_set_invoice_payments(invoice, payments, _get_currency_precision(invoice.company))
	invoice.save(ignore_permissions=True)
	invoice.submit()

	if held_name:
		frappe.delete_doc("Sales Invoice", held_name, ignore_permissions=True, force=True)

	return _charge_result(invoice, profile=profile)


def _charge_result(invoice, profile=None, replayed=False):
	from watch_doctor.pos_enhancements import get_pos_profile_settings

	profile = profile or get_pos_profile_settings(invoice.company, invoice.get("dw_pos_profile") or None)
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"rounded_total": invoice.rounded_total or invoice.grand_total,
		"outstanding_amount": invoice.outstanding_amount,
		"is_credit_sale": cint(invoice.get("dw_is_credit_sale")),
		"has_pms_items": cint(invoice.get("dw_has_pms_items")),
		"auto_print": cint(profile.get("auto_print")),
		"print_format": invoice.get("dw_pos_receipt_format") or "",
		"print_url": build_pos_print_url(invoice, profile),
		"replayed": 1 if replayed else 0,
	}


@frappe.whitelist()
def till_hold(customer: str = "", items_json: str = "[]", discount: float = 0, discount_type: str = "amount", options_json=None, held_name: str = ""):
	"""Hold the cart as a draft; holding a resumed sale updates the same draft."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = _items(items_json)
	held_name = _check_held(held_name)
	percent, amount = _discount(discount, discount_type)
	options = _parse_pos_options(options_json)
	invoice, _profile, _pms = build_pos_invoice(customer, items, options, discount_percent=percent, discount_amount=amount, is_draft=True)

	if held_name:
		existing = frappe.get_doc("Sales Invoice", held_name)
		existing.flags.ignore_permissions = True
		for field in ("customer", "taxes_and_charges", "additional_discount_percentage", "discount_amount", "apply_discount_on",
				"dw_pos_profile", "dw_pos_sales_person", "dw_pos_commission_rate", "naming_series", "dw_pos_receipt_format"):
			existing.set(field, invoice.get(field))
		existing.set("items", [row.as_dict() for row in invoice.items])
		existing.set("taxes", [row.as_dict() for row in invoice.taxes])
		existing.set("sales_team", [row.as_dict() for row in invoice.sales_team])
		existing.save(ignore_permissions=True)
		return {"held_name": existing.name, "grand_total": existing.grand_total}

	invoice.insert(ignore_permissions=True)
	return {"held_name": invoice.name, "grand_total": invoice.grand_total}


@frappe.whitelist()
def till_held():
	"""Held retail sales (never repair invoice drafts), newest first."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	rows = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 0, "is_pos": 1, "dw_pos_profile": ["is", "set"]},
		fields=["name", "customer", "customer_name", "grand_total", "owner", "modified"],
		order_by="modified desc",
		limit_page_length=50,
	)
	if rows:
		lines = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": ["in", [r.name for r in rows]]},
			fields=["parent", "item_name", "qty"],
			order_by="idx asc",
		)
		by_parent = {}
		for line in lines:
			by_parent.setdefault(line.parent, []).append(f"{flt(line.qty):g} × {line.item_name}" if flt(line.qty) != 1 else line.item_name)
		names = dict(frappe.get_all("User", filters={"name": ["in", list({r.owner for r in rows})]}, fields=["name", "full_name"], as_list=True))
		for r in rows:
			r.items = by_parent.get(r.name, [])
			r.by = names.get(r.owner) or r.owner
	return rows


@frappe.whitelist()
def till_load(held_name: str):
	"""A held sale back into the cart, with what the till needs per line."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	_check_held(held_name)
	invoice = frappe.get_doc("Sales Invoice", held_name)
	from watch_doctor.pms import _is_pms_item
	codes = [row.item_code for row in invoice.items]
	stock = dict(frappe.db.sql(
		"SELECT item_code, SUM(actual_qty) FROM `tabBin` WHERE item_code IN %(c)s GROUP BY item_code", {"c": tuple(codes)}
	)) if codes else {}
	return {
		"held_name": invoice.name,
		"customer": invoice.customer,
		"customer_name": invoice.customer_name,
		"discount_amount": flt(invoice.discount_amount) if not flt(invoice.additional_discount_percentage) else 0,
		"discount_percent": flt(invoice.additional_discount_percentage),
		"items": [
			{
				"item_code": row.item_code,
				"item_name": row.item_name,
				"qty": flt(row.qty),
				"rate": flt(row.rate),
				"standard_rate": flt(frappe.db.get_value("Item", row.item_code, "standard_rate")),
				"stock_qty": flt(stock.get(row.item_code)),
				"is_pms": 1 if _is_pms_item(row.item_code) else 0,
			}
			for row in invoice.items
		],
		"options": {
			"pos_profile": invoice.get("dw_pos_profile") or "",
			"sales_person": invoice.get("dw_pos_sales_person") or "",
			"commission_rate": flt(invoice.get("dw_pos_commission_rate")),
		},
	}


@frappe.whitelist()
def till_last_receipt():
	"""The last retail sale this user charged, for "Reprint last"."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	row = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "owner": frappe.session.user, "dw_pos_profile": ["is", "set"], "is_return": 0},
		fields=["name", "grand_total", "customer_name", "posting_date", "dw_pos_receipt_format", "dw_has_pms_items"],
		order_by="creation desc",
		limit_page_length=1,
	)
	if not row:
		return None
	r = row[0]
	from urllib.parse import quote
	fmt = r.dw_pos_receipt_format or ""
	r.print_url = f"/printview?doctype=Sales%20Invoice&name={quote(r.name)}&format={quote(fmt)}&no_letterhead=1" if fmt else ""
	return r


@frappe.whitelist()
def till_collect(invoice_name: str, mode_of_payment: str, amount: float, reference: str = ""):
	"""Payment against any unpaid invoice, with an optional card slip / transfer reference."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.api.pos import collect_pos_payment

	result = collect_pos_payment(invoice_name, mode_of_payment, amount)
	if reference and reference.strip():
		frappe.db.set_value("Payment Entry", result["payment_entry"], "reference_no", reference.strip()[:140])
		frappe.db.commit()
	return result


@frappe.whitelist()
def till_return_details(invoice_name: str):
	"""Returnable lines plus how the customer originally paid, so the refund
	mode defaults to it."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.api.pos import get_pos_invoice_return_items

	detail = get_pos_invoice_return_items(invoice_name)
	modes = frappe.get_all(
		"Sales Invoice Payment", filters={"parent": invoice_name, "amount": [">", 0]}, pluck="mode_of_payment", order_by="idx asc"
	)
	if not modes:
		modes = frappe.db.sql_list(
			"""
			SELECT DISTINCT pe.mode_of_payment FROM `tabPayment Entry Reference` r
			INNER JOIN `tabPayment Entry` pe ON pe.name = r.parent
			WHERE r.reference_doctype = 'Sales Invoice' AND r.reference_name = %s AND pe.docstatus = 1
			""",
			invoice_name,
		)
	detail["paid_modes"] = [m for m in modes if m]
	detail["has_pms_items"] = cint(frappe.db.get_value("Sales Invoice", invoice_name, "dw_has_pms_items"))
	return detail
