# Watch Doctor — Application Functionalities

> **Generated:** 2026-06-05  
> **Branch:** develop

---

## 1. Repair Order Management

The central workflow of the app. A **Repair Order** (`DW Repair Order`) is the top-level entity representing one customer visit. It can hold multiple watches.

- Create / Edit / Delete repair orders with customer, priority, received date, and promised delivery date
- **Reference number** field for external tracking (e.g., a handwritten tag)
- **Naming series** `YY.MM.####` — auto-incremented per month (e.g., `2504.0001`)
- **Multi-watch support** — one order holds N watches as child rows (`DW Repair Item`)
- **Status auto-calculation** — order status is derived from item statuses; no manual override needed
- **Submit / Cancel** — submitting locks the order, stamps delivery date, marks all items Delivered
- **Pagination & search** — list view supports search by order name, reference, customer name, and mobile number; filterable by status

---

## 2. Watch Intake & Item Tracking

Each physical watch in a repair order is tracked as a `DW Repair Item`:

- **Watch identification** — brand (linked to `DW Watch Brand`), model (linked to `DW Watch Model`), serial number
- **Create brand / model on-the-fly** — inline creation from the order form
- **Customer-reported issues** — select from `DW Issue Template` list or enter freeform "Other" issue
- **Pre-existing conditions** — multi-select from `DW Watch Condition Template` (e.g., scratches, missing crown)
- **Intake checklist** — scratches, water resistance, missing parts, other observations
- **Per-watch status tracking** — 10-state machine: Pending → Under Diagnosis → Diagnosed → Create Estimate → Quoted → In Repair → Completed → Not Repairable / Declined / Delivered

---

## 3. Technician Assignment & Access Control

- **Assign technician** to individual watches (not the whole order)
- **Technician view** — technicians only see orders where they are assigned to at least one watch
- **Technician self-service** — technicians can update diagnosis and task status for their own assigned watches only
- **Identity resolution** — flexible matching of technician record to Frappe user account (by `user`, `email`, or `technician_name`)

---

## 4. Diagnosis Workflow

Technicians fill diagnosis data per watch:

- **Diagnosis summary** — free-text snippets, selectable from `DW Diagnosis Summary Template`
- **Movement type** — select from templates (quartz, automatic, manual-wind, etc.)
- **Movement caliber** — movement caliber code (e.g., `ETA 2824-2`)
- **Recommended work** — what repairs are needed, selectable from `DW Recommended Work Template`
- **Diagnosis status** — auto-advances from `Pending Diagnosis` → `Diagnosed` once any content is filled; manually set to `Awaiting Approval`, `Not Repairable`, `Quoted`, or `Declined`
- **Diagnosed by / diagnosis date** — auto-stamped when a technician saves diagnosis content
- **Legacy movement information** — backward-compatible field that auto-splits into `movement_type` + `movement_caliber` on load

---

## 5. Repair Tasks

Service tasks assigned to a watch within an order (`DW Repair Task`, child of `all_tasks`):

- **Add tasks** — selected from `DW Task Template` (with `default_rate`)
- **Auto-task creation** — tasks are auto-generated from `recommended_work` items or `issue.suggested_task` mappings; new work names auto-create task templates
- **Task status** — Pending → In Progress → Completed; auto-advances to In Progress when parts are added
- **Per-task pricing** — auto-rate from template, manually overridable with `price_manually_set` audit flag
- **Technician per task** — tasks inherit the watch's assigned technician

---

## 6. Parts Management

Parts consumed in a repair (`DW Repair Part Used`, child of `all_parts`):

- **Add parts** — searched from ERPNext `Item` catalog with real-time stock balance displayed
- **Flexible item search** — multi-word, any-order search (e.g., "battery 357" finds "357 RENATA BATTERY")
- **Quantity & UOM** — tracks quantity used and unit of measure
- **Per-part pricing** — auto-rate from item's `standard_rate`, manually overridable
- **Stock balance display** — actual qty shown in search results (from `tabBin`)
- **Stock validation** — checks availability before finalizing invoice; throws with per-item shortage details

---

## 7. Quotation Generation

Creates an ERPNext `Quotation` from a repair order:

- **Estimate or final quotation** — `quotation_type` = "Estimate" or "Final"
- **Selective watch inclusion** — can generate a quotation for a subset of watches by index
- **Line structure** — one visible service line per watch (labor + parts markup) + zero-rate internal part lines for stock tracking
- **Description from recommended work** — service line description populated from `recommended_work` items
- **Auto-submit** — quotation is inserted and submitted immediately
- **Link back** — `DW Repair Order.quotation` and `quotation_amount` updated after creation
- **View / print quotation** — modal with print action using the `DW Watch Quotation` print format

---

## 8. Invoice Generation & Finalization

Full billing workflow via ERPNext `Sales Invoice`:

- **Create invoice from quotation or directly from order** — `source_type` = "quotation" or "order"
- **Partial payment support** — advance or balance payment with discount calculation
- **POS invoice** — `is_pos = 1` with payment tracking rows
- **Stock deduction** — `update_stock = 1` causes ERPNext to create Stock Ledger Entries on submit
- **Finalize invoice** — apply discount, set payment mode, submit invoice, optionally deliver the order
- **Payment modes** — Cash (immediate), Bank (immediate), General/Credit (pay later)
- **Invoice summary** — paid amount, balance, payment status
- **Print** — workflow-aware print format selection (repair invoice vs. POS receipt vs. PMS tax invoice)

---

## 9. Point of Sale (POS)

Walk-in retail sales independent of the repair workflow:

- **Full POS UI** — item search, quantity, price, customer selection
- **POS profile** — uses ERPNext POS Profile for warehouse, default customer, commission
- **Split payments** — multiple payment modes in one transaction
- **PMS detection** — automatically switches to PMS invoice if items from the PMS item group are added
- **Receipt printing** — `DW POS Retail Receipt` (standard) or `DW PMS Tax Invoice` (PMS) based on cart contents

---

## 10. Bahrain Profit Margin Scheme (PMS) / VAT

Bahrain-specific VAT compliance:

- **PMS toggle** — enable/disable via `DW PMS Settings` singleton
- **Per-item PMS flag** — `dw_is_pms_item` marks which invoice lines are subject to PMS
- **Purchase cost entry** — technician/executive enters purchase cost per item
- **Margin and VAT calculation** — auto-calculated on Sales Invoice validate: `margin = selling - purchase_cost`; `vat = margin / pms_vat_divisor`
- **Custom fields on Sales Invoice** — `dw_pms_margin`, `dw_pms_vat`, `dw_pms_total_vat`, `dw_pms_disclaimer`
- **Tax account posting** — VAT amount posted to configured `pms_vat_account` on submit; reversed on cancel
- **PMS Tax Invoice print format** — shows purchase cost, margin, and VAT breakdown per line

---

## 11. WhatsApp Customer Notifications

Outbound WhatsApp messages via whapi.cloud:

- **Notification templates** — stored in `DW WhatsApp Template`, keyed by `notification_key` (e.g., `watch_estimate_ready`)
- **9 dynamic placeholders** — Customer Name, Order ID, Status, Shop Name, Promised Date, Watch Details, Recommended Works, Estimate Total, Diagnosis Summary
- **Watch-specific estimates** — `build_watch_estimate_message()` resolves per-watch cost and formats it with currency
- **Phone normalization** — handles local vs. international format, strips non-digits, applies default country code (973 for Bahrain)
- **Background delivery** — sent as a Frappe background job (queue)
- **Retry logic** — exponential backoff (10s / 20s / 40s), max 3 retries for HTTP 429/5xx
- **Delivery log** — `DW WhatsApp Log` tracks send status, whapi message ID, error details, retry count

---

## 12. Dashboard & KPIs

Executive and Data Entry users see:

- **KPI cards** — total orders, pending, in-progress, repaired, delivered counts; orders received in period; revenue this month; average repair days
- **Orders trend chart** — daily received vs. completed for last N days
- **Technician performance** — tasks completed / in-progress / pending per technician
- **Top issues** — most common customer-reported issues with percentage share
- **Aged pending orders** — oldest unresolved orders with days-pending count
- **Configurable period** — 7 / 30 / 90 days

---

## 13. Daily Financial Report

End-of-day reconciliation for shop managers:

- **Repair revenue** — invoiced amounts from repair orders
- **POS revenue** — walk-in sales totals
- **Expense entries** — journal entries tagged as expenses
- **Payment entry breakdown** — by payment mode (cash, card, etc.)
- **Profit summary** — gross margin analysis (Executive only)
- **Printable report** — formatted for daily closing

---

## 14. Reports

Dedicated report views:

- **Repair Summary Report** — order volume, status distribution, by technician
- **Sales Summary Report** — revenue by date range
- **Financial Summary Report** — daily financial close aggregation
- **Profit Summary Report** — margin analysis (Executive only, PMS-aware)

---

## 15. Settings (Executive Only)

Full configuration panel in the SPA:

- **General configuration** — company name, phone, email, website, address, CR number, VAT registration number, repair receipt subtitle (used in print formats)
- **Invoice workflow settings** — naming series + print format per workflow (`repair_service`, `pos_standard`, `pos_pms`)
- **PMS configuration** — enable/disable PMS, item group, VAT account, disclaimer text, VAT divisor, print format
- **App logo** — upload/set logo URL displayed in the SPA header
- **WhatsApp template management** — create/edit/preview notification templates with placeholder substitution

---

## 16. Customer Management

Thin layer on top of ERPNext `Customer`:

- **Search customers** — by name, mobile, or customer ID
- **Create customer on-the-fly** — inline customer creation from the repair order form
- **Customer portal page** — `www/repair.py` provides a minimal public-facing repair status page

---

## 17. Print Formats

Six custom Jinja-based HTML print formats:

| Format | Used For |
|--------|---------|
| DW Watch Quotation | Repair estimate handout |
| DW Watch Invoice | Repair invoice customer copy |
| DW PMS Tax Invoice | Bahrain VAT-compliant invoice |
| DW POS Retail Receipt | Walk-in retail receipt |
| DW RO Bag Label | Small label printed for repair bag/envelope |
| DW RO Drop Off Receipt | Customer drop-off acknowledgment |

---

## 18. Role-Based Access Summary

| Functionality | Executive | Data Entry | Technician |
|---------------|:---------:|:----------:|:----------:|
| View all repair orders | ✅ | ✅ | Own assigned only |
| Create / edit orders | ✅ | ✅ | Own orders |
| Assign technician | ✅ | ✅ | ❌ |
| Update diagnosis | ✅ | ✅ | Own watches only |
| Generate quotation | ✅ | ✅ | ❌ |
| Create / finalize invoice | ✅ | ✅ | ❌ |
| POS | ✅ | ✅ | ❌ |
| Dashboard | ✅ Full | ✅ Simplified | ❌ |
| Daily report | ✅ incl. profit | ✅ no profit tab | ❌ |
| Settings | ✅ | ❌ | ❌ |
| WhatsApp notifications | ✅ | ✅ | ❌ |
