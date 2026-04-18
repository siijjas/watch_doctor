"""Grant DW roles access on ERPNext native doctypes that the app accesses.

Runs idempotently on bench migrate via add_permission / update_permission_property.
"""

import frappe
from frappe.permissions import add_permission, update_permission_property


# (doctype, role, {permission_key: value, ...})
# Keys match DocPerm fields: read, write, create, submit, cancel, print, email, report, export
PERMISSIONS = [
    # ── Quotation ──────────────────────────────────────────────────────────
    ("Quotation",       "DW Executive",   {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "email": 1, "report": 1, "export": 1}),
    ("Quotation",       "DW Data Entry",  {"read": 1, "print": 1, "email": 1}),

    # ── Sales Invoice ──────────────────────────────────────────────────────
    ("Sales Invoice",   "DW Executive",   {"read": 1, "write": 1, "create": 1, "submit": 1, "cancel": 1, "print": 1, "email": 1, "report": 1, "export": 1}),
    ("Sales Invoice",   "DW Data Entry",  {"read": 1, "print": 1, "email": 1}),

    # ── Customer ───────────────────────────────────────────────────────────
    ("Customer",        "DW Executive",   {"read": 1, "write": 1, "create": 1, "delete": 1, "print": 1, "email": 1, "report": 1, "export": 1}),
    ("Customer",        "DW Data Entry",  {"read": 1, "write": 1, "create": 1, "print": 1, "email": 1}),
    ("Customer",        "DW Technician",  {"read": 1}),

    # ── Contact ────────────────────────────────────────────────────────────
    ("Contact",         "DW Executive",   {"read": 1, "write": 1, "create": 1, "delete": 1}),
    ("Contact",         "DW Data Entry",  {"read": 1, "write": 1, "create": 1}),
    ("Contact",         "DW Technician",  {"read": 1}),

    # ── Item (parts / services) ────────────────────────────────────────────
    ("Item",            "DW Executive",   {"read": 1, "write": 1, "create": 1, "print": 1, "report": 1, "export": 1}),
    ("Item",            "DW Data Entry",  {"read": 1}),
    ("Item",            "DW Technician",  {"read": 1}),

    # ── Mode of Payment (needed by payment modal) ──────────────────────────
    ("Mode of Payment", "DW Executive",   {"read": 1, "write": 1}),
    ("Mode of Payment", "DW Data Entry",  {"read": 1}),

    # ── POS configuration helpers ─────────────────────────────────────────
    ("POS Profile",     "DW Executive",   {"read": 1}),
    ("POS Profile",     "DW Data Entry",  {"read": 1}),
    ("Sales Person",    "DW Executive",   {"read": 1, "write": 1, "create": 1, "delete": 1, "report": 1, "export": 1}),
    ("Sales Person",    "DW Data Entry",  {"read": 1}),
]


def execute():
    """Idempotently add/update DocPerm rows for DW roles on native doctypes."""
    for doctype, role, perms in PERMISSIONS:
        add_permission(doctype, role, 0)
        for prop, val in perms.items():
            update_permission_property(doctype, role, 0, prop, val)
    frappe.db.commit()
