# Watch Doctor — Project Context & Architecture Overview

> **Generated:** 2026-06-05  
> **Branch:** develop  
> **Codebase:** `/home/frappe/frappe-bench/apps/watch_doctor`

---

## 1. What This App Is

**Watch Doctor** (`app_name = "watch_doctor"`, `app_title = "Repair Management"`) is a custom **Frappe v15 / ERPNext** application purpose-built for **watch and jewelry repair shop management**. It is designed for the Bahrain market (Bahrain Dinar currency, Profit Margin Scheme VAT, +973 country code defaults).

The app extends ERPNext's Sales, Inventory, and Accounting modules with a domain-specific repair workflow — covering customer intake, technician assignment, parts usage, WhatsApp customer notifications, billing (quotations, invoices), and financial reporting.

**Primary interfaces:**
1. A **React 19 / TypeScript SPA** at `frontend/` — the primary user interface, served at `/watch_doctor`.
2. The standard **Frappe Desk** workspace — secondary access path for non-SPA operations.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | Frappe v15 (Python 3.10+) |
| ERP base | ERPNext v15 |
| Frontend | React 19, TypeScript, Vite |
| Database | MariaDB (via Frappe ORM) |
| Queue | Frappe background jobs (Redis) |
| WhatsApp | whapi.cloud REST API |
| Print formats | Frappe Jinja HTML templates |

**Key config files:**
- `pyproject.toml` — Python package definition, `requires-python >= "3.10"`
- `watch_doctor/hooks.py` — All Frappe hooks (doc events, after_migrate, fixtures, etc.)
- `frontend/package.json` — Frontend deps (React 19, TypeScript, Vite)

---

## 3. Custom Roles & Permissions

Three custom roles auto-created on `bench migrate` via `watch_doctor/setup_roles.py`:

| Role | Frappe Name | Desk? | Capabilities |
|------|-------------|-------|-------------|
| Executive | `DW Executive` | Yes | Full access — all orders, POS, reports, settings, billing |
| Data Entry | `DW Data Entry` | Yes | Create/edit all repair orders, POS, billing; no financial drill-down |
| Technician | `DW Technician` | Yes | Own assigned orders only; read/write diagnosis; no POS/billing/reports |

`System Manager` and `Administrator` always bypass all DW-level restrictions (`PRIVILEGED_ROLES` set).

**Permission enforcement points:**
- SQL row-level filtering: `permission_query_conditions` hook in `hooks.py` → `watch_doctor/permissions.py:repair_order_query_conditions`
- Document-level: `has_permission` hook → `watch_doctor/permissions.py:repair_order_has_permission`
- API endpoint guards: `require_roles(ROLE_X, ROLE_Y)` at the top of every `@frappe.whitelist()` function

**Technician identity resolution** (`watch_doctor/permissions.py:get_current_technician_identifiers`):
Matches `DW Technician` records by `user`, `email`, or session username — supporting legacy data setups where the link field was populated differently.

---

## 4. Custom DocTypes

All custom doctypes are prefixed `DW`. Located at `watch_doctor/repair_management/doctype/`.

### 4.1 Core Repair Documents

| DocType | Type | Description |
|---------|------|-------------|
| `DW Repair Order` | Submittable Parent | One order per customer visit; can hold multiple watches |
| `DW Repair Item` | Child → `items` | One row per physical watch in the order |
| `DW Repair Task` | Child → `all_tasks` | Service tasks linked to a watch via `repair_item_key` |
| `DW Repair Part Used` | Child → `all_parts` | Parts consumed, linked via `repair_item_key` |
| `DW Repair Item Issue` | Child → `all_issues` | Customer-reported issues, linked via `repair_item_key` |

> The `repair_item_key` field is the string value of `DW Repair Item.idx` (1-based). This is how the flat child tables (`all_tasks`, `all_parts`, `all_issues`) associate with a specific watch row in `items`.

### 4.2 Reference / Template DocTypes

| DocType | Purpose |
|---------|---------|
| `DW Watch Brand` | Watch brand catalog |
| `DW Watch Model` | Watch model catalog (linked to brand) |
| `DW Technician` | Shop technician records (linked to Frappe User) |
| `DW Task Template` | Reusable service task with `default_rate` |
| `DW Issue Template` | Customer-reported issue templates with `suggested_task` |
| `DW Recommended Work Template` | Recommended work names for diagnosis |
| `DW Diagnosis Summary Template` | Diagnosis summary text snippets |
| `DW Watch Condition Template` | Pre-existing condition labels |
| `DW Movement Type Template` | Movement type options (quartz, automatic, etc.) |
| `DW Movement Caliber Template` | Movement caliber codes |
| `DW Movement Information Template` | Movement info notes |
| `DW WhatsApp Template` | Message templates keyed by `notification_key` |
| `DW WhatsApp Log` | WhatsApp send attempt log with retry tracking |
| `DW Country Code` | Country dial codes for phone normalization |
| `DW Payment Mode Config` | Allowed POS payment modes with display order |

### 4.3 Singleton Configuration DocTypes

| DocType | Purpose |
|---------|---------|
| `DW Invoice Settings` | Centralized naming series + print format per workflow |
| `DW PMS Settings` | Bahrain Profit Margin Scheme VAT configuration |
| `DW General Configuration` | Company name, address, CR/VAT numbers for print formats |

---

## 5. Order & Item Status Machines

### 5.1 Repair Order Status

```
Pending → In Progress → Create Estimate → Repaired → Delivered (on submit)
```

- Status is **auto-calculated** from item statuses (`calculate_order_status` in `dw_repair_order.py`)
- `VALID_TRANSITIONS` dict enforces allowed manual transitions
- Submitting the order forces status = `Delivered` and stamps `delivery_date`

### 5.2 Watch Item (Repair Item) Status

```
Pending → Under Diagnosis → Diagnosed → Create Estimate → Quoted → In Repair → Completed → Delivered
                                       ↘ Not Repairable
                                       ↘ Declined
```

Status is resolved by `resolve_repair_item_status()` in `dw_repair_order.py` based on:
1. Task statuses (In Progress tasks → `In Repair`; all Completed → `Completed`)
2. Diagnosis status (maps through `DIAGNOSIS_TO_WATCH_STATUS`)
3. Technician assignment (assigned = `Under Diagnosis`)
4. Manual overrides (if the current status is in `MANUAL_ITEM_STATUSES`, it is preserved)

### 5.3 Diagnosis Status

```
Pending Diagnosis → Diagnosed → Awaiting Approval → Quoted
                              ↘ Not Repairable
                              ↘ Declined
```

Driven by `resolve_diagnosis_status()`. Once any diagnosis content fields are populated (summary, movement type/caliber, recommended work), status auto-advances to `Diagnosed`. `Awaiting Approval`, `Not Repairable`, `Quoted`, `Declined` are **manual-only** (sticky).

### 5.4 Task Status

```
Pending → In Progress → Completed
```

Tasks auto-advance to `In Progress` when parts are added to them.

---

## 6. Key Business Logic Files

### `watch_doctor/api.py` (~3000 lines)
The central API layer. All `@frappe.whitelist()` endpoints consumed by the React SPA. Key function groups:
- User info & app config (`get_user_info`, `get_app_config`)
- Invoice/PMS/general settings CRUD (`get_invoice_workflow_configuration`, `save_pms_configuration`, etc.)
- Repair order CRUD (`save_repair_order`, `list_repair_orders`)
- Diagnosis update (`update_repair_item_diagnosis`)
- Catalog lookups (brands, models, templates, items, payment modes)
- Dashboard stats (`get_dashboard_stats`, `get_orders_trend`, `get_technician_stats`)
- POS invoice creation (`create_pos_invoice`)

### `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`
Controller for the main DocType. Contains:
- All status constants and legacy mapping
- `resolve_repair_item_status()` / `resolve_repair_item_diagnosis_status()` — pure functions, also imported by `api.py`
- `DWRepairOrder.validate()` — auto-updates item statuses before save
- `DWRepairOrder.before_submit()` / `on_submit()` — delivery validation and finalization
- Quotation & invoice generation helpers (`create_quotation`, `create_sales_invoice`, `finalize_invoice`)

### `watch_doctor/pms.py`
Bahrain Profit Margin Scheme VAT logic:
- Hooks into Sales Invoice `validate`, `on_submit`, `on_cancel` via `doc_events` in `hooks.py`
- Adds custom fields: `dw_is_pms_item`, `dw_pms_purchase_cost`, `dw_pms_margin`, `dw_pms_vat` per line; `dw_has_pms_items`, `dw_pms_total_vat`, `dw_pms_disclaimer` on the invoice header
- `DW PMS Settings` singleton drives enablement, item group, VAT account, divisor

### `watch_doctor/invoice_settings.py`
Centralized invoice workflow configuration:
- Three workflow types: `repair_service`, `pos_standard`, `pos_pms`
- Each has a configurable naming series and print format stored in `DW Invoice Settings` singleton
- `detect_sales_invoice_workflow()` auto-classifies any Sales Invoice by checking if it's linked to a Repair Order or has PMS items

### `watch_doctor/permissions.py`
RBAC implementation — role constants, `require_roles()`, `can_access_repair_order()`, SQL/doc-level hooks.

### `watch_doctor/inventory_helpers.py`
Stock availability checking before invoice finalization. Called from `finalize_invoice()`.

### `watch_doctor/pos_enhancements.py`
POS profile resolution and walk-in sales invoice creation helpers.

### `watch_doctor/whatsapp/service.py`
WhatsApp notification service via whapi.cloud:
- `normalize_phone()` — strips/adds country code
- `build_message()` / `build_watch_estimate_message()` — fills 9 template placeholders (`{{1}}`–`{{9}}`)
- `send_whatsapp_message()` — background job with exponential backoff (3 retries: 10s/20s/40s)
- Config via `site_config.json`: `whapi_api_token`, `whapi_base_url`

---

## 7. Invoice Architecture

### Three Invoice Workflows

| Workflow | Type | Print Format | Use Case |
|----------|------|-------------|---------|
| `repair_service` | Repair Invoice | `DW Watch Invoice` (default: Standard) | End of repair billing |
| `pos_standard` | Walk-in POS | `DW POS Retail Receipt` | Retail/accessory sales |
| `pos_pms` | PMS Tax Invoice | `DW PMS Tax Invoice` | Bahrain VAT-applicable POS sales |

### Invoice Line Structure

Every repair invoice has two types of lines (both on `items` child table):
1. **Visible service line** — one per watch, rate = labor + parts markup, item = `REPAIR-SERVICE`
2. **Internal part lines** — `dw_is_internal_line = 1`, `rate = 0`, exist only for stock deduction (`update_stock = 1`)

Internal lines are hidden in print formats but cause ERPNext to create Stock Ledger Entries (SLEs) at valuation rate.

> **Important quirk:** ERPNext's `insert()` fetches `price_list_rate` from the selling price list and overwrites `rate=0` on internal lines. `_zero_internal_lines()` is called after every `insert()` to force them back to zero.

### `finalize_invoice()` flow
1. Validate stock availability (`inventory_helpers.py`)
2. Apply discount if any
3. Build POS payment rows (Cash/Bank = immediate; General type = credit/pay-later)
4. Submit the invoice (creates SLEs)
5. Verify SLE creation (warning logged if missing)
6. Update `paid_amount` / `balance_amount` on the Repair Order
7. Optionally submit the Repair Order (marking as Delivered)

---

## 8. Frontend Architecture

### Stack & Routing
- React 19, TypeScript, Vite
- No router library — view switching is state-based in `App.tsx`
- Auth context (`AuthContext.tsx`) + app config context (`AppConfigContext.tsx`)
- API calls via `services/apiService.ts` (raw `fetch` with Frappe CSRF token)

### Main Views / Pages

| Component | Route | Role Access |
|-----------|-------|-------------|
| `Dashboard.tsx` / `ExecutiveDashboard.tsx` | Default | Executive, Data Entry |
| `RepairOrderList.tsx` | Orders tab | All roles |
| `RepairOrderDetail.tsx` | Order detail | All roles |
| `RepairOrderForm.tsx` | Create/Edit order | Executive, Data Entry |
| `POS.tsx` | POS tab | Executive, Data Entry |
| `DailyReport.tsx` | Reports tab | Executive (full), Data Entry (no profit) |
| `Settings.tsx` | Settings tab | Executive only |
| `LoginPage.tsx` | `/login` | Unauthenticated |

### Key Modals

| Modal | Purpose |
|-------|---------|
| `AssignTechnicianModal` | Assign tech to a watch |
| `AddIssueModal` | Add customer-reported issue |
| `AddTaskModal` | Add repair task to a watch |
| `AddPartModal` | Add parts used |
| `CreateQuotationModal` | Generate ERPNext Quotation |
| `CreateInvoiceModal` | Generate Sales Invoice |
| `PaymentModal` | Finalize payment (discount, mode) |
| `NotifyCustomerModal` | Send WhatsApp notification |
| `UpdatePriceModal` | Override task/part pricing |

### UI Component Library (all custom)
Located at `frontend/src/components/ui/`: `Button`, `Input`, `Select`, `Modal`, `Badge`, `Card`, `Spinner`, `Toast`, `ConfirmDialog`, `Autocomplete`, `ActionsDropdown`

### Reports
Located at `frontend/src/components/reports/`:
- `RepairSummaryReport` — order volume by status/technician
- `SalesSummaryReport` — revenue breakdown
- `FinancialSummaryReport` — daily financial close
- `ProfitSummaryReport` — margin analysis (Executive only)

---

## 9. Naming & Naming Conventions

### Repair Orders
Format: `YY.MM.####` (e.g., `2504.0001` = April 2025, order #1)

`DWRepairOrder.before_naming()` safely bootstraps the `tabSeries` counter from existing records if a month's series entry is absent — preventing counter-reset bugs after data imports.

### DocType prefix
All custom DocTypes: `DW ` prefix (e.g., `DW Repair Order`)

### Python module paths
- Main API: `watch_doctor.api`
- DocType controller: `watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order`
- Permissions: `watch_doctor.permissions`
- PMS: `watch_doctor.pms`

### JSON field serialization
Array-type fields (`diagnosis_summary`, `movement_type`, `movement_caliber`, `recommended_work`, `pre_existing_condition`) are stored as **JSON strings** in the database. The API layer calls `json.dumps(normalize_string_list(value))` before save and `normalize_string_list()` after load.

---

## 10. Data Setup (after_migrate hooks)

Run automatically on every `bench migrate` (in order):

1. `patches/reload_dw_doctypes.execute` — ensure DW DocTypes are registered
2. `setup_roles.execute` — create DW Executive / Data Entry / Technician roles
3. `patches/grant_native_doctype_permissions.execute` — grant ERPNext DocType access to DW roles
4. `setup_general_configuration.execute` — create `DW General Configuration` singleton
5. `setup_diagnosis_summary_templates.execute` — seed default diagnosis templates
6. `setup_movement_type_templates.execute` — seed movement type options
7. `setup_movement_caliber_templates.execute` — seed caliber codes
8. `setup_movement_info_templates.execute` — seed movement info notes
9. `setup_watch_condition_templates.execute` — seed pre-existing condition labels
10. `setup_pms.execute` — create `DW PMS Settings` singleton + custom fields on Sales Invoice
11. `setup_invoice_settings.execute` — create `DW Invoice Settings` singleton
12. `setup_pos_enhancements.execute` — create `DW Payment Mode Config` + POS custom fields

---

## 11. Frappe Hooks Summary

```python
# hooks.py highlights:

# JS injected into Frappe Desk forms:
doctype_js = {
    "Customer": "public/js/customer.js",
    "Sales Invoice": "public/js/sales_invoice_pms.js",
}

# Sales Invoice lifecycle hooks (PMS):
doc_events = {
    "Sales Invoice": {
        "validate": "watch_doctor.pms.si_validate",
        "on_submit": "watch_doctor.pms.si_on_submit",
        "on_cancel": "watch_doctor.pms.si_on_cancel",
    }
}

# Row-level and document-level permission hooks:
permission_query_conditions = {
    "DW Repair Order": "watch_doctor.permissions.repair_order_query_conditions",
}
has_permission = {
    "DW Repair Order": "watch_doctor.permissions.repair_order_has_permission",
}
```

---

## 12. WhatsApp Integration

**Provider:** whapi.cloud (REST API)
**Config keys** (in `site_config.json`):
- `whapi_api_token` — Bearer token
- `whapi_base_url` — default: `https://gate.whapi.cloud`
- `whatsapp_default_country_code` — default: `973` (Bahrain)

**Template placeholders** (9 defined, positional):
| Token | Data |
|-------|------|
| `{{1}}` | Customer Name |
| `{{2}}` | Order ID / Reference |
| `{{3}}` | Current Status |
| `{{4}}` | Shop Name |
| `{{5}}` | Promised Date |
| `{{6}}` | Watch Details (brand + model + serial) |
| `{{7}}` | Recommended Works |
| `{{8}}` | Estimate Total (formatted currency) |
| `{{9}}` | Diagnosis Summary |

Templates are stored in `DW WhatsApp Template` keyed by `notification_key`. Delivery is via background jobs with exponential backoff (10s/20s/40s, max 3 retries).

---

## 13. Print Formats

| Name | DocType | Use |
|------|---------|-----|
| `DW Watch Quotation` | Quotation | Repair estimate handout |
| `DW Watch Invoice` | Sales Invoice | Repair invoice (customer copy) |
| `DW PMS Tax Invoice` | Sales Invoice | Bahrain VAT/PMS invoice |
| `DW POS Retail Receipt` | Sales Invoice | Walk-in retail receipt |
| `DW RO Bag Label` | DW Repair Order | Small label for repair bag/envelope |
| `DW RO Drop Off Receipt` | DW Repair Order | Customer drop-off receipt |

---

## 14. Key Architectural Decisions & Quirks

1. **Flat child tables with repair_item_key**: Tasks, parts, and issues are stored in flat `all_tasks/all_parts/all_issues` tables on the parent order (not nested inside items). The string `item.idx` acts as a foreign key. The frontend sends a nested JSON structure; `save_repair_order()` flattens it before saving.

2. **Status resolution is functional**: `resolve_repair_item_status()` and `resolve_diagnosis_status()` are pure functions that take inputs and return the next status. They are imported and used in both the Python controller and the API layer, and mirrored in TypeScript at `types.ts:resolveDiagnosisStatus`.

3. **Internal line pattern**: Parts on invoices/quotations have `rate=0` + `dw_is_internal_line=1` so ERPNext deducts stock at valuation rate without inflating the customer-visible total.

4. **`_zero_internal_lines()` call pattern**: Must always be called after `document.insert()` because ERPNext's `set_missing_values()` fetches price list rates and overwrites explicit zeros.

5. **Cache invalidation**: `clear_invoice_settings_cache()` and `clear_pms_runtime_configuration_cache()` must be called after saving settings, as both systems use `frappe.local` request-scoped caching.

6. **Auto-task sync**: `sync_item_tasks_with_auto_sources()` in `api.py` rebuilds the task list from `recommended_work` items or `issue.suggested_task` mappings whenever diagnosis data is saved, auto-creating `DW Task Template` records for novel work names.

7. **POS payment modes**: `Mode of Payment.type` determines behavior — `Cash`/`Bank` = immediate payment (non-zero amount), `General` = credit/pay-later (zero amount entry). The `DW Payment Mode Config` table gates which modes appear in the SPA.

---

## 15. Development Reference

### Running the frontend
```bash
cd /home/frappe/frappe-bench/apps/watch_doctor/frontend
npm run dev
```

### Common bench commands
```bash
bench migrate               # Runs all after_migrate hooks
bench build --app watch_doctor  # Build frontend assets
bench restart               # Restart workers
```

### Key API call pattern (from frontend)
All calls go to `/api/method/watch_doctor.api.<function_name>` as POST with JSON body. CSRF token is read from `window.csrf_token` (Frappe injects this into the page).

### Adding a new whitelisted endpoint
1. Add `@frappe.whitelist()` decorated function in `watch_doctor/api.py`
2. Add `require_roles(...)` as the first line
3. Call it from frontend as `POST /api/method/watch_doctor.api.<function_name>`

### Adding a new DocType
1. Create directory under `watch_doctor/repair_management/doctype/dw_<name>/`
2. Add JSON definition + Python controller
3. Add to `after_migrate` reload list or fixtures in `hooks.py`
4. Run `bench migrate`

---

## 16. File Map (Key Files)

```
watch_doctor/
├── hooks.py                          # All Frappe hooks
├── api.py                            # ~3000 lines, all whitelisted API endpoints
├── permissions.py                    # RBAC logic
├── pms.py                            # Bahrain PMS/VAT Sales Invoice hooks
├── invoice_settings.py               # Centralized workflow settings helpers
├── inventory_helpers.py              # Stock availability validation
├── pos_enhancements.py               # POS profile resolution + invoice creation
├── general_configuration.py          # Company info singleton helpers
├── setup_*.py                        # Data migration / seed scripts
├── repair_management/
│   ├── doctype/
│   │   ├── dw_repair_order/
│   │   │   ├── dw_repair_order.py   # Main DocType controller
│   │   │   └── dw_repair_order.json
│   │   ├── dw_repair_item/
│   │   ├── dw_repair_task/
│   │   └── ... (all other doctypes)
│   ├── print_format/                 # Jinja HTML print templates
│   └── workspace/                   # Frappe Desk workspace config
├── whatsapp/
│   ├── service.py                   # Message build + send logic
│   └── api.py                       # Whitelisted WhatsApp endpoints
├── patches/                         # One-time migration patches
└── www/
    └── repair.py                    # Public portal (minimal)

frontend/src/
├── App.tsx                          # Top-level routing + auth guard
├── types.ts                         # All TypeScript interfaces + status enums
├── services/
│   ├── apiService.ts                # All API calls to Frappe backend
│   └── authService.ts               # Login/logout
├── context/
│   ├── AuthContext.tsx              # User info + role state
│   └── AppConfigContext.tsx         # Logo, currency, config state
├── components/
│   ├── RepairOrderList.tsx          # Order list with search + pagination
│   ├── RepairOrderDetail.tsx        # Order detail view
│   ├── RepairOrderForm.tsx          # Create/edit form
│   ├── POS.tsx                      # Walk-in POS
│   ├── Dashboard.tsx                # KPI dashboard
│   ├── ExecutiveDashboard.tsx       # Extended dashboard (Executive only)
│   ├── DailyReport.tsx              # Daily financial close report
│   ├── Settings.tsx                 # App settings (Executive only)
│   ├── ui/                          # Reusable UI primitives
│   ├── icons/                       # SVG icon components
│   ├── layout/                      # Header + Sidebar
│   └── reports/                     # Report components
└── constants.ts                     # App-wide constants
```
