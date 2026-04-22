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
		{"label": _("Repair Order"), "fieldname": "repair_order", "fieldtype": "Link", "options": "DW Repair Order", "width": 160},
		{"label": _("Repair Item"), "fieldname": "repair_item", "fieldtype": "Data", "width": 130},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 180},
		{"label": _("Priority"), "fieldname": "priority", "fieldtype": "Data", "width": 90},
		{"label": _("Received Date"), "fieldname": "received_date", "fieldtype": "Date", "width": 115},
		{"label": _("Aging (Days)"), "fieldname": "aging_days", "fieldtype": "Int", "width": 90},
		{"label": _("Watch Brand"), "fieldname": "watch_brand", "fieldtype": "Link", "options": "DW Watch Brand", "width": 130},
		{"label": _("Watch Model"), "fieldname": "watch_model", "fieldtype": "Link", "options": "DW Watch Model", "width": 130},
		{"label": _("Serial Number"), "fieldname": "serial_number", "fieldtype": "Data", "width": 140},
		{"label": _("Technician"), "fieldname": "technician", "fieldtype": "Link", "options": "DW Technician", "width": 140},
		{"label": _("Recommended Work"), "fieldname": "recommended_work", "fieldtype": "Small Text", "width": 260},
		{"label": _("Quotation"), "fieldname": "quotation", "fieldtype": "Link", "options": "Quotation", "width": 150},
		{"label": _("Estimate Amount"), "fieldname": "estimate_amount", "fieldtype": "Currency", "width": 130},
	]


def get_data(filters):
	conditions = ["ri.status = 'Create Estimate'", "ro.docstatus < 2"]

	if filters.priority:
		conditions.append("ro.priority = %(priority)s")

	if filters.technician:
		conditions.append("ri.technician = %(technician)s")

	if filters.customer:
		conditions.append("ro.customer = %(customer)s")

	if filters.from_received_date:
		conditions.append("ro.received_date >= %(from_received_date)s")

	if filters.to_received_date:
		conditions.append("ro.received_date <= %(to_received_date)s")

	if filters.only_without_estimate:
		conditions.append("COALESCE(ro.quotation_amount, 0) = 0")

	where_clause = " AND ".join(conditions)

	return frappe.db.sql(
		f"""
		SELECT
			ro.name AS repair_order,
			ri.name AS repair_item,
			ro.customer,
			ro.priority,
			ro.received_date,
			DATEDIFF(CURDATE(), ro.received_date) AS aging_days,
			ri.watch_brand,
			ri.watch_model,
			ri.serial_number,
			ri.technician,
			ri.recommended_work,
			ro.quotation,
			ro.quotation_amount AS estimate_amount
		FROM `tabDW Repair Item` ri
		INNER JOIN `tabDW Repair Order` ro ON ro.name = ri.parent
		WHERE {where_clause}
		ORDER BY
			FIELD(ro.priority, 'VIP', 'Urgent', 'Normal'),
			ro.received_date ASC,
			ro.modified ASC
		""",
		filters,
		as_dict=True,
	)
