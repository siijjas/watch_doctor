"""
Monthly Executive Summary — accrual P&L for stakeholders (Desk-only, DW Executive-only).

Unlike the daily report (api.py: get_daily_report), which reconstructs cash flow by
payment mode (handling internal transfers, mixed Journal Entry splits, etc.), this
report is a standard accrual Profit & Loss: Total Revenue (incl. VAT) -> less VAT
Collected -> less COGS -> Gross Profit -> Operating Expenses -> Net Profit. Operating
expenses are pulled straight from GL Entry against non-COGS Expense accounts, since
internal cash transfers never post to Income/Expense accounts and therefore never
need special-casing here.
"""

import frappe
from frappe.utils import add_days, add_months, get_first_day, get_last_day, getdate

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE

# Account types that are technical/non-operating and must not be counted as
# operating expenses (COGS is reported as its own line; the rest are ledger
# housekeeping postings rather than real business expenses).
NON_OPERATING_EXPENSE_ACCOUNT_TYPES = (
	"Cost of Goods Sold",
	"Round Off",
	"Stock Adjustment",
	"Expenses Included In Asset Valuation",
	"Expenses Included In Valuation",
)


def _get_default_company():
	return frappe.defaults.get_defaults().get("company")


def _net_and_vat(row):
	"""Split a Sales Invoice row into (tax-exclusive net, VAT).

	Derived from grand_total rather than trusting net_total directly: PMS
	(Profit Margin Scheme) invoices clear the standard tax template entirely
	(see pms.py si_validate) since their VAT is calculated on margin, not the
	full sale price. That means net_total on a PMS invoice still includes the
	PMS VAT — it's only ever pulled out via a GL reclassification entry on
	submit (dw_pms_total_vat), never by reducing net_total on the document
	itself. grand_total - (standard tax + PMS VAT) gives the true net amount
	in both cases.
	"""
	vat = float(row["total_taxes_and_charges"] or 0) + float(row["pms_vat"] or 0)
	net = float(row["grand_total"] or 0) - vat
	return net, vat


def _compute_period_summary(from_date, to_date, company):
	"""Accrual P&L for a single date range. All amounts are company-currency totals."""

	# ---- REVENUE: repair-linked vs. retail/B2B vs. returns ----
	# VAT collected is a liability, not revenue, so revenue lines must exclude it —
	# see _net_and_vat() for why grand_total (not net_total) is the safe starting point.
	pms_vat_expr = "COALESCE(si.dw_pms_total_vat, 0)" if frappe.db.has_column("Sales Invoice", "dw_pms_total_vat") else "0"

	repair_revenue_rows = frappe.db.sql(f"""
		SELECT si.grand_total, si.total_taxes_and_charges, {pms_vat_expr} AS pms_vat
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s
	""", (from_date, to_date), as_dict=True)
	repair_revenue = 0.0
	repair_vat = 0.0
	for r in repair_revenue_rows:
		net, vat = _net_and_vat(r)
		repair_revenue += net
		repair_vat += vat

	other_sales_invoices = frappe.db.sql(f"""
		SELECT si.grand_total, si.total_taxes_and_charges, {pms_vat_expr} AS pms_vat, si.is_pos, si.is_return,
			si.dw_is_credit_sale
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
			AND si.posting_date BETWEEN %s AND %s
			AND ro.name IS NULL
	""", (from_date, to_date), as_dict=True)

	retail_sales = retail_vat = 0.0
	b2b_sales = b2b_vat = 0.0
	returns = returns_vat = 0.0
	for i in other_sales_invoices:
		net, vat = _net_and_vat(i)
		if i["is_return"] == 1:
			returns += abs(net)
			returns_vat += abs(vat)
		# A POS credit sale has is_pos=0 (so core doesn't demand a payment row) but
		# is still a retail sale, not a B2B one.
		elif i["is_pos"] == 1 or i["dw_is_credit_sale"] == 1:
			retail_sales += net
			retail_vat += vat
		else:
			b2b_sales += net
			b2b_vat += vat

	net_revenue = repair_revenue + retail_sales + b2b_sales - returns
	vat_collected = repair_vat + retail_vat + b2b_vat - returns_vat
	gross_revenue = net_revenue + vat_collected

	# ---- COGS / GROSS PROFIT (same estimation method as the daily item-profit report) ----
	invoice_names = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": ["between", [from_date, to_date]]},
		pluck="name",
	)

	cogs_amount = 0.0
	item_group_breakdown = []
	if invoice_names:
		placeholders = ", ".join(["%s"] * len(invoice_names))
		has_last_purchase_rate = frappe.db.has_column("Item", "last_purchase_rate")
		last_purchase_component = ", NULLIF(i.last_purchase_rate, 0)" if has_last_purchase_rate else ""
		cogs_rate_expr = (
			"CASE WHEN i.is_stock_item = 1 "
			f"THEN COALESCE(NULLIF(sii.incoming_rate, 0), NULLIF(i.valuation_rate, 0){last_purchase_component}, 0) "
			"ELSE 0 END"
		)
		item_group_breakdown = frappe.db.sql(
			f"""
			SELECT
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				SUM(sii.base_net_amount) AS sales_amount,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({placeholders})
				AND IFNULL(sii.dw_is_internal_line, 0) = 0
			GROUP BY COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(invoice_names),
			as_dict=True,
		)
		cogs_amount = sum(float(r["cogs_amount"] or 0) for r in item_group_breakdown)

	gross_profit = net_revenue - cogs_amount
	gross_margin_pct = (gross_profit / net_revenue * 100) if net_revenue else 0.0

	# ---- OPERATING EXPENSES: GL Entry against non-COGS Expense accounts ----
	expense_by_account = frappe.db.sql("""
		SELECT gle.account, SUM(gle.debit - gle.credit) AS total
		FROM `tabGL Entry` gle
		INNER JOIN `tabAccount` acc ON acc.name = gle.account
		WHERE gle.company = %s
			AND gle.docstatus = 1
			AND gle.is_cancelled = 0
			AND gle.posting_date BETWEEN %s AND %s
			AND acc.root_type = 'Expense'
			AND COALESCE(acc.account_type, '') NOT IN %s
		GROUP BY gle.account
		HAVING total != 0
		ORDER BY total DESC
	""", (company, from_date, to_date, NON_OPERATING_EXPENSE_ACCOUNT_TYPES), as_dict=True)
	operating_expenses_total = sum(float(r["total"] or 0) for r in expense_by_account)

	net_profit = gross_profit - operating_expenses_total
	net_margin_pct = (net_profit / net_revenue * 100) if net_revenue else 0.0

	return {
		"from_date": str(from_date),
		"to_date": str(to_date),
		"repair_revenue": repair_revenue,
		"repair_revenue_gross": repair_revenue + repair_vat,
		"retail_sales": retail_sales,
		"retail_sales_gross": retail_sales + retail_vat,
		"b2b_sales": b2b_sales,
		"b2b_sales_gross": b2b_sales + b2b_vat,
		"returns": returns,
		"returns_gross": returns + returns_vat,
		"net_revenue": net_revenue,
		"vat_collected": vat_collected,
		"gross_revenue": gross_revenue,
		"cogs_amount": cogs_amount,
		"gross_profit": gross_profit,
		"gross_margin_pct": gross_margin_pct,
		"item_group_breakdown": item_group_breakdown,
		"operating_expenses_total": operating_expenses_total,
		"expense_by_account": expense_by_account,
		"net_profit": net_profit,
		"net_margin_pct": net_margin_pct,
	}


def _build_comparison(current, previous):
	metrics = [
		("net_revenue", "Net Revenue"),
		("cogs_amount", "COGS"),
		("gross_profit", "Gross Profit"),
		("operating_expenses_total", "Operating Expenses"),
		("net_profit", "Net Profit"),
	]
	comparison = []
	for key, label in metrics:
		cur_val = float(current.get(key) or 0)
		prev_val = float(previous.get(key) or 0)
		delta = cur_val - prev_val
		delta_pct = (delta / abs(prev_val) * 100) if prev_val else 0.0
		comparison.append({
			"metric": key,
			"label": label,
			"current": cur_val,
			"previous": prev_val,
			"delta": delta,
			"delta_pct": delta_pct,
		})
	return comparison


@frappe.whitelist()
def get_monthly_executive_summary(from_date, to_date):
	"""Executive-only accrual P&L for [from_date, to_date] plus month-over-month comparison
	against the immediately preceding period of equal length."""
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
		# Compare against the actual previous calendar month, not a trailing N-day
		# window — May (31 days) vs. June (30 days) would otherwise be off by a day.
		prior_from = get_first_day(add_months(from_date, -1))
		prior_to = get_last_day(prior_from)
	else:
		period_days = (to_date - from_date).days
		prior_to = add_days(from_date, -1)
		prior_from = add_days(prior_to, -period_days)

	current = _compute_period_summary(from_date, to_date, company)
	previous = _compute_period_summary(prior_from, prior_to, company)

	return {
		"current": current,
		"previous": previous,
		"comparison": _build_comparison(current, previous),
	}
