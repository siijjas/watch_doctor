"""Create the three Watch Doctor custom roles if they don't already exist.

Called automatically via ``after_migrate`` (see hooks.py) so that fresh
installs and upgrades always have the roles available.
"""

import frappe


ROLES = [
    {
        "role_name": "DW Executive",
        "desk_access": 1,
        "is_custom": 1,
    },
    {
        "role_name": "DW Data Entry",
        "desk_access": 1,
        "is_custom": 1,
    },
    {
        "role_name": "DW Technician",
        "desk_access": 1,
        "is_custom": 1,
    },
]


def execute():
    """Idempotent: creates roles only when missing, then auto-links technician users by email."""
    for role_def in ROLES:
        name = role_def["role_name"]
        if not frappe.db.exists("Role", name):
            doc = frappe.get_doc({"doctype": "Role", **role_def})
            doc.insert(ignore_permissions=True)
            frappe.logger().info(f"Created role: {name}")

    link_technician_users()
    frappe.db.commit()


def link_technician_users():
    """Auto-populate DW Technician.user for any record whose email matches a Frappe User.

    Safe to call repeatedly — only updates rows where user is NULL or mismatched.
    """
    try:
        frappe.db.sql("""
            UPDATE `tabDW Technician` t
            INNER JOIN `tabUser` u ON u.email = t.email
            SET t.user = u.name, t.modified = NOW()
            WHERE (t.user IS NULL OR t.user = '')
              AND t.email IS NOT NULL AND t.email != ''
        """)
    except Exception:
        frappe.log_error(frappe.get_traceback(), "link_technician_users failed")
