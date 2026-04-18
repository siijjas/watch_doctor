"""Core Bahrain Profit Margin Scheme logic for Sales Invoices."""

import frappe
from frappe.utils import flt

from watch_doctor.invoice_settings import WORKFLOW_POS_PMS, get_workflow_settings

REQUIRED_PMS_CONFIGURATION_FIELDS = (
    ("pms_item_group", "PMS Item Group"),
    ("pms_vat_account", "PMS VAT Account"),
    ("pms_disclaimer", "PMS Disclaimer"),
    ("standard_sales_taxes_template", "Standard Sales Taxes Template"),
    ("standard_item_tax_template", "Standard Item Tax Template"),
    ("pms_print_format", "PMS Print Format"),
    ("pms_vat_divisor", "PMS VAT Divisor"),
)

# Custom field names (created by setup_pms.py)
CF_IS_PMS = "dw_is_pms_item"             # Sales Invoice Item (Check)
CF_PMS_PURCHASE_COST = "dw_pms_purchase_cost"  # Sales Invoice Item (Currency)
CF_PMS_MARGIN = "dw_pms_margin"           # Sales Invoice Item (Currency)
CF_PMS_VAT = "dw_pms_vat"                 # Sales Invoice Item (Currency)
CF_HAS_PMS = "dw_has_pms_items"           # Sales Invoice (Check)
CF_PMS_TOTAL_VAT = "dw_pms_total_vat"     # Sales Invoice (Currency)
CF_PMS_DISCLAIMER = "dw_pms_disclaimer"   # Sales Invoice (Small Text, read-only)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clear_pms_runtime_configuration_cache():
    """Clear request-local PMS configuration caches."""
    for attr in ("dw_pms_settings", "dw_pms_item_groups"):
        if hasattr(frappe.local, attr):
            delattr(frappe.local, attr)


def get_pms_runtime_configuration() -> dict:
    """Return runtime PMS configuration from singleton fields only."""
    cached = getattr(frappe.local, "dw_pms_settings", None)
    if cached is not None:
        return cached

    config = {
        "pms_enabled": 0,
        "pms_item_group": "",
        "pms_vat_account": "",
        "pms_disclaimer": "",
        "standard_sales_taxes_template": "",
        "standard_item_tax_template": "",
        "pms_print_format": "",
        "pms_vat_divisor": 0.0,
    }

    try:
        if frappe.db.exists("DocType", "DW PMS Settings"):
            config["pms_enabled"] = int(frappe.db.get_single_value("DW PMS Settings", "pms_enabled") or 0)
            config["pms_item_group"] = frappe.db.get_single_value("DW PMS Settings", "pms_item_group") or ""
            config["pms_vat_account"] = frappe.db.get_single_value("DW PMS Settings", "pms_vat_account") or ""
            config["pms_disclaimer"] = frappe.db.get_single_value("DW PMS Settings", "pms_disclaimer") or ""
            config["standard_sales_taxes_template"] = frappe.db.get_single_value("DW PMS Settings", "standard_sales_taxes_template") or ""
            config["standard_item_tax_template"] = frappe.db.get_single_value("DW PMS Settings", "standard_item_tax_template") or ""
            config["pms_print_format"] = frappe.db.get_single_value("DW PMS Settings", "pms_print_format") or ""
            config["pms_vat_divisor"] = float(frappe.db.get_single_value("DW PMS Settings", "pms_vat_divisor") or 0)
    except Exception:
        pass

    try:
        workflow_settings = get_workflow_settings(WORKFLOW_POS_PMS)
        if workflow_settings.get("print_format"):
            config["pms_print_format"] = workflow_settings["print_format"]
    except Exception:
        pass

    frappe.local.dw_pms_settings = config
    return config


def get_standard_sales_taxes_template() -> str:
    """Return the configured standard Sales Taxes template for non-PMS invoices."""
    return get_pms_runtime_configuration().get("standard_sales_taxes_template") or ""


def require_pms_runtime_configuration() -> dict:
    """Require a complete PMS configuration when PMS mode is enabled."""
    config = get_pms_runtime_configuration()
    if not config.get("pms_enabled"):
        return config

    missing_fields = []
    for fieldname, label in REQUIRED_PMS_CONFIGURATION_FIELDS:
        value = config.get(fieldname)
        if fieldname == "pms_vat_divisor":
            if flt(value) <= 0:
                missing_fields.append(label)
            continue
        if not value:
            missing_fields.append(label)

    if missing_fields:
        frappe.throw(
            "Profit Margin Scheme is enabled but the configuration is incomplete. "
            f"Complete these fields in DW PMS Settings: {', '.join(missing_fields)}."
        )

    return config

def _get_pms_item_groups() -> set:
    """
    Return the configured Item Group name treated as PMS.
    Result is cached per request.
    """
    cached = getattr(frappe.local, "dw_pms_item_groups", None)
    if cached is not None:
        return cached

    config = get_pms_runtime_configuration()
    if not config.get("pms_enabled"):
        frappe.local.dw_pms_item_groups = set()
        return frappe.local.dw_pms_item_groups

    configured_group = config.get("pms_item_group") or ""
    groups: set = {configured_group} if configured_group else set()
    frappe.local.dw_pms_item_groups = groups
    return groups


def _is_pms_item(item_code: str) -> bool:
    """Return True if the item belongs to any configured PMS Item Group."""
    if not item_code:
        return False
    item_group = frappe.db.get_value("Item", item_code, "item_group")
    if not item_group:
        return False
    return item_group in _get_pms_item_groups()


def validate_pms_item_mix(item_codes: list[str]) -> tuple[list[str], list[str]]:
    """
    Validate that PMS items are not mixed with non-PMS items on one invoice.

    Returns a tuple of (pms_item_codes, non_pms_item_codes).
    Throws a validation error if both groups are present.
    """
    filtered_item_codes = [item_code for item_code in item_codes if item_code]
    pms_item_codes = [item_code for item_code in filtered_item_codes if _is_pms_item(item_code)]
    non_pms_item_codes = [item_code for item_code in filtered_item_codes if item_code not in pms_item_codes]

    if pms_item_codes and non_pms_item_codes:
        frappe.throw(
            "Profit Margin Scheme items cannot be mixed with standard VAT items on the same invoice. "
            f"PMS items: {', '.join(sorted(set(pms_item_codes)))}. "
            f"Non-PMS items: {', '.join(sorted(set(non_pms_item_codes)))}. "
            "Create separate invoices for PMS and non-PMS items."
        )

    return pms_item_codes, non_pms_item_codes


def _get_purchase_cost(item_code: str, warehouse: str | None = None) -> float:
    """
    Return the absorbed purchase cost for a used-watch item.

    Priority:
      1. Bin.valuation_rate for the specific warehouse (if given)
      2. Bin.valuation_rate across all warehouses (MAX — there should be only 1 bin since qty=1)
      3. Item.valuation_rate  (standard rate on the master)
      4. 0.0  (safety fallback — should never happen for a real item)
    """
    valuation = 0.0

    if warehouse:
        valuation = flt(frappe.db.get_value(
            "Bin",
            {"item_code": item_code, "warehouse": warehouse},
            "valuation_rate",
        ))

    if not valuation:
        # Pick the highest valuation_rate across warehouses (unique items have a single bin)
        result = frappe.db.sql(
            """SELECT MAX(valuation_rate) AS vr
               FROM `tabBin`
               WHERE item_code = %s AND actual_qty > 0""",
            (item_code,),
            as_dict=True,
        )
        if result and result[0].vr:
            valuation = flt(result[0].vr)

    if not valuation:
        valuation = flt(frappe.db.get_value("Item", item_code, "valuation_rate"))

    return valuation


def _calc_pms_vat(selling_price: float, purchase_cost: float) -> dict:
    """
    Calculate PMS VAT from the selling price and purchase cost.

    Returns dict with keys: margin, vat, net_revenue.
    If margin ≤ 0 (sold at or below cost), VAT is 0.
    """
    margin = flt(selling_price - purchase_cost, 3)
    if margin <= 0:
        return {"margin": 0.0, "vat": 0.0, "net_revenue": selling_price}

    divisor = flt(require_pms_runtime_configuration().get("pms_vat_divisor"), 6)
    if divisor <= 0:
        frappe.throw("PMS VAT Divisor must be greater than zero in DW PMS Settings")

    vat = flt(margin / divisor, 3)
    net_revenue = flt(selling_price - vat, 3)
    return {"margin": margin, "vat": vat, "net_revenue": net_revenue}


# ---------------------------------------------------------------------------
# Sales Invoice — validate  (called on every save)
# ---------------------------------------------------------------------------

def si_validate(doc, method=None):
    """
    Populate PMS custom fields on each Sales Invoice Item that belongs to
    the configured PMS item group. Also set invoice-level PMS flags.

    This runs on validate so the data is always fresh before submission.
    """
    config = require_pms_runtime_configuration()

    pms_item_codes, _non_pms_item_codes = validate_pms_item_mix(
        [item.item_code for item in doc.items if item.item_code]
    )

    has_pms = bool(pms_item_codes)
    total_pms_vat = 0.0

    for item in doc.items:
        if _is_pms_item(item.item_code):
            has_pms = True
            selling_price = flt(item.amount)  # qty × rate (qty is always 1)
            warehouse = item.warehouse or doc.set_warehouse
            purchase_cost = _get_purchase_cost(item.item_code, warehouse)
            pms = _calc_pms_vat(selling_price, purchase_cost)

            item.set(CF_IS_PMS, 1)
            item.set(CF_PMS_PURCHASE_COST, purchase_cost)
            item.set(CF_PMS_MARGIN, pms["margin"])
            item.set(CF_PMS_VAT, pms["vat"])
            total_pms_vat += pms["vat"]
        else:
            # Clear PMS fields for non-PMS items
            item.set(CF_IS_PMS, 0)
            item.set(CF_PMS_PURCHASE_COST, 0)
            item.set(CF_PMS_MARGIN, 0)
            item.set(CF_PMS_VAT, 0)

    disclaimer = config.get("pms_disclaimer") or ""

    doc.set(CF_HAS_PMS, 1 if has_pms else 0)
    doc.set(CF_PMS_TOTAL_VAT, flt(total_pms_vat, 3))
    doc.set(CF_PMS_DISCLAIMER, disclaimer if has_pms else "")

    # When ALL items on the invoice are PMS items, remove any standard Sales Tax rows.
    # ERPNext auto-applies the company default tax template; we must clear it so VAT is
    # not double-counted (PMS VAT is posted via GL reclassification on submit instead).
    if has_pms and all(_is_pms_item(i.item_code) for i in doc.items):
        doc.taxes_and_charges = ""
        doc.set("taxes", [])


# ---------------------------------------------------------------------------
# Sales Invoice — on_submit  (post the PMS VAT GL entries)
# ---------------------------------------------------------------------------

def si_on_submit(doc, method=None):
    """
    After ERPNext creates the standard GL entries for the Sales Invoice,
    reclassify the PMS VAT portion from Revenue → VAT Output liability.

    Standard GL for a PMS item (no tax template):
        Dr  Debtors       1,100
        Cr  Sales Revenue 1,100

    We need to add:
        Dr  Sales Revenue     27.273   (reduce revenue by VAT amount)
        Cr  Configured PMS VAT account  27.273   (recognize the VAT liability)
    """
    if not doc.get(CF_HAS_PMS):
        return

    total_pms_vat = flt(doc.get(CF_PMS_TOTAL_VAT), 3)
    if total_pms_vat <= 0:
        return

    company = doc.company
    vat_account = _get_pms_vat_account(company)
    if not vat_account:
        frappe.throw(
            f"PMS VAT Output account is not configured for company {company}. "
            "Update DW PMS Settings before submitting PMS invoices."
        )

    # Determine the income account used on the invoice items
    income_accounts = set()
    for item in doc.items:
        if item.get(CF_IS_PMS) and flt(item.get(CF_PMS_VAT)) > 0:
            income_accounts.add(item.income_account)

    if not income_accounts:
        return

    from erpnext.accounts.general_ledger import make_gl_entries

    gl_entries = []
    cost_center = doc.cost_center or frappe.db.get_value(
        "Company", company, "cost_center"
    )

    # Aggregate PMS VAT per income account for cleaner GL
    account_vat_map = {}
    for item in doc.items:
        if item.get(CF_IS_PMS) and flt(item.get(CF_PMS_VAT)) > 0:
            acc = item.income_account
            account_vat_map[acc] = flt(account_vat_map.get(acc, 0)) + flt(item.get(CF_PMS_VAT))

    for income_account, vat_amount in account_vat_map.items():
        vat_amount = flt(vat_amount, 3)
        if vat_amount <= 0:
            continue

        # Dr: Income Account (reduce revenue)
        gl_entries.append(
            doc.get_gl_dict({
                "account": income_account,
                "debit": vat_amount,
                "debit_in_account_currency": vat_amount,
                "cost_center": cost_center,
                "against": vat_account,
                "remarks": f"PMS VAT reclassification — {doc.name}",
                "is_opening": "No",
            })
        )

        # Cr: configured PMS VAT account (recognize liability)
        gl_entries.append(
            doc.get_gl_dict({
                "account": vat_account,
                "credit": vat_amount,
                "credit_in_account_currency": vat_amount,
                "cost_center": cost_center,
                "against": income_account,
                "remarks": f"PMS VAT on {doc.name}",
                "is_opening": "No",
            })
        )

    if gl_entries:
        make_gl_entries(gl_entries, merge_entries=False)


# ---------------------------------------------------------------------------
# Sales Invoice — on_cancel  (reverse PMS GL entries)
# ---------------------------------------------------------------------------

def si_on_cancel(doc, method=None):
    """
    Reverse the PMS VAT GL entries posted on submit.
    ERPNext auto-reverses the standard GL. We reverse our additional entries.
    """
    if not doc.get(CF_HAS_PMS):
        return

    total_pms_vat = flt(doc.get(CF_PMS_TOTAL_VAT), 3)
    if total_pms_vat <= 0:
        return

    company = doc.company
    vat_account = _get_pms_vat_account(company)
    if not vat_account:
        return

    from erpnext.accounts.general_ledger import make_reverse_gl_entries

    # Reverse all GL entries that match our PMS remark pattern
    gl_entries = frappe.get_all(
        "GL Entry",
        filters={
            "voucher_type": "Sales Invoice",
            "voucher_no": doc.name,
            "remarks": ["like", "PMS VAT%"],
            "is_cancelled": 0,
        },
        pluck="name",
    )

    if gl_entries:
        make_reverse_gl_entries(voucher_type="Sales Invoice", voucher_no=doc.name)


# ---------------------------------------------------------------------------
# Account resolution
# ---------------------------------------------------------------------------

def _get_pms_vat_account(company: str) -> str | None:
    """
    Return the configured PMS VAT Output account for the given company.
    """
    try:
        account = get_pms_runtime_configuration().get("pms_vat_account")
        if account and frappe.db.get_value("Account", account, "company") == company:
            return account
    except Exception:
        pass

    return None


# ---------------------------------------------------------------------------
# Whitelist: Get PMS data for an item (used by POS frontend)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_pms_info(item_code: str, selling_price: float = 0, warehouse: str = ""):
    """
    Return PMS calculation info for a given item.
    Called by the POS frontend to show internal margin info to staff.
    """
    if not _is_pms_item(item_code):
        return {"is_pms": False}

    config = require_pms_runtime_configuration()
    purchase_cost = _get_purchase_cost(item_code, warehouse or None)
    pms = _calc_pms_vat(flt(selling_price), purchase_cost)

    return {
        "is_pms": True,
        "purchase_cost": purchase_cost,
        "selling_price": flt(selling_price),
        "margin": pms["margin"],
        "vat": pms["vat"],
        "net_revenue": pms["net_revenue"],
        "disclaimer": config.get("pms_disclaimer") or "",
    }


# ---------------------------------------------------------------------------
# Whitelist: PMS VAT report data
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_pms_vat_report(from_date: str, to_date: str):
    """
    Return PMS VAT summary for the given period.
    Used for NBR VAT return preparation.
    """
    from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE
    require_roles(ROLE_EXECUTIVE)

    rows = frappe.db.sql(
        f"""
        SELECT
            si.name AS invoice,
            si.posting_date,
            si.customer,
            si.customer_name,
            sii.item_code,
            sii.item_name,
            sii.amount AS selling_price,
            sii.{CF_PMS_PURCHASE_COST} AS purchase_cost,
            sii.{CF_PMS_MARGIN} AS margin,
            sii.{CF_PMS_VAT} AS vat_amount
        FROM `tabSales Invoice Item` sii
        INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
        WHERE si.docstatus = 1
          AND si.{CF_HAS_PMS} = 1
          AND sii.{CF_IS_PMS} = 1
          AND si.posting_date BETWEEN %s AND %s
        ORDER BY si.posting_date, si.name
        """,
        (from_date, to_date),
        as_dict=True,
    )

    total_sales = sum(flt(r["selling_price"]) for r in rows)
    total_cost = sum(flt(r["purchase_cost"]) for r in rows)
    total_margin = sum(flt(r["margin"]) for r in rows)
    total_vat = sum(flt(r["vat_amount"]) for r in rows)

    return {
        "rows": rows,
        "summary": {
            "total_sales": total_sales,
            "total_purchase_cost": total_cost,
            "total_margin": total_margin,
            "total_vat": total_vat,
            "item_count": len(rows),
        },
    }
