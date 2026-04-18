"""Idempotent setup for centralized invoice workflow settings."""

import frappe


def execute():
	"""Ensure the centralized invoice settings singleton exists."""
	_ensure_invoice_settings()
	frappe.db.commit()
	frappe.clear_cache()


def _ensure_invoice_settings():
	if frappe.db.exists("DocType", "DW Invoice Settings"):
		return

	doc = frappe.get_doc({
		"doctype": "DocType",
		"name": "DW Invoice Settings",
		"module": "Repair Management",
		"custom": 1,
		"issingle": 1,
		"editable_grid": 0,
		"track_changes": 0,
		"fields": [
			{
				"fieldname": "repair_service_section",
				"fieldtype": "Section Break",
				"label": "Repair / Service Invoice",
			},
			{
				"fieldname": "repair_service_naming_series",
				"fieldtype": "Data",
				"label": "Naming Series",
				"description": "Sales Invoice naming series used for invoices created from Repair Orders.",
			},
			{
				"fieldname": "repair_service_print_format",
				"fieldtype": "Link",
				"label": "Print Format",
				"options": "Print Format",
			},
			{
				"fieldname": "pos_standard_section",
				"fieldtype": "Section Break",
				"label": "POS Invoice - Standard Tax",
			},
			{
				"fieldname": "pos_standard_naming_series",
				"fieldtype": "Data",
				"label": "Naming Series",
			},
			{
				"fieldname": "pos_standard_print_format",
				"fieldtype": "Link",
				"label": "Print Format",
				"options": "Print Format",
			},
			{
				"fieldname": "pos_pms_section",
				"fieldtype": "Section Break",
				"label": "POS Invoice - PMS Scheme",
			},
			{
				"fieldname": "pos_pms_naming_series",
				"fieldtype": "Data",
				"label": "Naming Series",
			},
			{
				"fieldname": "pos_pms_print_format",
				"fieldtype": "Link",
				"label": "Print Format",
				"options": "Print Format",
			},
		],
		"permissions": [
			{"role": "System Manager", "read": 1, "write": 1, "create": 1},
			{"role": "DW Executive", "read": 1, "write": 1},
		],
	})
	doc.flags.ignore_permissions = True
	doc.insert()

	frappe.db.set_single_value("DW Invoice Settings", "repair_service_print_format", "Standard")
	frappe.db.set_single_value("DW Invoice Settings", "pos_standard_print_format", "DW POS Retail Receipt")
	frappe.db.set_single_value("DW Invoice Settings", "pos_pms_print_format", "DW PMS Tax Invoice")