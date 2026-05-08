"""Add dw_is_internal_line custom field to Sales Invoice Item and Quotation Item.

This field flags zero-rate part lines that are used for stock deduction only
and should be hidden from customer-facing print formats.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


INTERNAL_LINE_FIELD = {
	"fieldname": "dw_is_internal_line",
	"fieldtype": "Check",
	"label": "Internal Line (Hidden from Customer)",
	"default": "0",
	"print_hide": 1,
	"in_list_view": 0,
	"insert_after": "description",
	"description": "When checked, this line is hidden from customer-facing print formats. Used for zero-rate spare part lines that exist only for stock deduction.",
}


def execute():
	create_custom_fields(
		{
			"Sales Invoice Item": [INTERNAL_LINE_FIELD],
			"Quotation Item": [INTERNAL_LINE_FIELD],
		},
		update=True,
	)
	frappe.db.commit()
