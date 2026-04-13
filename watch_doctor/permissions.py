"""
RBAC permission hooks for Watch Doctor Repair Management.

Implements:
- permission_query_conditions: SQL-level row filtering (list views)
- has_permission: document-level access control (read/write/delete)
- Role helpers used by API endpoints
"""

import frappe

# ---------------------------------------------------------------------------
# Role constants
# ---------------------------------------------------------------------------
ROLE_EXECUTIVE = "DW Executive"
ROLE_DATA_ENTRY = "DW Data Entry"
ROLE_TECHNICIAN = "DW Technician"
ALL_DW_ROLES = {ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN}

# Roles that bypass technician-level restrictions
PRIVILEGED_ROLES = {"System Manager", "Administrator", ROLE_EXECUTIVE, ROLE_DATA_ENTRY}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has_any_role(roles, allowed):
    """Check if any of the user's roles are in the allowed set."""
    return bool(set(roles) & set(allowed))


def get_dw_roles(user=None):
    """Return a list of DW role slugs for the given (or current) user.

    Slugs: "executive", "data_entry", "technician"
    """
    roles = frappe.get_roles(user)
    dw_roles = []
    if _has_any_role(roles, {"System Manager", "Administrator", ROLE_EXECUTIVE}):
        dw_roles.append("executive")
    if ROLE_DATA_ENTRY in roles:
        dw_roles.append("data_entry")
    if ROLE_TECHNICIAN in roles:
        dw_roles.append("technician")
    return dw_roles


def get_current_technician_identifiers(user=None):
    """Return candidate values that may appear in DW Repair Item.technician.

    We support legacy and mixed setups by matching against:
    - DW Technician.name
    - DW Technician.technician_name
    - DW Technician.email

    Resolution priority:
    1) DW Technician.user == current user
    2) DW Technician.email == User.email
    3) DW Technician.email == session user (when username is email)
    """
    user = user or frappe.session.user

    tech = frappe.db.get_value(
        "DW Technician",
        {"user": user},
        ["name", "technician_name", "email"],
        as_dict=True,
    )

    if not tech:
        user_email = frappe.db.get_value("User", user, "email")
        if user_email:
            tech = frappe.db.get_value(
                "DW Technician",
                {"email": user_email},
                ["name", "technician_name", "email"],
                as_dict=True,
            )

    if not tech and "@" in user:
        tech = frappe.db.get_value(
            "DW Technician",
            {"email": user},
            ["name", "technician_name", "email"],
            as_dict=True,
        )

    if not tech:
        return []

    identifiers = []
    for value in [tech.get("name"), tech.get("technician_name"), tech.get("email")]:
        if value and str(value).strip() and value not in identifiers:
            identifiers.append(str(value).strip())
    return identifiers


def get_current_technician(user=None):
    """Return primary DW Technician identifier (doctype name when possible)."""
    user = user or frappe.session.user
    tech_ids = get_current_technician_identifiers(user)
    if not tech_ids:
        return None

    for value in tech_ids:
        if frappe.db.exists("DW Technician", value):
            return value
    return tech_ids[0]


def require_roles(*allowed_roles):
    """Raise PermissionError if the current user lacks every listed role.

    System Manager / Administrator always pass.
    """
    roles = set(frappe.get_roles())
    if roles & {"System Manager", "Administrator"}:
        return
    if roles & set(allowed_roles):
        return
    frappe.throw(frappe._("Insufficient permissions"), frappe.PermissionError)


def can_access_repair_order(order_name, user=None):
    """Return True if the user may access the given repair order.

    Executives and Data Entry can access all orders.
    Technicians can only access orders where they are assigned to at least one item.
    """
    roles = set(frappe.get_roles(user))
    if roles & PRIVILEGED_ROLES:
        return True
    if ROLE_TECHNICIAN in roles:
        tech_values = get_current_technician_identifiers(user)
        if tech_values:
            return frappe.db.exists(
                "DW Repair Item",
                {"parent": order_name, "technician": ["in", tech_values]},
            )
    return False


# ---------------------------------------------------------------------------
# Frappe permission hooks (registered in hooks.py)
# ---------------------------------------------------------------------------

def repair_order_query_conditions(user):
    """Return SQL WHERE fragment for DW Repair Order list queries.

    Called automatically by frappe.get_list / frappe.get_all (when
    ignore_permissions is False) via the permission_query_conditions hook.
    """
    if not user:
        user = frappe.session.user

    roles = set(frappe.get_roles(user))

    # Privileged users see everything
    if roles & PRIVILEGED_ROLES:
        return ""

    # Technicians see only orders with items assigned to them
    if ROLE_TECHNICIAN in roles:
        tech_values = get_current_technician_identifiers(user)
        if tech_values:
            escaped_values = ", ".join(frappe.db.escape(v) for v in tech_values)
            return (
                "`tabDW Repair Order`.name IN ("
                "  SELECT parent FROM `tabDW Repair Item`"
                "  WHERE technician IN ({values})"
                ")".format(values=escaped_values)
            )
        # Technician without a linked record → see nothing
        return "1=0"

    # No recognised DW role → see nothing
    return "1=0"


def repair_order_has_permission(doc, ptype="read", user=None):
    """Document-level permission check for DW Repair Order.

    Invoked for individual document access (read, write, cancel, etc.).
    """
    if not user:
        user = frappe.session.user

    roles = set(frappe.get_roles(user))

    # Privileged users always pass
    if roles & PRIVILEGED_ROLES:
        return True

    if ROLE_TECHNICIAN in roles:
        tech_values = get_current_technician_identifiers(user)
        if not tech_values:
            return False
        # Check whether this technician is assigned to any item on this order
        order_name = doc if isinstance(doc, str) else doc.name
        return bool(
            frappe.db.exists(
                "DW Repair Item",
                {"parent": order_name, "technician": ["in", tech_values]},
            )
        )

    return False
