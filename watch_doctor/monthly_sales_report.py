"""
Monthly Sales Report — the daily "Sales & Purchase" report's sales/purchase mix
(see get_daily_report's `pos` + `financial` sections in api.py), aggregated across
an arbitrary date range instead of a single day.

Item-level "items sold" / "items purchased" lists are intentionally omitted: for a
whole month they run into hundreds of rows and stop being useful on screen or in
print. Invoice-level detail is capped to the TOP_N highest-value sales and purchase
invoices, with a separate (uncapped) "unpaid" list for each side so nothing owed
gets hidden behind the value cutoff.
"""

import frappe

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE

TOP_N = 20


def _mode_breakdown(entries):
	m = {}
	for p in entries:
		mode = p.get("mode_of_payment") or "Other"
		if mode not in m:
			m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		m[mode]["total"] += float(p.get("amount") or 0)
		m[mode]["count"] += 1
	return sorted(m.values(), key=lambda x: x["total"], reverse=True)


def _invoice_status(grand_total, outstanding):
	amount = float(grand_total or 0)
	outstanding = float(outstanding or 0)
	if outstanding <= 0:
		return "Paid"
	if outstanding < amount:
		return "Partially Paid"
	return "Unpaid"


@frappe.whitelist()
def get_monthly_sales_report(from_date, to_date):
	"""Aggregate the daily Sales & Purchase report's sales/purchase mix across
	[from_date, to_date]."""
	require_roles(ROLE_EXECUTIVE)

	default_company = frappe.defaults.get_defaults().get("company")

	mode_account_rows = frappe.db.sql(
		"""SELECT mopa.default_account, mop.name AS mode_of_payment
		FROM `tabMode of Payment Account` mopa
		INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
		WHERE (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
		(default_company or "",),
		as_dict=True,
	)
	account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}

	def _account_to_payment_mode(acct):
		return account_to_mode.get(acct) or acct or "Cash"

	# ---- POS / SALES ----
	all_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.outstanding_amount, si.is_pos, si.is_return, si.owner, si.customer,
			si.dw_is_credit_sale, COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
			AND si.posting_date BETWEEN %s AND %s
			AND ro.name IS NULL
	""", (from_date, to_date), as_dict=True)

	# A POS credit sale has is_pos=0 (so core doesn't demand a payment row) but is
	# still a retail sale, not a B2B one — so it must count on the retail side here.
	total_retail_sales = sum(inv["grand_total"] for inv in all_sales_invoices if (inv["is_pos"] == 1 or inv["dw_is_credit_sale"] == 1) and inv["is_return"] == 0)
	total_b2b_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 0 and inv["dw_is_credit_sale"] != 1 and inv["is_return"] == 0)
	total_returns = sum(abs(inv["grand_total"]) for inv in all_sales_invoices if inv["is_return"] == 1)
	net_sales = (total_retail_sales + total_b2b_sales) - total_returns
	transaction_count = len([inv for inv in all_sales_invoices if inv["is_return"] == 0])
	sales_inv_names = [inv["name"] for inv in all_sales_invoices]

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

	category_breakdown = []
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		category_breakdown = frappe.db.sql(
			f"SELECT item_group, SUM(qty) as total_qty, SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"AND IFNULL(dw_is_internal_line, 0) = 0 "
			f"GROUP BY item_group ORDER BY total_amount DESC",
			tuple(sales_inv_names), as_dict=True
		)

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

	nonreturn_invoices = [inv for inv in all_sales_invoices if inv["is_return"] == 0]

	top_sales_invoices = sorted(nonreturn_invoices, key=lambda i: float(i["grand_total"] or 0), reverse=True)[:TOP_N]
	top_sales_invoices = [{
		"name": inv["name"],
		"party_name": inv.get("customer_name") or inv.get("customer") or "",
		"amount": float(inv["grand_total"] or 0),
		"payment_status": _invoice_status(inv["grand_total"], inv["outstanding_amount"]),
		"payment_mode": sales_payment_modes.get(inv["name"]) or ("Credit" if float(inv.get("outstanding_amount") or 0) > 0 else "N/A"),
	} for inv in top_sales_invoices]

	unpaid_sales_rows = sorted(
		[inv for inv in nonreturn_invoices if float(inv.get("outstanding_amount") or 0) > 0],
		key=lambda i: float(i["outstanding_amount"] or 0), reverse=True,
	)
	unpaid_sales_invoices = [{
		"name": inv["name"],
		"party_name": inv.get("customer_name") or inv.get("customer") or "",
		"grand_total": float(inv["grand_total"] or 0),
		"outstanding_amount": float(inv["outstanding_amount"] or 0),
	} for inv in unpaid_sales_rows]
	total_unpaid_sales = sum(r["outstanding_amount"] for r in unpaid_sales_invoices)

	# ---- PURCHASES ----
	pe_purchases = frappe.db.sql("""
		SELECT pe.name, pe.mode_of_payment, pe.party_type, pe.party,
			COALESCE(pe.party_name, '') AS party_name,
			pe.paid_amount AS amount, COALESCE(pe.remarks, '') AS remarks
		FROM `tabPayment Entry` pe
		WHERE pe.payment_type = 'Pay' AND pe.docstatus = 1
			AND pe.posting_date BETWEEN %s AND %s
			AND pe.party_type = 'Supplier'
		ORDER BY pe.creation ASC
	""", (from_date, to_date), as_dict=True)
	total_pe_purchases = sum(float(p["amount"] or 0) for p in pe_purchases)
	pe_purchases_by_mode = _mode_breakdown(pe_purchases)

	paid_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.paid_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name,
			COALESCE(pi.cash_bank_account, '') AS cash_bank_account
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s AND pi.is_paid = 1
		ORDER BY pi.grand_total DESC
	""", (from_date, to_date), as_dict=True)
	for inv in paid_purchase_invoices:
		pa = inv.get("paid_amount")
		inv["cash_paid"] = float(pa if pa not in (None, 0) else (inv.get("grand_total") or 0))
	total_paid_purchases = sum(inv["cash_paid"] for inv in paid_purchase_invoices)

	paid_purchases_mode_map = {}
	for inv in paid_purchase_invoices:
		mode = _account_to_payment_mode(inv.get("cash_bank_account") or "")
		if mode not in paid_purchases_mode_map:
			paid_purchases_mode_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		paid_purchases_mode_map[mode]["total"] += inv["cash_paid"]
		paid_purchases_mode_map[mode]["count"] += 1
	paid_purchases_by_mode = sorted(paid_purchases_mode_map.values(), key=lambda x: x["total"], reverse=True)

	all_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.outstanding_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
	""", (from_date, to_date), as_dict=True)

	top_purchase_invoices = sorted(all_purchase_invoices, key=lambda i: float(i["grand_total"] or 0), reverse=True)[:TOP_N]
	top_purchase_invoices = [{
		"name": inv["name"],
		"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
		"amount": float(inv["grand_total"] or 0),
		"payment_status": _invoice_status(inv["grand_total"], inv["outstanding_amount"]),
	} for inv in top_purchase_invoices]

	unpaid_purchase_rows = sorted(
		[inv for inv in all_purchase_invoices if float(inv.get("outstanding_amount") or 0) > 0],
		key=lambda i: float(i["outstanding_amount"] or 0), reverse=True,
	)
	unpaid_purchase_invoices = [{
		"name": inv["name"],
		"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
		"grand_total": float(inv["grand_total"] or 0),
		"outstanding_amount": float(inv["outstanding_amount"] or 0),
	} for inv in unpaid_purchase_rows]
	total_unpaid_purchases = sum(r["outstanding_amount"] for r in unpaid_purchase_invoices)

	return {
		"from_date": from_date,
		"to_date": to_date,
		"net_sales": net_sales,
		"total_retail_sales": total_retail_sales,
		"total_b2b_sales": total_b2b_sales,
		"total_returns": total_returns,
		"transaction_count": transaction_count,
		"payment_breakdown": payment_breakdown,
		"category_breakdown": category_breakdown,
		"cashier_breakdown": cashier_breakdown,
		"top_sales_invoices": top_sales_invoices,
		"unpaid_sales_invoices": unpaid_sales_invoices,
		"total_unpaid_sales": total_unpaid_sales,
		"total_pe_purchases": total_pe_purchases,
		"pe_purchases_by_mode": pe_purchases_by_mode,
		"total_paid_purchases": total_paid_purchases,
		"paid_purchases_by_mode": paid_purchases_by_mode,
		"top_purchase_invoices": top_purchase_invoices,
		"unpaid_purchase_invoices": unpaid_purchase_invoices,
		"total_unpaid_purchases": total_unpaid_purchases,
	}
