from __future__ import unicode_literals

import frappe


def execute():
    """Backfill display_order on templates using current alphabetical order.

    Preserves today's list order as the baseline so shops can then move
    frequently used complaints/conditions to the top without re-numbering
    everything.
    """
    frappe.reload_doc("repair_management", "doctype", "dw_issue_template")
    frappe.reload_doc("repair_management", "doctype", "dw_watch_condition_template")

    _backfill("DW Issue Template", "issue_name")
    _backfill("DW Watch Condition Template", "condition_name")


def _backfill(doctype, name_field):
    if not frappe.db.has_column(doctype, "display_order"):
        return

    rows = frappe.get_all(doctype, fields=["name"], order_by=f"{name_field} asc")
    for idx, row in enumerate(rows, start=1):
        frappe.db.set_value(doctype, row.name, "display_order", idx, update_modified=False)
