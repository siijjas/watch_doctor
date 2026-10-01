"""Customer-facing note on a Sales Invoice (warranty period, "No water proof guarantee", ...).

Stored in the dw_invoice_note custom field and printed by the invoice print
format. The print formats in use are customised per site in Desk, so the
note block is injected into the stored HTML rather than shipped as a file.
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

NOTE_FIELDNAME = "dw_invoice_note"
NOTE_MAX_LENGTH = 500

NOTE_FIELD = {
	"fieldname": NOTE_FIELDNAME,
	"fieldtype": "Small Text",
	"label": "Invoice Note",
	"insert_after": "terms",
	"allow_on_submit": 1,
	"no_copy": 1,
	"description": "Printed on the invoice, e.g. warranty period or \"No water proof guarantee\".",
}

NOTE_PRINT_BLOCK = """
  <!-- INVOICE NOTE -->
  {% if doc.dw_invoice_note %}
  <div class="dw-invoice-note" style="margin-top: 24px; padding: 10px 12px; border: 0.5px solid #d0d0d0; font-size: 9pt; page-break-inside: avoid;">
    <div style="font-size: 7.5pt; text-transform: uppercase; color: #999; letter-spacing: 1px; margin-bottom: 4px;">Note</div>
    <div style="white-space: pre-line;">{{ doc.dw_invoice_note | e }}</div>
  </div>
  {% endif %}

"""

# Same note for the narrow thermal receipt layout (80mm roll).
NOTE_PRINT_BLOCK_THERMAL = """
<!-- INVOICE NOTE -->
{% if doc.dw_invoice_note %}
<div class="dw-invoice-note" style="margin-top: 12px; font-size: 14px; line-height: 1.4;">
    <div style="font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">Note</div>
    <div style="white-space: pre-line;">{{ doc.dw_invoice_note | e }}</div>
</div>
{% endif %}

"""

# The note goes above the first of these found in the print format body.
PRINT_ANCHORS = ['<div class="sig-section">', '<div class="doc-footer"']


def ensure_invoice_note_field():
	create_custom_fields({"Sales Invoice": [NOTE_FIELD]}, update=True)


def clean_invoice_note(note) -> str:
	return str(note or "").strip()[:NOTE_MAX_LENGTH]


def add_note_to_print_format(print_format_name: str, block: str = NOTE_PRINT_BLOCK) -> str:
	"""Insert the note block into a Jinja print format. Returns "added", "present" or "skipped"."""
	if not print_format_name or not frappe.db.exists("Print Format", print_format_name):
		return "skipped"

	html = frappe.db.get_value("Print Format", print_format_name, "html") or ""
	if NOTE_FIELDNAME in html:
		return "present"

	for anchor in PRINT_ANCHORS:
		position = html.find(anchor)
		if position != -1:
			html = html[:position] + block.lstrip("\n") + "  " + html[position:]
			frappe.db.set_value("Print Format", print_format_name, "html", html)
			frappe.clear_cache(doctype="Print Format")
			return "added"

	return "skipped"
