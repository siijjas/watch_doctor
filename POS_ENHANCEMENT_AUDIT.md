# POS Enhancement Audit and Implementation Pack

## Scope and Baseline

This audit is based on the current custom POS flow implemented in:

- `frontend/src/components/POS.tsx`
- `frontend/src/services/apiService.ts`
- `watch_doctor/api.py`
- `watch_doctor/pms.py`
- `watch_doctor/public/js/sales_invoice_pms.js`
- `frontend/src/components/Settings.tsx`

The current app uses a custom React POS that writes standard `Sales Invoice` records with `is_pos = 1`; it does not use ERPNext's stock POS page. That matters because the safe extension surface is your own app code, standard Frappe hooks, custom fields, bundled print formats, and namespaced settings doctypes.

All recommendations below stay inside the Repair Management app namespace and avoid core overrides, monkey patches, direct SQL updates to metadata, or unsupported JS overrides.

## Current POS State

Implemented now:

- Item search with stock quantity and editable unit price
- Customer search and selection
- Hold/resume draft invoices via draft `Sales Invoice`
- Split payments across multiple `Mode of Payment`
- Percentage and amount discounts
- PMS vs standard VAT separation during invoice creation
- PMS desk print helper and PMS settings UI

Not implemented now:

- Auto-print on submit/payment completion
- Salesperson capture and commission sync
- Configurable fallback walk-in customer
- Dynamic receipt print-format picker in POS
- POS naming series selection
- Branch/warehouse aware retail flow
- Shift enforcement and closure linkage
- Payment reference capture for card/bank transactions
- Proper POS returns/exchanges
- Barcode/serial-driven checkout
- Price/discount governance by role
- Offline queue or retry-safe checkout

## Gap Analysis Table

| Feature | Native Status In Current App | Implementation Method | Effort | Role Impact |
| --- | --- | --- | --- | --- |
| Auto-print receipt after payment | Missing | Frontend client code + Sales Invoice hook + print URL helper | Medium | Cashier, Executive |
| Salesperson assignment and commission | Missing | Sales Invoice custom fields + server hook to sync `sales_team` | Medium | Cashier, Sales Manager, Executive |
| Configurable default customer | Missing | POS settings singleton + POS runtime config + server fallback | Low | Cashier |
| Dynamic print format per transaction | Missing | Sales Invoice custom field + POS runtime config + bundled print formats | Medium | Cashier, Executive |
| Sales Invoice series selector | Missing | POS profile custom fields + settings singleton + server validation | Medium | Cashier, Executive |
| Branch and warehouse control | Missing | Settings singleton + Sales Invoice custom fields + server validation | Medium | Cashier, Stock Manager, Executive |
| Shift link and closure safety | Missing | `DW POS Shift` doctype + validation hook + checklist | Medium | Cashier, Executive |
| Payment reference capture | Missing | Sales Invoice custom field + runtime rule by payment mode | Low | Cashier, Accounts |
| Role-based price and discount override | Missing | Settings singleton + frontend visibility + server validation | Medium | Cashier, Executive |
| POS return and exchange flow | Stub only | New whitelisted API + negative invoice / return document flow | Medium | Cashier, Accounts |
| Barcode and serial capture | Missing | POS frontend input + item/serial lookup API + Sales Invoice Item mapping | Medium | Cashier, Stock Manager |
| Offline retry protection | Missing | Local storage queue for unsent carts + idempotency token on API | High | Cashier, Executive |
| Customer phone lookup / walk-in speed | Weak | API enhancement + default customer + create-customer shortcut | Low | Cashier |
| Branch price list support | Missing | Settings singleton + context payload + server price resolution | Medium | Cashier, Executive |

## Root Cause and Supported Fix Path

| Gap | Root Cause / Native Limitation | Supported Fix Path | PMS / VAT Integration |
| --- | --- | --- | --- |
| Auto-print | `create_pos_invoice` and `submit_pos_draft` return only invoice totals; no print metadata, and POS frontend never opens a print URL | Return `print_url`, `print_format`, and `auto_print` from app API; open from custom POS after successful submit | Choose PMS print format automatically when `dw_has_pms_items = 1` |
| Salesperson / commission | Current POS creates `Sales Invoice` without primary sales person; standard `sales_team` child table is never populated | Add `dw_pos_sales_person` + `dw_pos_commission_rate`, then sync `sales_team` in hook | PMS logic remains unchanged because it runs on invoice validation and GL reclass, not sales-team rows |
| Default customer | `create_pos_invoice` hard-fails when customer is blank | Read company-level default walk-in customer from settings and apply server-side fallback | Safe for PMS; customer defaulting does not touch tax logic |
| Dynamic print format | App only exposes PMS print format in current settings and desk button | Add per-company default receipt format plus per-transaction override field on invoice | When invoice has PMS items, server must force PMS-safe receipt unless user explicitly selects a PMS-safe alternative |
| Naming series | POS API leaves naming series empty, so normal Sales Invoice series applies | Add allowed/default POS series in settings and validate chosen series before insert | No effect on VAT logic |
| Branch / warehouse | Stock query aggregates across all bins; invoice creation does not bind a branch warehouse | Pass warehouse/branch in POS context; validate warehouse-company compatibility before insert | PMS purchase cost should keep using item warehouse when set |
| Shift control | No shift document or invoice linkage exists in current app | Add namespaced `DW POS Shift`; require open shift for submit; store link on invoice | Shift closure checks submitted POS invoices only; PMS totals remain hidden on receipt but stay in GL |
| Payment reference | Split payment rows capture mode + amount only | Add invoice-level reference field and optionally per-payment JSON payload if needed later | No VAT impact |
| Price / discount governance | Frontend allows free price edit and discount entry for any POS user | Expose role rules from settings; enforce same rules again on server | No VAT impact except final rate continues through current PMS calculation |
| Returns | UI has a return modal but no return API | Create app API that uses supported Sales Invoice return flow and tags return as POS source | PMS return should reuse existing `Sales Invoice` / cancel mechanics; no separate tax display |
| Barcode / serial capture | POS only searches item name/code and never maps serial numbers | Add barcode input, serial lookup API, and child-row serial mapping | PMS watch inventory often depends on serialised stock; this is especially important for used watches |
| Offline retry | POS frontend depends on immediate HTTP success and has no idempotency | Add local storage queue for failed submissions and include `dw_pos_request_id` on invoice for dedupe | Keep queue metadata separate from PMS data |

## Recommended Configuration Model

Use a new singleton doctype named `DW POS Enhancement Settings` and keep existing `DW PMS Settings` as the source of PMS disclaimer text and PMS print format.

Why this is the cleaner split:

- `DW PMS Settings` already owns Bahrain PMS tax behavior.
- Retail runtime controls are broader than VAT and should not overload the PMS singleton.
- A child table per company keeps the enhancement package multi-company safe.
- The POS API can merge `DW POS Enhancement Settings` and `DW PMS Settings` in one cached read.

If your site still exposes a doctype named `POS Settings`, apply the `POS Profile` custom fields below to that doctype instead. ERPNext v15 sites normally use `POS Profile`.

## Deliverable: Settings DocTypes

### Filename: `watch_doctor/repair_management/doctype/dw_pos_enhancement_settings/dw_pos_enhancement_settings.json`

```json
{
  "doctype": "DocType",
  "name": "DW POS Enhancement Settings",
  "module": "Repair Management",
  "custom": 1,
  "issingle": 1,
  "editable_grid": 0,
  "track_changes": 1,
  "field_order": [
    "company_defaults_section",
    "company_defaults",
    "rules_section",
    "hide_pms_tax_on_receipt",
    "enable_offline_retry_queue",
    "offline_retry_limit",
    "enable_barcode_search",
    "require_open_shift",
    "default_non_pms_print_format"
  ],
  "fields": [
    {
      "fieldname": "company_defaults_section",
      "fieldtype": "Section Break",
      "label": "Company Defaults"
    },
    {
      "fieldname": "company_defaults",
      "fieldtype": "Table",
      "label": "Company Defaults",
      "options": "DW POS Company Default",
      "reqd": 1
    },
    {
      "fieldname": "rules_section",
      "fieldtype": "Section Break",
      "label": "Global Rules"
    },
    {
      "fieldname": "hide_pms_tax_on_receipt",
      "fieldtype": "Check",
      "label": "Hide PMS Tax Rows On POS Receipts",
      "default": "1"
    },
    {
      "fieldname": "enable_offline_retry_queue",
      "fieldtype": "Check",
      "label": "Enable Offline Retry Queue",
      "default": "1"
    },
    {
      "fieldname": "offline_retry_limit",
      "fieldtype": "Int",
      "label": "Offline Retry Queue Limit",
      "default": "25"
    },
    {
      "fieldname": "enable_barcode_search",
      "fieldtype": "Check",
      "label": "Enable Barcode Search",
      "default": "1"
    },
    {
      "fieldname": "require_open_shift",
      "fieldtype": "Check",
      "label": "Require Open Shift Before POS Submit",
      "default": "1"
    },
    {
      "fieldname": "default_non_pms_print_format",
      "fieldtype": "Link",
      "label": "Default Non-PMS POS Receipt Format",
      "options": "Print Format"
    }
  ],
  "permissions": [
    {
      "role": "System Manager",
      "read": 1,
      "write": 1,
      "create": 1,
      "delete": 1
    },
    {
      "role": "DW Executive",
      "read": 1,
      "write": 1
    }
  ]
}
```

### Filename: `watch_doctor/repair_management/doctype/dw_pos_company_default/dw_pos_company_default.json`

```json
{
  "doctype": "DocType",
  "name": "DW POS Company Default",
  "module": "Repair Management",
  "custom": 1,
  "istable": 1,
  "editable_grid": 1,
  "field_order": [
    "company",
    "pos_profile",
    "default_customer",
    "default_receipt_format",
    "default_warehouse",
    "default_branch",
    "default_terminal_id",
    "default_sales_person",
    "default_commission_rate",
    "allow_auto_print",
    "allow_series_selector",
    "allowed_naming_series",
    "require_sales_person",
    "require_payment_reference",
    "price_override_roles",
    "discount_override_roles"
  ],
  "fields": [
    {
      "fieldname": "company",
      "fieldtype": "Link",
      "label": "Company",
      "options": "Company",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "pos_profile",
      "fieldtype": "Link",
      "label": "POS Profile",
      "options": "POS Profile"
    },
    {
      "fieldname": "default_customer",
      "fieldtype": "Link",
      "label": "Default Walk-In Customer",
      "options": "Customer"
    },
    {
      "fieldname": "default_receipt_format",
      "fieldtype": "Link",
      "label": "Default Receipt Format",
      "options": "Print Format"
    },
    {
      "fieldname": "default_warehouse",
      "fieldtype": "Link",
      "label": "Default Warehouse",
      "options": "Warehouse"
    },
    {
      "fieldname": "default_branch",
      "fieldtype": "Link",
      "label": "Default Branch",
      "options": "Branch"
    },
    {
      "fieldname": "default_terminal_id",
      "fieldtype": "Data",
      "label": "Default Terminal ID"
    },
    {
      "fieldname": "default_sales_person",
      "fieldtype": "Link",
      "label": "Default Sales Person",
      "options": "Sales Person"
    },
    {
      "fieldname": "default_commission_rate",
      "fieldtype": "Percent",
      "label": "Default Commission Rate"
    },
    {
      "fieldname": "allow_auto_print",
      "fieldtype": "Check",
      "label": "Auto Print",
      "default": "1"
    },
    {
      "fieldname": "allow_series_selector",
      "fieldtype": "Check",
      "label": "Allow Series Selector",
      "default": "1"
    },
    {
      "fieldname": "allowed_naming_series",
      "fieldtype": "Small Text",
      "label": "Allowed Naming Series",
      "description": "One series per line"
    },
    {
      "fieldname": "require_sales_person",
      "fieldtype": "Check",
      "label": "Require Sales Person",
      "default": "1"
    },
    {
      "fieldname": "require_payment_reference",
      "fieldtype": "Check",
      "label": "Require Payment Reference For Non-Cash",
      "default": "1"
    },
    {
      "fieldname": "price_override_roles",
      "fieldtype": "Small Text",
      "label": "Price Override Roles",
      "description": "Comma-separated role names"
    },
    {
      "fieldname": "discount_override_roles",
      "fieldtype": "Small Text",
      "label": "Discount Override Roles",
      "description": "Comma-separated role names"
    }
  ]
}
```

### Filename: `watch_doctor/repair_management/doctype/dw_pos_shift/dw_pos_shift.json`

```json
{
  "doctype": "DocType",
  "name": "DW POS Shift",
  "module": "Repair Management",
  "custom": 1,
  "track_changes": 1,
  "autoname": "format:DW-POS-SHIFT-.YYYY.-.#####",
  "field_order": [
    "company",
    "branch",
    "terminal_id",
    "cashier",
    "status",
    "opening_balance",
    "closing_balance",
    "opening_time",
    "closing_time",
    "notes"
  ],
  "fields": [
    {
      "fieldname": "company",
      "fieldtype": "Link",
      "label": "Company",
      "options": "Company",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "branch",
      "fieldtype": "Link",
      "label": "Branch",
      "options": "Branch"
    },
    {
      "fieldname": "terminal_id",
      "fieldtype": "Data",
      "label": "Terminal ID",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "cashier",
      "fieldtype": "Link",
      "label": "Cashier",
      "options": "User",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "status",
      "fieldtype": "Select",
      "label": "Status",
      "options": "Open\nClosed",
      "default": "Open",
      "reqd": 1,
      "in_list_view": 1
    },
    {
      "fieldname": "opening_balance",
      "fieldtype": "Currency",
      "label": "Opening Balance"
    },
    {
      "fieldname": "closing_balance",
      "fieldtype": "Currency",
      "label": "Closing Balance"
    },
    {
      "fieldname": "opening_time",
      "fieldtype": "Datetime",
      "label": "Opening Time"
    },
    {
      "fieldname": "closing_time",
      "fieldtype": "Datetime",
      "label": "Closing Time"
    },
    {
      "fieldname": "notes",
      "fieldtype": "Small Text",
      "label": "Notes"
    }
  ],
  "permissions": [
    {
      "role": "System Manager",
      "read": 1,
      "write": 1,
      "create": 1,
      "delete": 1
    },
    {
      "role": "DW Executive",
      "read": 1,
      "write": 1,
      "create": 1
    },
    {
      "role": "DW Data Entry",
      "read": 1,
      "write": 1,
      "create": 1
    }
  ]
}
```

## Deliverable: Custom Fields JSON

### Filename: `watch_doctor/fixtures/dw_pos_custom_fields.json`

```json
[
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_section",
    "fieldtype": "Section Break",
    "insert_after": "dw_pms_disclaimer",
    "label": "DW POS Controls",
    "collapsible": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_receipt_printed",
    "fieldtype": "Check",
    "insert_after": "dw_pos_section",
    "label": "POS Receipt Print Triggered",
    "read_only": 1,
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_receipt_format",
    "fieldtype": "Link",
    "insert_after": "dw_pos_receipt_printed",
    "label": "POS Receipt Format",
    "options": "Print Format",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_shift",
    "fieldtype": "Link",
    "insert_after": "dw_pos_receipt_format",
    "label": "DW POS Shift",
    "options": "DW POS Shift",
    "read_only": 1,
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_branch",
    "fieldtype": "Link",
    "insert_after": "dw_pos_shift",
    "label": "POS Branch",
    "options": "Branch",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_terminal_id",
    "fieldtype": "Data",
    "insert_after": "dw_pos_branch",
    "label": "POS Terminal ID",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_sales_person",
    "fieldtype": "Link",
    "insert_after": "dw_pos_terminal_id",
    "label": "Primary Sales Person",
    "options": "Sales Person",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_commission_rate",
    "fieldtype": "Percent",
    "insert_after": "dw_pos_sales_person",
    "label": "POS Commission Rate",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_payment_reference",
    "fieldtype": "Data",
    "insert_after": "dw_pos_commission_rate",
    "label": "Payment Reference",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "Sales Invoice",
    "fieldname": "dw_pos_source_app",
    "fieldtype": "Data",
    "insert_after": "dw_pos_payment_reference",
    "label": "POS Source App",
    "read_only": 1,
    "default": "watch_doctor_pos",
    "print_hide": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_pos_enhancement_section",
    "fieldtype": "Section Break",
    "insert_after": "warehouse",
    "label": "DW POS Enhancements",
    "collapsible": 1
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_default_customer",
    "fieldtype": "Link",
    "insert_after": "dw_pos_enhancement_section",
    "label": "Default Walk-In Customer",
    "options": "Customer"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_default_receipt_format",
    "fieldtype": "Link",
    "insert_after": "dw_default_customer",
    "label": "Default Receipt Format",
    "options": "Print Format"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_enable_series_selector",
    "fieldtype": "Check",
    "insert_after": "dw_default_receipt_format",
    "label": "Allow Series Selector",
    "default": "1"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_allowed_naming_series",
    "fieldtype": "Small Text",
    "insert_after": "dw_enable_series_selector",
    "label": "Allowed Naming Series"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_enable_auto_print",
    "fieldtype": "Check",
    "insert_after": "dw_allowed_naming_series",
    "label": "Enable Auto Print",
    "default": "1"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_require_sales_person",
    "fieldtype": "Check",
    "insert_after": "dw_enable_auto_print",
    "label": "Require Sales Person",
    "default": "1"
  },
  {
    "doctype": "Custom Field",
    "dt": "POS Profile",
    "fieldname": "dw_require_payment_reference",
    "fieldtype": "Check",
    "insert_after": "dw_require_sales_person",
    "label": "Require Payment Reference",
    "default": "1"
  }
]
```

## Deliverable: Server Runtime Module

### Filename: `watch_doctor/pos_enhancements.py`

```python
import frappe
from frappe.utils import cint, cstr

from watch_doctor.pms import get_pms_runtime_configuration


SETTINGS_DOCTYPE = "DW POS Enhancement Settings"
SOURCE_APP = "watch_doctor_pos"


def _split_lines(value: str) -> list[str]:
    return [row.strip() for row in cstr(value or "").splitlines() if row.strip()]


def _split_csv(value: str) -> set[str]:
    return {row.strip() for row in cstr(value or "").split(",") if row.strip()}


def _get_company_defaults(company: str, pos_profile: str | None = None) -> frappe._dict:
    defaults = frappe._dict({
        "company": company,
        "default_customer": "",
        "default_receipt_format": "",
        "default_warehouse": "",
        "default_branch": "",
        "default_terminal_id": "",
        "default_sales_person": "",
        "default_commission_rate": 0,
        "allow_auto_print": 0,
        "allow_series_selector": 0,
        "allowed_naming_series": [],
        "require_sales_person": 0,
        "require_payment_reference": 0,
        "price_override_roles": set(),
        "discount_override_roles": set(),
    })

    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        return defaults

    settings = frappe.get_cached_doc(SETTINGS_DOCTYPE)
    row = None
    for candidate in settings.get("company_defaults") or []:
        if candidate.company != company:
            continue
        if pos_profile and candidate.pos_profile and candidate.pos_profile != pos_profile:
            continue
        row = candidate
        break

    if not row:
        return defaults

    defaults.update({
        "default_customer": row.default_customer,
        "default_receipt_format": row.default_receipt_format,
        "default_warehouse": row.default_warehouse,
        "default_branch": row.default_branch,
        "default_terminal_id": row.default_terminal_id,
        "default_sales_person": row.default_sales_person,
        "default_commission_rate": row.default_commission_rate or 0,
        "allow_auto_print": cint(row.allow_auto_print),
        "allow_series_selector": cint(row.allow_series_selector),
        "allowed_naming_series": _split_lines(row.allowed_naming_series),
        "require_sales_person": cint(row.require_sales_person),
        "require_payment_reference": cint(row.require_payment_reference),
        "price_override_roles": _split_csv(row.price_override_roles),
        "discount_override_roles": _split_csv(row.discount_override_roles),
    })
    return defaults


def get_runtime_config(company: str, pos_profile: str | None = None) -> dict:
    pms_config = get_pms_runtime_configuration()
    defaults = _get_company_defaults(company, pos_profile)
    settings = frappe.get_cached_doc(SETTINGS_DOCTYPE) if frappe.db.exists("DocType", SETTINGS_DOCTYPE) else None

    return {
        "company": company,
        "defaults": defaults,
        "hide_pms_tax_on_receipt": cint(settings.hide_pms_tax_on_receipt) if settings else 1,
        "enable_offline_retry_queue": cint(settings.enable_offline_retry_queue) if settings else 1,
        "offline_retry_limit": cint(settings.offline_retry_limit) if settings else 25,
        "enable_barcode_search": cint(settings.enable_barcode_search) if settings else 1,
        "require_open_shift": cint(settings.require_open_shift) if settings else 1,
        "fallback_non_pms_print_format": cstr(settings.default_non_pms_print_format) if settings else "",
        "pms_print_format": cstr(pms_config.get("pms_print_format")),
        "pms_disclaimer": cstr(pms_config.get("pms_disclaimer")),
    }


def get_receipt_print_format(invoice, runtime_config: dict) -> str:
    if cstr(invoice.get("dw_pos_receipt_format")):
        return invoice.get("dw_pos_receipt_format")
    if cint(invoice.get("dw_has_pms_items")):
        return runtime_config.get("pms_print_format") or ""
    return (
        runtime_config["defaults"].get("default_receipt_format")
        or runtime_config.get("fallback_non_pms_print_format")
        or ""
    )


def sync_sales_team(invoice, runtime_config: dict):
    sales_person = invoice.get("dw_pos_sales_person") or runtime_config["defaults"].get("default_sales_person")
    commission_rate = invoice.get("dw_pos_commission_rate") or runtime_config["defaults"].get("default_commission_rate") or 0

    if runtime_config["defaults"].get("require_sales_person") and not sales_person:
        frappe.throw("Sales Person is required for POS invoices.")

    if not sales_person:
        return

    invoice.set("sales_team", [])
    invoice.append("sales_team", {
        "sales_person": sales_person,
        "allocated_percentage": 100,
        "commission_rate": commission_rate,
        "incentives": 0,
    })


def validate_open_shift(invoice, runtime_config: dict):
    if not cint(invoice.is_pos):
        return
    if not runtime_config.get("require_open_shift"):
        return
    if invoice.docstatus != 0:
        return
    if not invoice.get("dw_pos_shift"):
        frappe.throw("An open DW POS Shift is required before submitting a POS invoice.")
    status = frappe.get_cached_value("DW POS Shift", invoice.get("dw_pos_shift"), "status")
    if status != "Open":
        frappe.throw(f"POS Shift {invoice.get('dw_pos_shift')} is not open.")


def validate_payment_reference(invoice, payments, runtime_config: dict):
    if not runtime_config["defaults"].get("require_payment_reference"):
        return
    non_cash_modes = [row for row in (payments or []) if cstr(row.get("mode_of_payment")).lower() != "cash"]
    if non_cash_modes and not cstr(invoice.get("dw_pos_payment_reference")):
        frappe.throw("Payment Reference is required for card/bank POS payments.")


def apply_pos_defaults(invoice, pos_context: dict | None = None):
    pos_context = frappe._dict(pos_context or {})
    company = invoice.company
    pos_profile = pos_context.get("pos_profile")
    runtime_config = get_runtime_config(company, pos_profile)
    defaults = runtime_config["defaults"]

    invoice.dw_pos_source_app = SOURCE_APP
    invoice.customer = invoice.customer or defaults.get("default_customer")
    invoice.dw_pos_branch = pos_context.get("branch") or defaults.get("default_branch")
    invoice.dw_pos_terminal_id = pos_context.get("terminal_id") or defaults.get("default_terminal_id")
    invoice.dw_pos_shift = pos_context.get("shift") or invoice.get("dw_pos_shift")
    invoice.dw_pos_sales_person = pos_context.get("sales_person") or invoice.get("dw_pos_sales_person")
    invoice.dw_pos_commission_rate = pos_context.get("commission_rate") or invoice.get("dw_pos_commission_rate")
    invoice.dw_pos_payment_reference = pos_context.get("payment_reference") or invoice.get("dw_pos_payment_reference")

    if not invoice.customer:
        frappe.throw("Customer is required or a default walk-in customer must be configured.")

    if defaults.get("default_warehouse"):
        invoice.set_warehouse = invoice.set_warehouse or defaults.get("default_warehouse")
        for row in invoice.items:
            row.warehouse = row.warehouse or defaults.get("default_warehouse")

    requested_series = cstr(pos_context.get("naming_series") or "")
    allowed_series = defaults.get("allowed_naming_series") or []
    if requested_series:
        if allowed_series and requested_series not in allowed_series:
            frappe.throw(f"Naming series {requested_series} is not allowed for this POS context.")
        invoice.naming_series = requested_series
    elif allowed_series:
        invoice.naming_series = allowed_series[0]

    if pos_context.get("receipt_format"):
        invoice.dw_pos_receipt_format = pos_context.get("receipt_format")

    sync_sales_team(invoice, runtime_config)
    validate_open_shift(invoice, runtime_config)
    return runtime_config


def build_print_url(invoice, runtime_config: dict) -> str:
    print_format = get_receipt_print_format(invoice, runtime_config)
    if not print_format:
        return ""
    return frappe.utils.get_url(
        "/printview?doctype=Sales%20Invoice&name={name}&format={fmt}&no_letterhead=1&_lang=en".format(
            name=frappe.utils.encode(invoice.name),
            fmt=frappe.utils.encode(print_format),
        )
    )


@frappe.whitelist()
def get_pos_runtime_config(company: str | None = None, pos_profile: str | None = None):
    company = company or frappe.defaults.get_user_default("Company")
    if not company:
        frappe.throw("No Company is configured for POS runtime settings.")
    return get_runtime_config(company, pos_profile)
```

## Deliverable: POS API Update

### Filename: `watch_doctor/api.py`

```python
# add near other imports
from watch_doctor.pos_enhancements import (
    apply_pos_defaults,
    build_print_url,
    get_pos_runtime_config,
    validate_payment_reference,
)


def _load_pos_context(pos_context_json=None):
    if not pos_context_json:
        return {}
    return json.loads(pos_context_json) if isinstance(pos_context_json, str) else pos_context_json


@frappe.whitelist()
def create_pos_invoice(
    customer: str = "",
    items_json: str = "[]",
    payment_mode: str = "Cash",
    discount_percent: float = 0,
    payments_json=None,
    pos_context_json=None,
):
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
    items = json.loads(items_json) if isinstance(items_json, str) else items_json
    payments = _parse_pos_payments(payments_json, payment_mode)
    pos_context = _load_pos_context(pos_context_json)
    discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0

    has_pms_items = _validate_pos_pms_item_mix(items)
    from watch_doctor.pms import get_standard_sales_taxes_template, require_pms_runtime_configuration
    require_pms_runtime_configuration()
    standard_sales_taxes_template = get_standard_sales_taxes_template()

    company = pos_context.get("company") or _get_default_company()
    precision = _get_currency_precision(company)

    invoice = frappe.get_doc({
        "doctype": "Sales Invoice",
        "customer": customer,
        "company": company,
        "posting_date": frappe.utils.today(),
        "due_date": frappe.utils.today(),
        "is_pos": 1,
        "update_stock": 1,
        "additional_discount_percentage": discount_percent,
        "items": []
    })
    invoice.flags.ignore_permissions = True

    for item in items:
        invoice.append("items", {
            "item_code": item.get("item_code"),
            "qty": item.get("qty", 1),
            "rate": item.get("rate", 0),
            "serial_no": item.get("serial_no") or "",
            "warehouse": item.get("warehouse") or "",
        })

    runtime_config = apply_pos_defaults(invoice, pos_context)

    if has_pms_items:
        invoice.taxes_and_charges = ""
        invoice.set("taxes", [])
    elif standard_sales_taxes_template:
        invoice.taxes_and_charges = standard_sales_taxes_template
    else:
        frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before creating POS invoices.")

    invoice.insert(ignore_permissions=True)
    _set_invoice_payments(invoice, payments, precision)
    validate_payment_reference(invoice, payments, runtime_config)
    invoice.save(ignore_permissions=True)
    invoice.submit()
    frappe.db.commit()

    print_url = build_print_url(invoice, runtime_config)
    return {
        "invoice_name": invoice.name,
        "grand_total": invoice.grand_total,
        "customer": invoice.customer,
        "has_pms_items": has_pms_items,
        "pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
        "print_format": invoice.get("dw_pos_receipt_format") or runtime_config.get("pms_print_format") or runtime_config.get("fallback_non_pms_print_format"),
        "print_url": print_url,
        "auto_print": runtime_config["defaults"].get("allow_auto_print") or 0,
    }


@frappe.whitelist()
def submit_pos_draft(invoice_name: str, payment_mode: str = "Cash", discount_percent: float = 0, payments_json=None, pos_context_json=None):
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    invoice.flags.ignore_permissions = True
    payments = _parse_pos_payments(payments_json, payment_mode)
    pos_context = _load_pos_context(pos_context_json)
    discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0

    if invoice.docstatus != 0:
        frappe.throw("Invoice is not a draft")

    invoice.additional_discount_percentage = discount_percent
    runtime_config = apply_pos_defaults(invoice, pos_context)

    from watch_doctor.pms import validate_pms_item_mix, get_standard_sales_taxes_template, require_pms_runtime_configuration
    require_pms_runtime_configuration()
    pms_item_codes, _non_pms_item_codes = validate_pms_item_mix([item.item_code for item in invoice.items if item.item_code])
    has_pms_items = bool(pms_item_codes)
    standard_sales_taxes_template = get_standard_sales_taxes_template()

    if has_pms_items:
        invoice.taxes_and_charges = ""
        invoice.set("taxes", [])
    elif standard_sales_taxes_template:
        invoice.taxes_and_charges = standard_sales_taxes_template
    else:
        frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before submitting POS drafts.")

    invoice.save(ignore_permissions=True)
    precision = _get_currency_precision(invoice.company)
    _set_invoice_payments(invoice, payments, precision)
    validate_payment_reference(invoice, payments, runtime_config)
    invoice.save(ignore_permissions=True)
    invoice.submit()
    frappe.db.commit()

    return {
        "invoice_name": invoice.name,
        "grand_total": invoice.grand_total,
        "customer": invoice.customer,
        "has_pms_items": has_pms_items,
        "pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
        "print_url": build_print_url(invoice, runtime_config),
        "auto_print": runtime_config["defaults"].get("allow_auto_print") or 0,
    }
```

## Deliverable: Sales Invoice Hook Update

### Filename: `watch_doctor/pms.py`

```python
# add near top-level imports
from watch_doctor.pos_enhancements import get_receipt_print_format


def si_validate(doc, method=None):
    # keep existing PMS logic intact
    # ... existing body ...

    # POS-safe print format selection happens after PMS fields are known.
    if cint(doc.is_pos):
        try:
            from watch_doctor.pos_enhancements import get_runtime_config
            runtime_config = get_runtime_config(doc.company)
            selected_format = get_receipt_print_format(doc, runtime_config)
            if selected_format:
                doc.dw_pos_receipt_format = selected_format
        except Exception:
            # Never block invoice save because receipt selection failed.
            pass
```

This keeps Bahrain PMS behavior unchanged while ensuring POS invoices always resolve a receipt format after PMS item detection has run.

## Deliverable: Desk Client Script

### Filename: `watch_doctor/public/js/sales_invoice_pos_enhancements.js`

```javascript
frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		if (!frm.doc.is_pos || frm.doc.docstatus !== 1) return;

		frm.add_custom_button(__("POS Receipt"), function() {
			const printFormat = frm.doc.dw_pos_receipt_format || "Standard";
			const url = frappe.urllib.get_full_url(
				"/api/method/frappe.utils.print_format.download_pdf?" +
				"doctype=Sales%20Invoice" +
				"&name=" + encodeURIComponent(frm.doc.name) +
				"&format=" + encodeURIComponent(printFormat) +
				"&no_letterhead=1"
			);
			window.open(url, "_blank");
		});

		if (
			frm.doc.dw_pos_source_app === "watch_doctor_pos" &&
			!frm.__dw_pos_autoprinted &&
			frm.doc.dw_pos_receipt_printed !== 1 &&
			frm.doc.dw_pos_receipt_format
		) {
			frm.__dw_pos_autoprinted = true;
			const url = frappe.urllib.get_full_url(
				"/printview?doctype=Sales%20Invoice&name=" + encodeURIComponent(frm.doc.name) +
				"&format=" + encodeURIComponent(frm.doc.dw_pos_receipt_format) +
				"&no_letterhead=1"
			);
			window.open(url, "_blank");
			frm.set_value("dw_pos_receipt_printed", 1);
			frm.save_or_update();
		}
	},
});
```

Register this alongside the existing PMS desk JS instead of replacing it.

## Deliverable: POS Frontend API Client

### Filename: `frontend/src/services/apiService.ts`

```ts
export interface POSContextPayload {
    company?: string;
    pos_profile?: string;
    branch?: string;
    terminal_id?: string;
    shift?: string;
    sales_person?: string;
    commission_rate?: number;
    payment_reference?: string;
    naming_series?: string;
    receipt_format?: string;
}

export const getPosRuntimeConfig = async (company?: string, posProfile?: string) => {
    const res = await apiFetch('/api/method/watch_doctor.pos_enhancements.get_pos_runtime_config', {
        method: 'POST',
        body: JSON.stringify({ company, pos_profile: posProfile }),
    });
    return res.message;
};

export const createPosInvoice = async (
    customer: string,
    items: CartItem[],
    payments: POSPaymentSplit[] | string = 'Cash',
    discountPercent: number = 0,
    posContext: POSContextPayload = {}
): Promise<{ invoice_name: string; grand_total: number; customer: string; auto_print: number; print_url?: string }> => {
    const normalizedPayments = normalizePosPayments(payments);
    const primaryMode = typeof payments === 'string'
        ? payments
        : (normalizedPayments[0]?.mode_of_payment || 'Cash');

    const res = await apiFetch('/api/method/watch_doctor.api.create_pos_invoice', {
        method: 'POST',
        body: JSON.stringify({
            customer,
            items_json: JSON.stringify(items),
            payment_mode: primaryMode,
            payments_json: JSON.stringify(normalizedPayments),
            discount_percent: discountPercent,
            pos_context_json: JSON.stringify(posContext),
        }),
    });
    return res.message;
};

export const submitPosDraft = async (
    invoiceName: string,
    payments: POSPaymentSplit[] | string = 'Cash',
    discountPercent: number = 0,
    posContext: POSContextPayload = {}
): Promise<{ invoice_name: string; grand_total: number; customer: string; auto_print: number; print_url?: string }> => {
    const normalizedPayments = normalizePosPayments(payments);
    const primaryMode = typeof payments === 'string'
        ? payments
        : (normalizedPayments[0]?.mode_of_payment || 'Cash');

    const res = await apiFetch('/api/method/watch_doctor.api.submit_pos_draft', {
        method: 'POST',
        body: JSON.stringify({
            invoice_name: invoiceName,
            payment_mode: primaryMode,
            payments_json: JSON.stringify(normalizedPayments),
            discount_percent: discountPercent,
            pos_context_json: JSON.stringify(posContext),
        }),
    });
    return res.message;
};
```

## Deliverable: POS Frontend UI Patch

### Filename: `frontend/src/components/POS.tsx`

```tsx
// add state near existing payment/customer state
const [runtimeConfig, setRuntimeConfig] = useState<any | null>(null);
const [selectedSalesPerson, setSelectedSalesPerson] = useState('');
const [commissionRate, setCommissionRate] = useState(0);
const [paymentReference, setPaymentReference] = useState('');
const [selectedSeries, setSelectedSeries] = useState('');
const [selectedReceiptFormat, setSelectedReceiptFormat] = useState('');
const [selectedShift, setSelectedShift] = useState('');

useEffect(() => {
    const loadRuntime = async () => {
        try {
            const data = await apiService.getPosRuntimeConfig();
            setRuntimeConfig(data);
            if (!selectedCustomer && data?.defaults?.default_customer) {
                setSelectedCustomer({
                    name: data.defaults.default_customer,
                    customer_name: data.defaults.default_customer,
                });
            }
            setSelectedSalesPerson(data?.defaults?.default_sales_person || '');
            setCommissionRate(data?.defaults?.default_commission_rate || 0);
            setSelectedSeries(data?.defaults?.allowed_naming_series?.[0] || '');
            setSelectedReceiptFormat(data?.defaults?.default_receipt_format || '');
        } catch (error) {
            console.error('Failed to load POS runtime config:', error);
        }
    };
    loadRuntime();
}, []);

const canOverridePrice = (runtimeConfig?.defaults?.price_override_roles || []).some((role: string) => config.roles?.includes?.(role));
const canOverrideDiscount = (runtimeConfig?.defaults?.discount_override_roles || []).some((role: string) => config.roles?.includes?.(role));

const posContext = {
    sales_person: selectedSalesPerson,
    commission_rate: commissionRate,
    payment_reference: paymentReference,
    naming_series: selectedSeries,
    receipt_format: selectedReceiptFormat,
    shift: selectedShift,
};

// inside handleConfirmPayment success block
if (currentDraftName) {
    result = await apiService.submitPosDraft(currentDraftName, normalizedPayments, effectiveDiscountPercent, posContext);
} else {
    result = await apiService.createPosInvoice(selectedCustomer!.name, cart, normalizedPayments, effectiveDiscountPercent, posContext);
}

if (result.auto_print && result.print_url) {
    window.open(result.print_url, '_blank', 'noopener,noreferrer');
}

// add to payment modal above summary
<div className="grid grid-cols-1 gap-3">
    <div>
        <label className="text-sm text-gray-600 block mb-2">Sales Person</label>
        <input
            type="text"
            value={selectedSalesPerson}
            onChange={(e) => setSelectedSalesPerson(e.target.value)}
            className="w-full px-4 py-2 rounded-xl bg-white"
            style={{ border: '1px solid #E8E8E8' }}
        />
    </div>
    <div>
        <label className="text-sm text-gray-600 block mb-2">Commission Rate</label>
        <input
            type="number"
            min="0"
            step="0.01"
            value={commissionRate}
            onChange={(e) => setCommissionRate(parseFloat(e.target.value) || 0)}
            className="w-full px-4 py-2 rounded-xl bg-white"
            style={{ border: '1px solid #E8E8E8' }}
        />
    </div>
    <div>
        <label className="text-sm text-gray-600 block mb-2">Payment Reference</label>
        <input
            type="text"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            placeholder="Card approval / transfer reference"
            className="w-full px-4 py-2 rounded-xl bg-white"
            style={{ border: '1px solid #E8E8E8' }}
        />
    </div>
    <div>
        <label className="text-sm text-gray-600 block mb-2">Receipt Format</label>
        <input
            type="text"
            value={selectedReceiptFormat}
            onChange={(e) => setSelectedReceiptFormat(e.target.value)}
            className="w-full px-4 py-2 rounded-xl bg-white"
            style={{ border: '1px solid #E8E8E8' }}
        />
    </div>
    {runtimeConfig?.defaults?.allow_series_selector ? (
        <div>
            <label className="text-sm text-gray-600 block mb-2">Invoice Series</label>
            <select
                value={selectedSeries}
                onChange={(e) => setSelectedSeries(e.target.value)}
                className="w-full px-4 py-2 rounded-xl bg-white"
                style={{ border: '1px solid #E8E8E8' }}
            >
                {(runtimeConfig?.defaults?.allowed_naming_series || []).map((series: string) => (
                    <option key={series} value={series}>{series}</option>
                ))}
            </select>
        </div>
    ) : null}
</div>

// gate price and discount overrides
// disable the unit-price edit affordance unless canOverridePrice is true
// disable discount inputs unless canOverrideDiscount is true
```

Notes:

- This remains a supported change because it modifies your own React POS, not core ERPNext JS.
- Replace free-text sales-person/receipt-format inputs with selects fed by runtime config in the final implementation.
- Preserve server-side enforcement even if the frontend hides controls.

## Deliverable: Retail POS Receipt Print Format

### Filename: `watch_doctor/repair_management/print_format/dw_pos_retail_receipt/dw_pos_retail_receipt.json`

```json
{
  "doctype": "Print Format",
  "name": "DW POS Retail Receipt",
  "module": "Repair Management",
  "doc_type": "Sales Invoice",
  "standard": "Yes",
  "custom_format": 1,
  "print_format_type": "Jinja",
  "raw_printing": 0,
  "disabled": 0,
  "html": "{%- set company = frappe.get_doc('Company', doc.company) -%}\n{%- set currency = doc.currency or company.default_currency -%}\n{%- set has_pms = doc.dw_has_pms_items -%}\n<style>\n.receipt { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #111; width: 72mm; }\n.receipt .center { text-align: center; }\n.receipt .row { display: flex; justify-content: space-between; margin: 2px 0; }\n.receipt .line { border-top: 1px dashed #333; margin: 6px 0; }\n.receipt .muted { color: #666; }\n.receipt .strong { font-weight: 700; }\n.receipt table { width: 100%; border-collapse: collapse; }\n.receipt td { padding: 2px 0; vertical-align: top; }\n.receipt .qty { width: 10%; }\n.receipt .desc { width: 58%; }\n.receipt .amt { width: 32%; text-align: right; }\n</style>\n<div class=\"receipt\">\n  <div class=\"center strong\">{{ company.company_name }}</div>\n  <div class=\"center muted\">{{ company.company_address or '' }}</div>\n  <div class=\"center muted\">{{ company.phone_no or '' }}</div>\n  <div class=\"line\"></div>\n  <div class=\"row\"><span>Invoice</span><span>{{ doc.name }}</span></div>\n  <div class=\"row\"><span>Date</span><span>{{ frappe.format_datetime(doc.posting_date ~ ' ' ~ doc.posting_time) if doc.posting_time else frappe.format_date(doc.posting_date) }}</span></div>\n  <div class=\"row\"><span>Customer</span><span>{{ doc.customer_name or doc.customer }}</span></div>\n  {%- if doc.dw_pos_sales_person %}<div class=\"row\"><span>Sales</span><span>{{ doc.dw_pos_sales_person }}</span></div>{%- endif %}\n  {%- if doc.dw_pos_terminal_id %}<div class=\"row\"><span>Terminal</span><span>{{ doc.dw_pos_terminal_id }}</span></div>{%- endif %}\n  <div class=\"line\"></div>\n  <table>\n    {%- for item in doc.items %}\n    <tr>\n      <td class=\"qty\">{{ item.qty }}</td>\n      <td class=\"desc\">{{ item.item_name or item.item_code }}</td>\n      <td class=\"amt\">{{ frappe.utils.fmt_money(item.amount, currency=currency) }}</td>\n    </tr>\n    {%- endfor %}\n  </table>\n  <div class=\"line\"></div>\n  <div class=\"row\"><span>Subtotal</span><span>{{ frappe.utils.fmt_money(doc.net_total or doc.total, currency=currency) }}</span></div>\n  {%- if doc.discount_amount %}<div class=\"row\"><span>Discount</span><span>-{{ frappe.utils.fmt_money(doc.discount_amount, currency=currency) }}</span></div>{%- endif %}\n  {%- if not has_pms and doc.total_taxes_and_charges %}<div class=\"row\"><span>Tax</span><span>{{ frappe.utils.fmt_money(doc.total_taxes_and_charges, currency=currency) }}</span></div>{%- endif %}\n  <div class=\"row strong\"><span>Total</span><span>{{ frappe.utils.fmt_money(doc.grand_total, currency=currency) }}</span></div>\n  {%- if doc.payments %}<div class=\"line\"></div>{%- for payment in doc.payments %}<div class=\"row\"><span>{{ payment.mode_of_payment }}</span><span>{{ frappe.utils.fmt_money(payment.amount, currency=currency) }}</span></div>{%- endfor %}{%- endif %}\n  {%- if has_pms and doc.dw_pms_disclaimer %}<div class=\"line\"></div><div class=\"center muted\">{{ doc.dw_pms_disclaimer }}</div>{%- endif %}\n  <div class=\"line\"></div>\n  <div class=\"center muted\">Thank you for visiting Watch Doctor</div>\n</div>"
}
```

This receipt intentionally hides PMS tax rows while still injecting the disclaimer from the existing PMS logic through `doc.dw_pms_disclaimer`.

## Deliverable: Hooks

### Filename: `watch_doctor/hooks.py`

```python
doctype_js = {
    "Customer": "public/js/customer.js",
    "Sales Invoice": [
        "public/js/sales_invoice_pms.js",
        "public/js/sales_invoice_pos_enhancements.js",
    ],
}

doc_events = {
    "Sales Invoice": {
        "validate": [
            "watch_doctor.pms.si_validate",
        ],
        "on_submit": [
            "watch_doctor.pms.si_on_submit",
        ],
        "on_cancel": [
            "watch_doctor.pms.si_on_cancel",
        ],
    }
}

after_migrate = [
    "watch_doctor.patches.reload_dw_doctypes.execute",
    "watch_doctor.setup_roles.execute",
    "watch_doctor.setup_pms.execute",
]

fixtures = [
    {
        "doctype": "DocType",
        "filters": [["name", "in", [
            "DW Technician",
            "DW Repair Order",
            "DW Repair Item",
            "DW Repair Task",
            "DW Repair Part Used",
            "DW Task Template",
            "DW Test",
            "DW POS Enhancement Settings",
            "DW POS Company Default",
            "DW POS Shift"
        ]]],
    },
    {
        "doctype": "Print Format",
        "filters": [["name", "in", [
            "DW RO Bag Label",
            "DW PMS Tax Invoice",
            "DW POS Retail Receipt"
        ]]],
    },
    {
        "doctype": "Custom Field",
        "filters": [["name", "in", [
            "Sales Invoice-dw_pos_section",
            "Sales Invoice-dw_pos_receipt_printed",
            "Sales Invoice-dw_pos_receipt_format",
            "Sales Invoice-dw_pos_shift",
            "Sales Invoice-dw_pos_branch",
            "Sales Invoice-dw_pos_terminal_id",
            "Sales Invoice-dw_pos_sales_person",
            "Sales Invoice-dw_pos_commission_rate",
            "Sales Invoice-dw_pos_payment_reference",
            "Sales Invoice-dw_pos_source_app",
            "POS Profile-dw_pos_enhancement_section",
            "POS Profile-dw_default_customer",
            "POS Profile-dw_default_receipt_format",
            "POS Profile-dw_enable_series_selector",
            "POS Profile-dw_allowed_naming_series",
            "POS Profile-dw_enable_auto_print",
            "POS Profile-dw_require_sales_person",
            "POS Profile-dw_require_payment_reference"
        ]]],
    },
]
```

## Deliverable: Role and Permission Setup

### Filename: `watch_doctor/patches/grant_native_doctype_permissions.py`

```python
# add to PERMISSIONS
PERMISSIONS += [
    ("Sales Person", "DW Executive", {"read": 1, "write": 1}),
    ("Sales Person", "DW Data Entry", {"read": 1}),
    ("Branch", "DW Executive", {"read": 1}),
    ("Branch", "DW Data Entry", {"read": 1}),
    ("Warehouse", "DW Executive", {"read": 1}),
    ("Warehouse", "DW Data Entry", {"read": 1}),
    ("DW POS Shift", "DW Executive", {"read": 1, "write": 1, "create": 1}),
    ("DW POS Shift", "DW Data Entry", {"read": 1, "write": 1, "create": 1}),
    ("DW POS Enhancement Settings", "DW Executive", {"read": 1, "write": 1}),
]
```

Recommended operational role split:

- `DW Data Entry`: create POS invoices, use only allowed price/discount overrides, open/close own shifts
- `DW Executive`: manage settings, edit receipt formats, override branch/series rules, review commission output
- `System Manager`: install metadata, export fixtures, manage deployment

## Deliverable: Testing Matrix

### Filename: `watch_doctor/POS_ENHANCEMENT_TEST_CHECKLIST.md`

```md
1. Configuration smoke test
   - Create `DW POS Enhancement Settings`.
   - Add one company default row with default customer, receipt format, naming series, warehouse, and sales person.
   - Confirm `DW PMS Settings` still has PMS print format, disclaimer, tax template, and divisor.

2. Standard non-PMS retail sale
   - Sell one non-PMS stock item.
   - Confirm `Sales Invoice.is_pos = 1`.
   - Confirm naming series matches selected/default POS series.
   - Confirm receipt format resolves to `DW POS Retail Receipt` or configured non-PMS format.
   - Confirm print window opens when auto-print is enabled.

3. PMS retail sale
   - Sell one item from the configured PMS item group.
   - Confirm invoice tax rows are empty.
   - Confirm `dw_pms_total_vat` and `dw_pms_disclaimer` are populated.
   - Confirm POS receipt hides tax rows and shows the PMS disclaimer.
   - Confirm GL reclassification still occurs on submit.

4. Split payment with non-cash reference
   - Pay with Cash + Card.
   - Confirm missing `dw_pos_payment_reference` blocks submit when non-cash exists.
   - Confirm entering the reference allows submit.

5. Sales person and commission
   - Submit invoice with a selected sales person.
   - Confirm `dw_pos_sales_person` and `dw_pos_commission_rate` are stored.
   - Confirm `sales_team` contains one row with 100% allocation and expected commission rate.

6. Default customer fallback
   - Leave customer blank in POS.
   - Confirm server applies configured default walk-in customer.

7. Shift enforcement
   - Attempt submit without `dw_pos_shift` while `require_open_shift = 1`.
   - Confirm validation blocks submit.
   - Create an open `DW POS Shift`, retry, and confirm success.

8. Draft flow
   - Hold a cart, reopen it, and submit it.
   - Confirm print behavior and custom fields survive the draft round-trip.

9. Multi-branch / warehouse
   - Use a company default tied to a branch warehouse.
   - Confirm line warehouses inherit the branch warehouse.
   - Confirm stock reduces from the intended warehouse.

10. Regression
    - Create a desk Sales Invoice that is not POS.
    - Confirm existing PMS desk flow still behaves exactly as before.
```

## Installation Steps

1. Add the three doctypes, the custom fields fixture, and the new print format to the app.
2. Add `watch_doctor/pos_enhancements.py` and update `watch_doctor/api.py`, `watch_doctor/pms.py`, and `watch_doctor/hooks.py`.
3. Add the desk JS file and rebuild frontend assets.
4. Run `bench --site <site> migrate`.
5. Export fixtures if you want to keep metadata in git.
6. Open Repair Management settings and configure one company row before cashier testing.

## Shift-Closure Validation Notes

- Closing a shift should be blocked until all invoices linked to that shift are submitted or intentionally voided.
- Compare `Sales Invoice Payment` totals by `dw_pos_shift` against the counted till amount.
- Do not use receipt print status as a closure criterion; use submitted invoices and payment rows.
- PMS invoices should contribute to payment totals normally; only the receipt tax presentation changes.

## Rollback Checklist

1. Disable auto-print in `DW POS Enhancement Settings`.
2. Remove the new desk JS entry from `hooks.py`.
3. Remove the `pos_context_json` parameter handling from `watch_doctor/api.py` if you must revert the frontend first.
4. Keep the custom fields in place until historical invoices no longer need the metadata.
5. Do not delete `dw_pos_receipt_format` or `dw_pos_sales_person` fields before exporting old invoice data.

## Production Notes

- The app should continue using `DW PMS Settings` as the only source for PMS disclaimer text and PMS print format.
- Use `frappe.get_cached_doc` / `frappe.get_cached_value` in all runtime reads; avoid per-row metadata reads inside POS loops.
- Keep warehouse, receipt format, series, and sales-person choices in the POS request payload, but always validate them again server-side.
- If you want true offline mode later, add an idempotency field such as `dw_pos_request_id` before rolling out queue replay.
- For watch retail specifically, barcode and serial capture should be the next implementation after the package above; it materially reduces the risk of selling the wrong unique watch or mismatching post-sale repairs.