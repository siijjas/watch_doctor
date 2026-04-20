"""Idempotent setup for centralized invoice workflow settings."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


FIELD_DEFINITIONS = [
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
	{
		"fieldname": "ro_section",
		"fieldtype": "Section Break",
		"label": "Repair Order",
	},
	{
		"fieldname": "ro_label_print_format",
		"fieldtype": "Link",
		"label": "Bag Label Print Format",
		"options": "Print Format",
		"description": "Print format used for repair order bag labels (thermal label 1.5in × 1in).",
	},
]


def execute():
	"""Ensure the centralized invoice settings singleton exists."""
	_ensure_invoice_settings()
	_ensure_invoice_settings_fields()
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
		"fields": FIELD_DEFINITIONS,
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
	frappe.db.set_single_value("DW Invoice Settings", "ro_label_print_format", "DW RO Bag Label")


def _ensure_invoice_settings_fields():
	if not frappe.db.exists("DocType", "DW Invoice Settings"):
		return

	meta = frappe.get_meta("DW Invoice Settings")
	missing_fields = [field for field in FIELD_DEFINITIONS if not meta.get_field(field["fieldname"])]
	if not missing_fields:
		return

	create_custom_fields({"DW Invoice Settings": missing_fields}, update=True)

	if not frappe.db.get_single_value("DW Invoice Settings", "ro_label_print_format"):
		frappe.db.set_single_value("DW Invoice Settings", "ro_label_print_format", "DW RO Bag Label")