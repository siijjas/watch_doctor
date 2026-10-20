"""Owner dashboard (UI_REDESIGN_SPEC.md D11 / M7).

Honest definitions, stated once here:
- Received: watches on orders whose received date is in the period.
- Collected: watches marked Delivered in the period (the status-change date,
  not the order's last edit).
- Invoiced: submitted sales invoices posted in the period, returns netted off.
- Taken: money actually received in the period: POS / repair invoice payments
  at the till plus payment entries (collections on credit), minus refunds.
"""

import statistics

import frappe
from frappe.utils import add_days, date_diff, flt, getdate, nowdate

from watch_doctor.api.tracker import get_tracker_rows
from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles

RETAIL = "IFNULL(si.dw_pos_profile, '') != ''"
REPAIR = "(si.remarks LIKE 'covered_items:%%' OR EXISTS (SELECT 1 FROM `tabDW Repair Order` ro WHERE ro.sales_invoice = si.name))"
UNPAID_AGE_DAYS = 30


def _period(from_date, to_date):
	to_date = getdate(to_date or nowdate())
	from_date = getdate(from_date or add_days(to_date, -6))
	if from_date > to_date:
		from_date, to_date = to_date, from_date
	return from_date, to_date


def money_taken(from_date, to_date):
	"""Money received in the period, split by mode of payment."""
	values = {"f": from_date, "t": to_date}
	till = frappe.db.sql(
		"""
		SELECT p.mode_of_payment AS mode, SUM(p.amount) AS amount
		FROM `tabSales Invoice Payment` p
		INNER JOIN `tabSales Invoice` si ON si.name = p.parent
		WHERE si.docstatus = 1 AND si.is_pos = 1 AND si.posting_date BETWEEN %(f)s AND %(t)s
		GROUP BY p.mode_of_payment
		""",
		values,
		as_dict=True,
	)
	change = flt(frappe.db.sql(
		"""
		SELECT SUM(si.change_amount) FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.is_pos = 1 AND si.posting_date BETWEEN %(f)s AND %(t)s
		""",
		values,
	)[0][0])
	entries = frappe.db.sql(
		"""
		SELECT pe.mode_of_payment AS mode,
			SUM(CASE WHEN pe.payment_type = 'Receive' THEN pe.paid_amount ELSE -pe.paid_amount END) AS amount
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1 AND pe.party_type = 'Customer' AND pe.posting_date BETWEEN %(f)s AND %(t)s
		GROUP BY pe.mode_of_payment
		""",
		values,
		as_dict=True,
	)
	by_mode = {}
	for row in till + entries:
		by_mode[row.mode or "Other"] = by_mode.get(row.mode or "Other", 0) + flt(row.amount)
	# Change handed back comes out of the cash taken.
	if change:
		cash_mode = next((m for m in by_mode if "cash" in m.lower()), None)
		if cash_mode:
			by_mode[cash_mode] -= change
	total = sum(by_mode.values())
	return {"total": flt(total, 3), "by_mode": [{"mode": k, "amount": flt(v, 3)} for k, v in sorted(by_mode.items(), key=lambda x: -x[1])]}


@frappe.whitelist()
def get_overview(from_date: str = "", to_date: str = ""):
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	f, t = _period(from_date, to_date)
	values = {"f": f, "t": t}

	received = frappe.db.sql(
		"""
		SELECT COUNT(*) FROM `tabDW Repair Item` i INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		WHERE i.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
		""",
		values,
	)[0][0]
	collected_rows = frappe.db.sql(
		"""
		SELECT i.name, o.received_date, DATE(i.status_changed_on) AS collected_on
		FROM `tabDW Repair Item` i INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		WHERE i.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND i.status = 'Delivered'
		  AND DATE(i.status_changed_on) BETWEEN %(f)s AND %(t)s
		""",
		values,
		as_dict=True,
	)
	turn = [max(date_diff(r.collected_on, r.received_date), 0) for r in collected_rows if r.received_date]

	# Same split as the Sales report: repair invoices carry their covered watches
	# in remarks (or are linked from an order); retail ones carry a POS profile.
	invoiced = frappe.db.sql(
		f"""
		SELECT
			SUM(CASE WHEN si.is_return = 0 AND {REPAIR} THEN si.grand_total ELSE 0 END) AS repairs,
			SUM(CASE WHEN si.is_return = 0 AND NOT {REPAIR} AND {RETAIL} THEN si.grand_total ELSE 0 END) AS retail,
			SUM(CASE WHEN si.is_return = 0 AND NOT {REPAIR} AND NOT {RETAIL} THEN si.grand_total ELSE 0 END) AS other,
			SUM(CASE WHEN si.is_return = 1 THEN si.grand_total ELSE 0 END) AS returns
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %(f)s AND %(t)s
		""",
		values,
		as_dict=True,
	)[0]

	# Workshop now and follow-ups: same rules as the front desk.
	rows, _truncated = get_tracker_rows("")
	from watch_doctor.api.tracker import ui_stage_of
	mix = {}
	tech_open = {}
	attention = {"overdue": 0, "ready_long": 0, "estimate_late": 0, "customer_silent": 0, "part_late": 0, "no_tech": 0}
	for r in rows:
		stage = "collected" if r.docstatus == 1 else ui_stage_of(r.watch_status)
		waiting = bool(r.awaiting_parts) and stage in ("diagnosing", "customer", "repair")
		key = "parts" if waiting else stage
		mix[key] = mix.get(key, 0) + 1
		if stage not in ("ready", "return", "collected"):
			tech_open[r.technician or ""] = tech_open.get(r.technician or "", 0) + 1
		if r.overdue_days and stage not in ("ready", "return"):
			attention["overdue"] += 1
		if stage in ("ready", "return") and r.days_in_stage >= 7:
			attention["ready_long"] += 1
		if stage == "estimate" and r.needs_attention:
			attention["estimate_late"] += 1
		if stage == "customer" and r.needs_attention:
			attention["customer_silent"] += 1
		if waiting and r.parts_overdue_days:
			attention["part_late"] += 1
		if stage == "received" and not r.technician_id:
			attention["no_tech"] += 1

	finished = dict(frappe.db.sql(
		"""
		SELECT COALESCE(tt.technician_name, i.technician), COUNT(*)
		FROM `tabDW Repair Item` i
		LEFT JOIN `tabDW Technician` tt ON tt.name = i.technician
		WHERE i.parenttype = 'DW Repair Order' AND i.status IN ('Completed', 'Delivered')
		  AND IFNULL(i.technician, '') != '' AND DATE(i.status_changed_on) BETWEEN %(f)s AND %(t)s
		GROUP BY i.technician
		""",
		values,
	))
	technicians = sorted(
		[{"name": k or "Unassigned", "open": v, "finished": finished.get(k, 0)} for k, v in tech_open.items()]
		+ [{"name": k, "open": 0, "finished": v} for k, v in finished.items() if k not in tech_open],
		key=lambda x: (x["name"] == "Unassigned", -x["open"] - x["finished"]),
	)

	days = date_diff(t, f) + 1
	trend = []
	if days <= 92:
		rec_by_day = dict(frappe.db.sql(
			"""
			SELECT o.received_date, COUNT(*) FROM `tabDW Repair Item` i INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
			WHERE i.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
			GROUP BY o.received_date
			""",
			values,
		))
		col_by_day = {}
		for r in collected_rows:
			col_by_day[r.collected_on] = col_by_day.get(r.collected_on, 0) + 1
		for n in range(days):
			d = add_days(f, n)
			trend.append({"date": str(d), "received": int(rec_by_day.get(getdate(d), 0)), "collected": int(col_by_day.get(getdate(d), 0))})

	complaints = frappe.db.sql(
		"""
		SELECT IF(x.is_other = 1, 'Other', x.issue) AS issue, COUNT(*) AS n
		FROM `tabDW Repair Item Issue` x INNER JOIN `tabDW Repair Order` o ON o.name = x.parent
		WHERE x.parenttype = 'DW Repair Order' AND o.docstatus < 2 AND o.received_date BETWEEN %(f)s AND %(t)s
		GROUP BY IF(x.is_other = 1, 'Other', x.issue)
		ORDER BY n DESC
		LIMIT 6
		""",
		values,
		as_dict=True,
	)
	total_complaints = sum(c.n for c in complaints) or 1

	return {
		"from_date": str(f),
		"to_date": str(t),
		"received": int(received or 0),
		"collected": len(collected_rows),
		"invoiced": flt(flt(invoiced.repairs) + flt(invoiced.retail) + flt(invoiced.other) + flt(invoiced.returns), 3),
		"invoiced_repairs": flt(invoiced.repairs, 3),
		"invoiced_retail": flt(invoiced.retail, 3),
		"invoiced_other": flt(invoiced.other, 3),
		"invoiced_returns": flt(invoiced.returns, 3),
		"taken": money_taken(f, t),
		"turnaround_avg": round(sum(turn) / len(turn), 1) if turn else None,
		"turnaround_median": statistics.median(turn) if turn else None,
		"attention": attention,
		"receivables": receivables(),
		"workshop": {"total": sum(v for k, v in mix.items() if k != "collected"), "mix": mix},
		"technicians": technicians,
		"trend": trend,
		"complaints": [{"issue": c.issue, "count": c.n, "share": round(100 * c.n / total_complaints)} for c in complaints],
	}


def receivables(limit=50):
	"""Unpaid invoices, oldest first, labelled repair / retail / other."""
	today = getdate(nowdate())
	rows = frappe.db.sql(
		f"""
		SELECT si.name, si.customer, si.customer_name, si.posting_date, si.due_date, si.outstanding_amount,
			si.dw_is_credit_sale, {RETAIL} AS is_retail, si.remarks LIKE 'covered_items:%%' AS is_repair,
			(SELECT o.name FROM `tabDW Repair Order` o WHERE o.sales_invoice = si.name LIMIT 1) AS repair_order
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.outstanding_amount > 0
		ORDER BY si.posting_date ASC
		LIMIT %(limit)s
		""",
		{"limit": int(limit)},
		as_dict=True,
	)
	agg = frappe.db.sql(
		"""
		SELECT SUM(outstanding_amount), COUNT(*),
			SUM(IF(posting_date < %(cut)s, outstanding_amount, 0)), SUM(posting_date < %(cut)s)
		FROM `tabSales Invoice` WHERE docstatus = 1 AND outstanding_amount > 0
		""",
		{"cut": add_days(today, -UNPAID_AGE_DAYS)},
	)[0]
	for r in rows:
		r.age_days = date_diff(today, r.posting_date)
		r.kind = "repair" if r.repair_order or r.is_repair else ("retail" if r.is_retail else "other")
		r.pop("is_repair", None)
	return {
		"total": flt(agg[0]),
		"count": int(agg[1] or 0),
		"old_count": int(agg[3] or 0),
		"old_total": flt(agg[2], 3),
		"rows": rows,
	}
