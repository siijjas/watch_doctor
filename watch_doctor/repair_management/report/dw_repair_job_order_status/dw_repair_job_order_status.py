# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": _("Repair Order"), "fieldname": "repair_order", "fieldtype": "Link", "options": "DW Repair Order", "width": 150},
		{"label": _("Reference Number"), "fieldname": "reference_number", "fieldtype": "Data", "width": 140},
		{"label": _("Creation Date"), "fieldname": "creation", "fieldtype": "Datetime", "width": 160},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 180},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 120},
	]


def get_data(filters):
	conditions = ["ro.docstatus < 2"]

	if filters.status:
		conditions.append("ro.status = %(status)s")

	if filters.customer:
		conditions.append("ro.customer = %(customer)s")

	if filters.from_date:
		conditions.append("ro.creation >= %(from_date)s")

	if filters.to_date:
		conditions.append("ro.creation <= %(to_date)s")

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			ro.name AS repair_order,
			ro.reference_number,
			ro.creation,
			c.customer_name,
			ro.status
		FROM `tabDW Repair Order` ro
		LEFT JOIN `tabCustomer` c ON c.name = ro.customer
		WHERE {where_clause}
		ORDER BY ro.creation DESC
		""",
		filters,
		as_dict=True,
	)
