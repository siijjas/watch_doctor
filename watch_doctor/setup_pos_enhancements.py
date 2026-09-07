"""Idempotent setup for POS enhancement custom fields."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	"""Create POS enhancement fields on native doctypes used by the custom POS."""
	custom_fields = {
		"Sales Invoice": [
			{
				"fieldname": "dw_is_credit_sale",
				"label": "Credit Sale",
				"fieldtype": "Check",
				"insert_after": "is_pos",
				"read_only": 1,
				"print_hide": 1,
				"description": "Sold on credit from the POS with no payment collected at time of sale.",
			},
			{
				"fieldname": "dw_pos_profile",
				"label": "DW POS Profile",
				"fieldtype": "Link",
				"options": "POS Profile",
				"insert_after": "dw_is_credit_sale",
				"read_only": 1,
				"print_hide": 1,
			},
			{
				"fieldname": "dw_pos_receipt_format",
				"label": "POS Receipt Format",
				"fieldtype": "Link",
				"options": "Print Format",
				"insert_after": "dw_pos_profile",
				"print_hide": 1,
			},
			{
				"fieldname": "dw_pos_sales_person",
				"label": "POS Sales Person",
				"fieldtype": "Link",
				"options": "Sales Person",
				"insert_after": "dw_pos_receipt_format",
				"print_hide": 1,
			},
			{
				"fieldname": "dw_pos_commission_rate",
				"label": "POS Commission Rate",
				"fieldtype": "Percent",
				"insert_after": "dw_pos_sales_person",
				"print_hide": 1,
			},
		],
		"POS Profile": [
			{
				"fieldname": "dw_pos_defaults_section",
				"label": "Watch Doctor POS Defaults",
				"fieldtype": "Section Break",
				"insert_after": "warehouse",
				"collapsible": 1,
			},
			{
				"fieldname": "dw_default_customer",
				"label": "Default POS Customer",
				"fieldtype": "Link",
				"options": "Customer",
				"insert_after": "dw_pos_defaults_section",
			},
			{
				"fieldname": "dw_default_receipt_format",
				"label": "Default Receipt Format",
				"fieldtype": "Link",
				"options": "Print Format",
				"insert_after": "dw_default_customer",
			},
			{
				"fieldname": "dw_enable_auto_print",
				"label": "Enable Auto Print",
				"fieldtype": "Check",
				"insert_after": "dw_default_receipt_format",
				"default": "1",
			},
			{
				"fieldname": "dw_default_sales_person",
				"label": "Default Sales Person",
				"fieldtype": "Link",
				"options": "Sales Person",
				"insert_after": "dw_enable_auto_print",
			},
			{
				"fieldname": "dw_default_commission_rate",
				"label": "Default Commission Rate",
				"fieldtype": "Percent",
				"insert_after": "dw_default_sales_person",
			},
			{
				"fieldname": "dw_allowed_naming_series",
				"label": "Allowed POS Naming Series",
				"fieldtype": "Small Text",
				"insert_after": "dw_default_commission_rate",
				"description": "One Sales Invoice naming series per line.",
			},
		],
	}

	create_custom_fields(custom_fields, update=True)
	frappe.db.commit()
	frappe.clear_cache()