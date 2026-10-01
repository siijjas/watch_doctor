"""Print the invoice note on the "DW POS Receipt" thermal format.

That format is picked by hand in Desk to print a service invoice on the
80mm receipt printer, so it needs the same note as the A4 repair invoice.
"""

import frappe

from watch_doctor.invoice_note import NOTE_PRINT_BLOCK_THERMAL, add_note_to_print_format

PRINT_FORMAT = "DW POS Receipt"


def execute():
	if not frappe.db.exists("Print Format", PRINT_FORMAT):
		return

	result = add_note_to_print_format(PRINT_FORMAT, block=NOTE_PRINT_BLOCK_THERMAL)
	if result == "skipped":
		frappe.log_error(
			f"Could not add the invoice note to print format '{PRINT_FORMAT}'. "
			+ "Add {{ doc.dw_invoice_note }} to it manually.",
			"Invoice note not added to print format",
		)

	frappe.db.commit()
