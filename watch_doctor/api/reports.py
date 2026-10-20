"""Four reports, one period (UI_REDESIGN_SPEC.md D12, B5.9).

Workshop, Sales & purchases, Cash & bank and Profit & loss replace the eight
daily/monthly reports: "daily vs monthly" is just the period. The money
reports reuse the existing builders (monthly_*_report.py) so figures do not
change meaning; profit is executive-only on the server.
"""

import statistics

import frappe
from frappe.utils import add_days, date_diff, flt, getdate, nowdate

from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles

MAX_DAYS = 400


def _period(from_date, to_date):
	f, t = getdate(from_date or nowdate()), getdate(to_date or nowdate())
	if t < f:
		f, t = t, f
	if date_diff(t, f) > MAX_DAYS:
		frappe.throw(frappe._("Choose a period of at most {0} days.").format(MAX_DAYS))
	return f, t


@frappe.whitelist()
def report_workshop(from_date: str, to_date: str):
	"""Orders, watches, technicians, complaints, parts and estimate conversion."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	f, t = _period(from_date, to_date)
	v = {"f": f, "t": t}

	orders = frappe.db.sql(
		"""
		SELECT o.name, o.customer, c.customer_name, o.received_date, o.status, o.docstatus, o.delivery_date,
			o.invoiced_amount, o.quotation_amount, o.priority
		FROM `tabDW Repair Order` o LEFT JOIN `tabCustomer` c ON c.name = o.customer
		WHERE o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
		ORDER BY o.received_date DESC, o.name DESC
		""",
		v,
		as_dict=True,
	)
	watches = {}
	if orders:
		for row in frappe.db.sql(
			"""
			SELECT i.parent, i.watch_brand, COALESCE(m.model_name, i.watch_model) AS watch_model, i.status, i.awaiting_parts
			FROM `tabDW Repair Item` i LEFT JOIN `tabDW Watch Model` m ON m.name = i.watch_model
			WHERE i.parenttype = 'DW Repair Order' AND i.parent IN %(names)s ORDER BY i.idx
			""",
			{"names": tuple(o.name for o in orders)},
			as_dict=True,
		):
			watches.setdefault(row.parent, []).append(row)
	for o in orders:
		o.watches = watches.get(o.name, [])

	collected = frappe.db.sql(
		"""
		SELECT o.received_date, DATE(i.status_changed_on) AS on_date
		FROM `tabDW Repair Item` i INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		WHERE i.parenttype = 'DW Repair Order' AND i.status = 'Delivered' AND o.docstatus < 2
		  AND DATE(i.status_changed_on) BETWEEN %(f)s AND %(t)s
		""",
		v,
		as_dict=True,
	)
	turn = [max(date_diff(r.on_date, r.received_date), 0) for r in collected if r.received_date]

	technicians = frappe.db.sql(
		"""
		SELECT COALESCE(tt.technician_name, i.technician) AS name,
			SUM(i.status IN ('Completed', 'Delivered') AND DATE(i.status_changed_on) BETWEEN %(f)s AND %(t)s) AS finished,
			SUM(o.docstatus = 0 AND i.status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined')) AS open_now
		FROM `tabDW Repair Item` i
		INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		LEFT JOIN `tabDW Technician` tt ON tt.name = i.technician
		WHERE i.parenttype = 'DW Repair Order' AND IFNULL(i.technician, '') != '' AND o.docstatus < 2
		GROUP BY i.technician
		HAVING finished > 0 OR open_now > 0
		ORDER BY finished DESC, open_now DESC
		""",
		v,
		as_dict=True,
	)

	complaints = frappe.db.sql(
		"""
		SELECT IF(x.is_other = 1, 'Other', x.issue) AS issue, COUNT(*) AS watches
		FROM `tabDW Repair Item Issue` x INNER JOIN `tabDW Repair Order` o ON o.name = x.parent
		WHERE x.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
		GROUP BY IF(x.is_other = 1, 'Other', x.issue) ORDER BY watches DESC LIMIT 15
		""",
		v,
		as_dict=True,
	)
	total_c = sum(c.watches for c in complaints) or 1
	for c in complaints:
		c.share = round(100 * c.watches / total_c)

	parts = frappe.db.sql(
		"""
		SELECT p.part, COALESCE(it.item_name, p.item_name, p.part) AS item_name, SUM(p.quantity) AS qty,
			SUM(p.quantity * COALESCE(NULLIF(p.rate, 0), it.standard_rate, 0)) AS amount
		FROM `tabDW Repair Part Used` p
		INNER JOIN `tabDW Repair Order` o ON o.name = p.parent
		LEFT JOIN `tabItem` it ON it.name = p.part
		WHERE p.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
		GROUP BY p.part ORDER BY qty DESC LIMIT 30
		""",
		v,
		as_dict=True,
	)

	# Estimate conversion from the same builder the monthly report used.
	from watch_doctor.monthly_sales_purchase_report import _compute_period_summary, _get_default_company
	sp = _compute_period_summary(f, t, _get_default_company())

	return {
		"from_date": str(f),
		"to_date": str(t),
		"orders_received": len(orders),
		"watches_received": sum(len(o.watches) for o in orders),
		"watches_collected": len(collected),
		"turnaround_avg": round(sum(turn) / len(turn), 1) if turn else None,
		"turnaround_median": statistics.median(turn) if turn else None,
		"invoiced": flt(sum(flt(o.invoiced_amount) for o in orders), 3),
		"technicians": technicians,
		"complaints": complaints,
		"parts": parts,
		"estimates": {
			"quoted_orders": sp.get("quoted_orders"),
			"quoted_and_invoiced": sp.get("quoted_and_invoiced"),
			"conversion_rate_pct": sp.get("conversion_rate_pct"),
		},
		"top_brands": sp.get("top_brands") or [],
		"orders": orders,
	}


@frappe.whitelist()
def report_sales(from_date: str, to_date: str):
	"""Retail, repairs, B2B and returns; by mode, category and cashier; purchases; unpaid."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	f, t = _period(from_date, to_date)
	from watch_doctor.monthly_sales_report import build_sales_report

	data = build_sales_report(str(f), str(t))
	data["repair_sales"] = flt(frappe.db.sql(
		"""
		SELECT SUM(si.grand_total) FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.is_return = 0 AND si.posting_date BETWEEN %(f)s AND %(t)s
		  AND (si.remarks LIKE 'covered_items:%%' OR EXISTS (SELECT 1 FROM `tabDW Repair Order` o WHERE o.sales_invoice = si.name))
		""",
		{"f": f, "t": t},
	)[0][0], 3)
	data["items_sold"] = frappe.db.sql(
		"""
		SELECT sii.item_code, sii.item_name, SUM(sii.qty) AS qty, SUM(sii.amount) AS amount, MAX(sii.dw_is_pms_item) AS is_pms
		FROM `tabSales Invoice Item` sii INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
		WHERE si.docstatus = 1 AND si.is_return = 0 AND IFNULL(si.dw_pos_profile, '') != ''
		  AND si.posting_date BETWEEN %(f)s AND %(t)s
		GROUP BY sii.item_code ORDER BY amount DESC LIMIT 30
		""",
		{"f": f, "t": t},
		as_dict=True,
	)
	return data


@frappe.whitelist()
def report_cash(from_date: str, to_date: str):
	"""Money in and out, by mode and by cash / bank account, transfers and refunds."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	f, t = _period(from_date, to_date)
	from watch_doctor.monthly_financial_report import build_financial_report

	return build_financial_report(str(f), str(t))


@frappe.whitelist()
def report_profit(from_date: str, to_date: str):
	"""Accrual profit and loss against the previous period, margins by item group,
	expenses and the PMS VAT register. Owner only."""
	require_roles(ROLE_EXECUTIVE)
	f, t = _period(from_date, to_date)
	from watch_doctor.monthly_executive_report import build_executive_summary
	from watch_doctor.pms import get_pms_vat_report

	data = build_executive_summary(str(f), str(t))
	data["pms"] = get_pms_vat_report(str(f), str(t))
	return data
