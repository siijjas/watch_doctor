"""Add the Invoice Note field to Sales Invoice and print it on the repair invoice.

The repair-invoice print format is whichever one is selected in
Settings -> Invoice Workflows; it is edited in place, once, and left alone
if it already prints the note or has no recognisable spot for it.
"""

import frappe

from watch_doctor.invoice_note import add_note_to_print_format, ensure_invoice_note_field
from watch_doctor.invoice_settings import WORKFLOW_REPAIR_SERVICE, get_workflow_settings


def execute():
	ensure_invoice_note_field()

	print_format = get_workflow_settings(WORKFLOW_REPAIR_SERVICE).get("print_format")
	result = add_note_to_print_format(print_format)
	if result == "skipped":
		frappe.log_error(
			f"Could not add the invoice note to print format '{print_format}'. "
			+ "Add {{ doc.dw_invoice_note }} to it manually.",
			"Invoice note not added to print format",
		)

	frappe.db.commit()
