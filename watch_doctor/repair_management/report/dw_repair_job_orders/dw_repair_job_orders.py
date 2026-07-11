# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	for row in data:
		row["diagnosis_summary"] = _as_text(row.get("diagnosis_summary"))
		row["recommended_work"] = _as_text(row.get("recommended_work"))
		row["issue_diagnosis"] = row["diagnosis_summary"] or row.get("issue_description") or ""
	return columns, data


def _as_text(value):
	"""diagnosis_summary/recommended_work are Small Text fields that the frontend
	stores as JSON-encoded string lists (e.g. '["Fix Index"]'); render them as
	comma-separated text instead of raw JSON."""
	if not value:
		return ""
	try:
		parsed = json.loads(value)
	except (TypeError, ValueError):
		return value
	if isinstance(parsed, list):
		return ", ".join(str(v) for v in parsed)
	return value


def get_columns():
	return [
		{"label": _("Repair Order"), "fieldname": "repair_order", "fieldtype": "Link", "options": "DW Repair Order", "width": 130},
		{"label": _("Reference Number"), "fieldname": "reference_number", "fieldtype": "Data", "width": 130},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 160},
		{"label": _("Mobile Number"), "fieldname": "mobile_no", "fieldtype": "Data", "width": 130},
		{"label": _("Watch Brand"), "fieldname": "watch_brand", "fieldtype": "Link", "options": "DW Watch Brand", "width": 120},
		{"label": _("Watch Model"), "fieldname": "watch_model", "fieldtype": "Data", "width": 140},
		{"label": _("Issue / Diagnosis"), "fieldname": "issue_diagnosis", "fieldtype": "Small Text", "width": 260},
		{"label": _("Recommended Work"), "fieldname": "recommended_work", "fieldtype": "Small Text", "width": 220},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 110},
	]


def get_data(filters):
	conditions = ["ro.docstatus < 2"]

	if filters.status:
		conditions.append("ri.status = %(status)s")

	if filters.priority:
		conditions.append("ro.priority = %(priority)s")

	if filters.customer:
		conditions.append("ro.customer = %(customer)s")

	if filters.watch_brand:
		conditions.append("ri.watch_brand = %(watch_brand)s")

	if filters.technician:
		conditions.append("ri.technician = %(technician)s")

	if filters.from_received_date:
		conditions.append("ro.received_date >= %(from_received_date)s")

	if filters.to_received_date:
		conditions.append("ro.received_date <= %(to_received_date)s")

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			ro.name AS repair_order,
			ro.reference_number,
			c.customer_name,
			c.mobile_no,
			ri.watch_brand,
			wm.model_name AS watch_model,
			ri.issue_description,
			ri.diagnosis_summary,
			ri.recommended_work,
			ri.status
		FROM `tabDW Repair Item` ri
		INNER JOIN `tabDW Repair Order` ro ON ro.name = ri.parent
		LEFT JOIN `tabCustomer` c ON c.name = ro.customer
		LEFT JOIN `tabDW Watch Model` wm ON wm.name = ri.watch_model
		WHERE {where_clause}
		ORDER BY ro.received_date DESC, ro.name DESC
		""",
		filters,
		as_dict=True,
	)
