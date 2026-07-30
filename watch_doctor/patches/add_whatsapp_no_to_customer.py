"""Add whatsapp_no custom field to Customer.

Lets the visible-condition report (and other customer-facing print formats)
show a WhatsApp number that differs from the customer's mobile_no.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
	create_custom_fields(
		{
			"Customer": [
				{
					"fieldname": "whatsapp_no",
					"fieldtype": "Data",
					"label": "WhatsApp No.",
					"insert_after": "mobile_no",
				}
			]
		},
		update=True,
	)
	frappe.db.commit()
