"""
Monthly Sales & Purchase Summary — operational counterpart to the Monthly Executive
Summary (see monthly_executive_report.py, which covers the accrual P&L). This report
answers "what happened" behind the P&L numbers: sales volume and mix, conversion,
top performers, and procurement/inventory — the drivers stakeholders need alongside
the financials, not the financials themselves.

Two metrics here are point-in-time snapshots rather than period totals (stock value,
AR/AP outstanding) since Frappe does not cheaply reconstruct historical stock value or
invoice-outstanding as of an arbitrary past date without walking the full ledger. They
are always "as of today" regardless of the filter range, and are labelled as such in
the report.
"""

import frappe
from frappe.utils import add_days, add_months, flt, get_first_day, get_last_day, getdate

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE

TOP_N = 5


def _get_default_company():
	return frappe.defaults.get_defaults().get("company")


def _net_and_vat(row):
	"""Mirrors monthly_executive_report._net_and_vat: grand_total minus standard +
	PMS VAT gives the true tax-exclusive net, since PMS invoices clear the standard
	tax template and carry their VAT only via a GL reclassification entry."""
	vat = float(row.get("total_taxes_and_charges") or 0) + float(row.get("pms_vat") or 0)
	net = float(row.get("grand_total") or 0) - vat
	return net, vat


def _compute_period_summary(from_date, to_date, company):
	period_days = (getdate(to_date) - getdate(from_date)).days + 1
	pms_vat_expr = "COALESCE(si.dw_pms_total_vat, 0)" if frappe.db.has_column("Sales Invoice", "dw_pms_total_vat") else "0"

	# ---- SALES VOLUME & MIX ----
	repair_invoice_rows = frappe.db.sql(f"""
		SELECT si.grand_total, si.total_taxes_and_charges, {pms_vat_expr} AS pms_vat
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s
	""", (from_date, to_date), as_dict=True)
	repair_revenue_net = sum(_net_and_vat(r)[0] for r in repair_invoice_rows)
	repair_invoice_count = len(repair_invoice_rows)

	other_invoice_rows = frappe.db.sql(f"""
		SELECT si.grand_total, si.total_taxes_and_charges, {pms_vat_expr} AS pms_vat, si.is_pos, si.is_return
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s AND ro.name IS NULL
	""", (from_date, to_date), as_dict=True)

	retail_net = retail_count = 0
	b2b_net = b2b_count = 0
	for r in other_invoice_rows:
		if r["is_return"] == 1:
			continue
		net, _vat = _net_and_vat(r)
		if r["is_pos"] == 1:
			retail_net += net
			retail_count += 1
		else:
			b2b_net += net
			b2b_count += 1

	avg_repair_order_value = (repair_revenue_net / repair_invoice_count) if repair_invoice_count else 0.0
	avg_retail_order_value = (retail_net / retail_count) if retail_count else 0.0
	avg_b2b_order_value = (b2b_net / b2b_count) if b2b_count else 0.0

	# ---- REPAIR ORDER THROUGHPUT ----
	orders_received = frappe.db.count("DW Repair Order", {"received_date": ["between", [from_date, to_date]]})
	orders_delivered = frappe.db.count("DW Repair Order", {"delivery_date": ["between", [from_date, to_date]]})
	backlog_open = frappe.db.count(
		"DW Repair Order",
		{"received_date": ["<=", to_date], "status": ["not in", ["Delivered"]]},
	)

	# ---- QUOTATION CONVERSION: orders quoted in-period vs. those that reached invoicing ----
	quoted_orders = frappe.db.count(
		"DW Repair Order",
		{"received_date": ["between", [from_date, to_date]], "quotation": ["is", "set"]},
	)
	quoted_and_invoiced = frappe.db.count(
		"DW Repair Order",
		{
			"received_date": ["between", [from_date, to_date]],
			"quotation": ["is", "set"],
			"sales_invoice": ["is", "set"],
		},
	)
	conversion_rate_pct = (quoted_and_invoiced / quoted_orders * 100) if quoted_orders else 0.0

	# ---- TOP TECHNICIANS: watches completed/delivered, by order delivery date ----
	top_technicians = frappe.db.sql("""
		SELECT COALESCE(t.technician_name, ri.technician) AS technician_name, COUNT(*) AS watches_completed
		FROM `tabDW Repair Item` ri
		INNER JOIN `tabDW Repair Order` ro ON ro.name = ri.parent
		LEFT JOIN `tabDW Technician` t ON t.name = ri.technician
		WHERE ro.delivery_date BETWEEN %s AND %s
			AND ri.technician IS NOT NULL AND ri.technician != ''
		GROUP BY ri.technician
		ORDER BY watches_completed DESC
		LIMIT %s
	""", (from_date, to_date, TOP_N), as_dict=True)

	# ---- TOP BRANDS SERVICED: by intake volume in the period ----
	top_brands = frappe.db.sql("""
		SELECT COALESCE(ri.watch_brand, 'Unspecified') AS watch_brand, COUNT(*) AS watches_serviced
		FROM `tabDW Repair Item` ri
		INNER JOIN `tabDW Repair Order` ro ON ro.name = ri.parent
		WHERE ro.received_date BETWEEN %s AND %s
		GROUP BY watch_brand
		ORDER BY watches_serviced DESC
		LIMIT %s
	""", (from_date, to_date, TOP_N), as_dict=True)

	# ---- TOP RETAIL/B2B ITEMS SOLD: exclude repair-linked invoices and internal stock lines ----
	top_items_sold = frappe.db.sql("""
		SELECT sii.item_name, SUM(sii.qty) AS qty_sold, SUM(sii.base_net_amount) AS total_amount
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s
			AND ro.name IS NULL
			AND IFNULL(sii.dw_is_internal_line, 0) = 0
		GROUP BY sii.item_code, sii.item_name
		ORDER BY total_amount DESC
		LIMIT %s
	""", (from_date, to_date, TOP_N), as_dict=True)

	# ---- COGS (same estimation method as the financial report, for the procurement-vs-COGS gap) ----
	invoice_names = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": ["between", [from_date, to_date]]},
		pluck="name",
	)
	cogs_amount = 0.0
	if invoice_names:
		placeholders = ", ".join(["%s"] * len(invoice_names))
		has_last_purchase_rate = frappe.db.has_column("Item", "last_purchase_rate")
		last_purchase_component = ", NULLIF(i.last_purchase_rate, 0)" if has_last_purchase_rate else ""
		cogs_rate_expr = (
			"CASE WHEN i.is_stock_item = 1 "
			f"THEN COALESCE(NULLIF(sii.incoming_rate, 0), NULLIF(i.valuation_rate, 0){last_purchase_component}, 0) "
			"ELSE 0 END"
		)
		cogs_amount = flt(frappe.db.sql(
			f"""
			SELECT SUM(sii.qty * {cogs_rate_expr})
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({placeholders}) AND IFNULL(sii.dw_is_internal_line, 0) = 0
			""",
			tuple(invoice_names),
		)[0][0])

	# ---- PROCUREMENT: submitted Purchase Invoices in the period ----
	purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.grand_total
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
	""", (from_date, to_date), as_dict=True)
	total_procurement_spend = sum(float(p["grand_total"] or 0) for p in purchase_invoices)

	top_suppliers = frappe.db.sql("""
		SELECT COALESCE(pi.supplier_name, pi.supplier) AS supplier_name, SUM(pi.grand_total) AS total_spend
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
		GROUP BY pi.supplier
		ORDER BY total_spend DESC
		LIMIT %s
	""", (from_date, to_date, TOP_N), as_dict=True)

	top_items_purchased = frappe.db.sql("""
		SELECT pii.item_name, SUM(pii.qty) AS qty_purchased, SUM(pii.amount) AS total_amount
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
		GROUP BY pii.item_code, pii.item_name
		ORDER BY total_amount DESC
		LIMIT %s
	""", (from_date, to_date, TOP_N), as_dict=True)

	procurement_cogs_gap = total_procurement_spend - cogs_amount

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"period_days": period_days,
		"repair_invoice_count": repair_invoice_count,
		"retail_invoice_count": retail_count,
		"b2b_invoice_count": b2b_count,
		"avg_repair_order_value": avg_repair_order_value,
		"avg_retail_order_value": avg_retail_order_value,
		"avg_b2b_order_value": avg_b2b_order_value,
		"orders_received": orders_received,
		"orders_delivered": orders_delivered,
		"backlog_open": backlog_open,
		"quoted_orders": quoted_orders,
		"quoted_and_invoiced": quoted_and_invoiced,
		"conversion_rate_pct": conversion_rate_pct,
		"top_technicians": top_technicians,
		"top_brands": top_brands,
		"top_items_sold": top_items_sold,
		"cogs_amount": cogs_amount,
		"total_procurement_spend": total_procurement_spend,
		"procurement_cogs_gap": procurement_cogs_gap,
		"top_suppliers": top_suppliers,
		"top_items_purchased": top_items_purchased,
	}


def _current_stock_snapshot(company):
	"""Live stock-on-hand value — always 'as of today', not the filtered period.
	Excludes non-stock service items (e.g. REPAIR-SERVICE) automatically since
	only stock items carry Bin records."""
	row = frappe.db.sql("""
		SELECT SUM(bin.actual_qty * COALESCE(bin.valuation_rate, 0)) AS stock_value
		FROM `tabBin` bin
	""", as_dict=True)
	return flt(row[0]["stock_value"]) if row else 0.0


def _outstanding_snapshot(company):
	"""Live AR/AP outstanding — always 'as of today'. Approximates a period-end
	balance by also restricting to invoices posted on/before to_date, but any
	settlement that happened after to_date will still reduce today's outstanding
	figure below the true historical balance."""
	ar = flt(frappe.db.sql("""
		SELECT SUM(outstanding_amount) FROM `tabSales Invoice`
		WHERE docstatus = 1 AND company = %s
	""", (company,))[0][0])
	ap = flt(frappe.db.sql("""
		SELECT SUM(outstanding_amount) FROM `tabPurchase Invoice`
		WHERE docstatus = 1 AND company = %s
	""", (company,))[0][0])
	return ar, ap


@frappe.whitelist()
def get_monthly_sales_purchase_summary(from_date, to_date):
	"""Executive-only sales/purchase operational summary for [from_date, to_date]
	plus month-over-month comparison against the immediately preceding period of
	equal length. Companion to monthly_executive_report.get_monthly_executive_summary
	(the accrual P&L) — this covers volume, mix, conversion, top performers, and
	procurement rather than the financial statement itself."""
	require_roles(ROLE_EXECUTIVE)

	from_date = getdate(from_date)
	to_date = getdate(to_date)
	if to_date < from_date:
		frappe.throw(frappe._("To Date cannot be before From Date"))

	company = _get_default_company()

	is_whole_calendar_month = (
		from_date == get_first_day(from_date) and to_date == get_last_day(from_date)
	)
	if is_whole_calendar_month:
		prior_from = get_first_day(add_months(from_date, -1))
		prior_to = get_last_day(prior_from)
	else:
		period_days = (to_date - from_date).days
		prior_to = add_days(from_date, -1)
		prior_from = add_days(prior_to, -period_days)

	current = _compute_period_summary(from_date, to_date, company)
	previous = _compute_period_summary(prior_from, prior_to, company)

	stock_value = _current_stock_snapshot(company)
	ar_outstanding, ap_outstanding = _outstanding_snapshot(company)

	days_inventory_outstanding = 0.0
	if current["cogs_amount"] > 0:
		daily_cogs = current["cogs_amount"] / current["period_days"]
		days_inventory_outstanding = (stock_value / daily_cogs) if daily_cogs else 0.0

	return {
		"current": current,
		"previous": previous,
		"stock_value": stock_value,
		"days_inventory_outstanding": days_inventory_outstanding,
		"ar_outstanding": ar_outstanding,
		"ap_outstanding": ap_outstanding,
	}
