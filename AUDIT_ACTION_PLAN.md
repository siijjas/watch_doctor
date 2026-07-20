# Watch Doctor — Audit Gap Action Plan

> **Source:** Technical Audit Report (2026-06-05)  
> **Scope:** All P1–P3 items plus high-value unlisted gaps surfaced in the audit body  
> **Format:** Each item states what to change, which files to touch, and the concrete code approach.

---

## How to Read This Document

- **P1** — Fix before next production release. Data integrity or security risk.
- **P2** — Fix in the next planned sprint. UX or operational impact.
- **P3** — Backlog. Nice-to-have; schedule when capacity allows.
- File paths are relative to `watch_doctor/` unless prefixed with `frontend/`.

---

## P1 — Critical Fixes

---

### P1-A · Partial Delivery / Invoice on Multi-Watch Orders

**Problem:** `finalize_invoice` + `on_submit` always deliver the entire order. A customer cannot collect 3 of 5 repaired watches early.

**Approach:** Introduce a per-watch invoice flow.

**Files to change:**

1. **`repair_management/doctype/dw_repair_order/dw_repair_order.py`**
   - Remove the blanket "all items must be Completed" guard from `before_submit`. Replace with: at least one item must be Completed/Delivered, and none can be in a pre-diagnosis state.
   - Change `on_submit` to only set `Delivered` on items that are in `Completed` status at submit time — leave `In Repair` items untouched.

2. **`api.py` — `create_sales_invoice()`**
   - Add an optional `item_indices` parameter (JSON list of `DW Repair Item` names or idx values).
   - When provided, only build invoice lines for those watches. Record which watches are covered on the invoice (store as a JSON field `dw_covered_item_indices` on Sales Invoice via a custom field or in remarks).

3. **`api.py` — `finalize_invoice()`**
   - After invoice submission, mark only the covered watches as `Completed`/`Delivered` rather than all items on the order.
   - Recalculate order-level status after partial delivery.

4. **`frontend/src/components/CreateInvoiceModal.tsx`**
   - Add a checklist of watches in the order. Default all selected. Allow deselecting.
   - Pass selected item names to `create_sales_invoice`.

5. **`frontend/src/components/RepairOrderDetail.tsx`**
   - Show a "partial delivery" badge when `status != 'Delivered'` but some items are `Delivered`.

**Effort:** ~2 days

---

### P1-B · Duplicate Customer Mobile Number Check

**Problem:** `create_pos_customer` inserts without checking for an existing customer with the same mobile number, fragmenting customer history.

**Files to change:**

1. **`api.py` — `create_pos_customer()`** (line ~2046)

   After stripping `mobile_no`, add before `customer_doc.insert(...)`:
   ```python
   if mobile_no:
       existing = frappe.db.get_value(
           "Customer", {"mobile_no": mobile_no}, ["name", "customer_name"], as_dict=True
       )
       if existing:
           frappe.throw(
               f"A customer with mobile {mobile_no} already exists: "
               f"{existing.customer_name} ({existing.name}). "
               "Search for the existing customer instead of creating a duplicate."
           )
   ```

2. **`api.py` — wherever inline `CreateCustomerModal` POSTs** — apply the same check to the repair-order customer creation path if a separate endpoint is used.

3. **`frontend/src/components/CreateCustomerModal.tsx`**
   - Surface the error message clearly — the backend throws a descriptive message, so no extra frontend logic is needed beyond showing the toast.

**Effort:** 1 hour

---

### P1-C · Duplicate Serial Number Check Across Active Orders

**Problem:** The same watch serial number can be opened on two concurrent repair orders with no warning.

**Files to change:**

1. **`api.py` — `save_repair_order()`** (line ~648)

   After building `doc_dict['items']` and before `doc.save()`, add:
   ```python
   for item in doc_dict.get('items', []):
       serial = (item.get('serial_number') or '').strip()
       if not serial:
           continue
       conflict = frappe.db.sql("""
           SELECT ri.parent
           FROM `tabDW Repair Item` ri
           JOIN `tabDW Repair Order` ro ON ro.name = ri.parent
           WHERE ri.serial_number = %s
             AND ro.docstatus = 0
             AND ro.status NOT IN ('Delivered')
             AND ri.name != %s
       """, (serial, item.get('name') or ''), as_dict=True)
       if conflict:
           frappe.throw(
               f"Serial number '{serial}' is already active on repair order "
               f"{conflict[0]['parent']}. Verify before proceeding.",
               title="Duplicate Serial Number"
           )
   ```

**Effort:** 2 hours

---

### P1-D · Stock Soft-Warning at Part Addition (Not Just at Invoice)

**Problem:** Stock shortage is only caught at `finalize_invoice`. A technician can record parts usage for items not in stock, discovering the problem only when billing.

**Files to change:**

1. **`api.py`** — Add a new whitelisted endpoint:
   ```python
   @frappe.whitelist()
   def get_item_stock(item_code: str, warehouse: str = ""):
       """Return available stock for a single item."""
       require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
       qty = frappe.db.sql(
           "SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s"
           + (" AND warehouse = %s" if warehouse else ""),
           (item_code, warehouse) if warehouse else (item_code,)
       )
       return {"item_code": item_code, "available_qty": float((qty[0][0] or 0))}
   ```

2. **`frontend/src/components/AddPartModal.tsx`**
   - After the user picks an item and enters a quantity, call `get_item_stock`.
   - If `quantity > available_qty`, show a yellow inline warning: *"Only X in stock — verify before saving."* Do not block saving (soft-warning only, since multi-warehouse setups may have stock elsewhere).

**Effort:** 3 hours

---

### P1-E · Credit Invoice Aging / AR Tracking

**Problem:** `General/Credit` payment mode creates a pay-later invoice with no overdue tracking surfaced in the app. `balance_amount` is set on the repair order but never shown in a receivables view.

**Files to change:**

1. **`api.py`** — Add a new endpoint:
   ```python
   @frappe.whitelist()
   def get_outstanding_invoices(days_overdue: int = 0):
       """Return submitted Sales Invoices with outstanding amounts."""
       require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
       rows = frappe.db.sql("""
           SELECT
               si.name, si.customer, c.customer_name, c.mobile_no,
               si.grand_total, si.outstanding_amount,
               si.posting_date,
               DATEDIFF(CURDATE(), si.posting_date) AS days_outstanding,
               ro.name AS repair_order
           FROM `tabSales Invoice` si
           LEFT JOIN `tabCustomer` c ON c.name = si.customer
           LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
           WHERE si.docstatus = 1
             AND si.outstanding_amount > 0
             AND DATEDIFF(CURDATE(), si.posting_date) >= %s
           ORDER BY si.posting_date ASC
       """, (int(days_overdue),), as_dict=True)
       return rows
   ```

2. **`frontend/src/components/Dashboard.tsx`** or **`ExecutiveDashboard.tsx`**
   - Add an "Outstanding Receivables" card showing total credit balance and count of overdue invoices (>30 days).
   - Clicking drills into a simple table (new component `OutstandingInvoicesModal.tsx` or inline panel).

3. **`frontend/src/components/RepairOrderDetail.tsx`**
   - When `balance_amount > 0`, show a highlighted banner: *"Balance of [amount] outstanding — collect payment."*

**Effort:** 1 day

---

### P1-F · Concurrent Save Conflict Detection (Optimistic Locking)

**Problem:** `clean_dict` strips `modified` before passing to Frappe's `doc.update()`. Two concurrent saves can silently overwrite each other.

**Files to change:**

1. **`api.py` — `save_repair_order()`** (line ~675)

   - **Do not strip `modified`** from the top-level doc dict (only strip it from child rows where it's noise).
   - After `doc = frappe.get_doc('DW Repair Order', doc_dict['name'])` and before `doc.update(doc_dict)`, add:
   ```python
   client_modified = doc_dict.get('modified')
   if client_modified and str(doc.modified) != str(client_modified):
       frappe.throw(
           "This order was modified by another user while you were editing. "
           "Please reload the page and re-apply your changes.",
           title="Save Conflict"
       )
   ```
   - Update `clean_dict` to only strip `modified` from child-table dicts (those with a `parentfield` key), not the root doc.

2. **`frontend/src/services/apiService.ts`**
   - Ensure `modified` is included in the payload sent to `save_repair_order`. It is already part of `RepairOrder` if fetched from the API — verify the field is not dropped before the POST.

3. **`frontend/src/components/RepairOrderDetail.tsx`**
   - On receiving a "Save Conflict" error, show a clear modal prompting the user to reload rather than a generic toast.

**Effort:** 3 hours

---

### P1-K · Public Repair Status Page — Access Token Security

**Problem:** `www/repair.py` serves the built SPA (it is the SPA host, not a per-order status page), so the immediate security risk described in the audit is lower than stated. However, **if** a public-facing order lookup URL is ever implemented using the sequential naming series `2504.0001`, it would be trivially enumerable.

**Current state:** `www/repair.py` is the SPA shell — it requires an authenticated Frappe session (CSRF token is injected). No unauthenticated order lookup exists today.

**Action:** Add a comment to `www/repair.py` warning that any future public lookup endpoint must use a non-sequential token (e.g., a random UUID stored on `DW Repair Order.public_token`). No code change needed now — document and create a guard for future work.

**Files to change:**

1. **`repair_management/doctype/dw_repair_order/dw_repair_order.json`**
   - Add a `Data` field `public_token` (hidden, auto-generated on `before_insert` via `frappe.generate_hash()`), so the infrastructure is ready when/if a customer portal is built.

2. **`repair_management/doctype/dw_repair_order/dw_repair_order.py` — `validate()`**
   - In `validate()`, if `not self.public_token: self.public_token = frappe.generate_hash(length=16)`

**Effort:** 1 hour

---

## P2 — High-Value Operational Fixes

---

### P2-G · Customer Repair History in SPA

**Problem:** No quick access to a customer's prior repair history when creating a new order.

**Files to change:**

1. **`api.py`** — Add endpoint:
   ```python
   @frappe.whitelist()
   def get_customer_repair_history(customer: str, limit: int = 20):
       require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
       return frappe.db.sql("""
           SELECT o.name, o.status, o.received_date, o.delivery_date,
                  o.invoiced_amount, COUNT(i.name) AS watch_count
           FROM `tabDW Repair Order` o
           LEFT JOIN `tabDW Repair Item` i ON i.parent = o.name
           WHERE o.customer = %s
           GROUP BY o.name
           ORDER BY o.received_date DESC
           LIMIT %s
       """, (customer, int(limit)), as_dict=True)
   ```

2. **`frontend/src/components/RepairOrderForm.tsx`**
   - After a customer is selected, fetch and display a collapsible "Previous Orders" section showing the last 5 orders (date, status, amount).

3. **`frontend/src/services/apiService.ts`**
   - Add `getCustomerRepairHistory(customer: string)` function.

**Effort:** 4 hours

---

### P2-H · "Awaiting Approval / Create Estimate" — Trigger Notification

**Problem:** `STATUS_TO_NOTIFICATION_KEY` in `whatsapp/api.py` has no entry for `"Create Estimate"`. When a watch enters this state (the most actionable customer-facing event), no WhatsApp notification fires.

**Files to change:**

1. **`whatsapp/api.py`** (line 4–10)
   ```python
   STATUS_TO_NOTIFICATION_KEY = {
       "Pending": "order_received",
       "In Progress": "in_progress",
       "Awaiting Parts": "awaiting_parts",
       "Create Estimate": "estimate_ready",   # ← ADD THIS
       "Repaired": "ready_for_collection",
       "Delivered": "delivered",
   }
   ```

2. **`watch_doctor/patches/`** — Add `seed_whatsapp_estimate_template.py`:
   - Insert a `DW WhatsApp Template` row with `notification_key = "estimate_ready"` if it does not exist.
   - Register the patch in `patches.txt`.

3. **`api.py` — `save_repair_order()`**
   - After `doc.save()`, check if any item's status just transitioned to `Create Estimate`. If so, enqueue an auto-notification (only if WhatsApp is enabled and no notification was sent recently for this order+status combo).
   - Wrap in a `try/except` so a WhatsApp failure never blocks a save.

**Effort:** 4 hours

---

### P2-I · Promised Date ≥ Received Date Validation

**Problem:** A user can enter a promised delivery date in the past relative to intake date.

**Files to change:**

1. **`repair_management/doctype/dw_repair_order/dw_repair_order.py` — `validate()`**
   ```python
   if self.received_date and self.promised_delivery_date:
       if getdate(self.promised_delivery_date) < getdate(self.received_date):
           frappe.throw(
               _("Promised delivery date cannot be before the received date.")
           )
   ```

2. **`api.py` — `save_repair_order()`**
   - Add the same check on `doc_dict` before `doc.save()` so the API path is also guarded.

3. **`frontend/src/components/RepairOrderForm.tsx`**
   - Add a client-side validation: disable or highlight the promised date picker if the selected date is earlier than the received date.

**Effort:** 1 hour

---

### P2-J · Configurable WhatsApp Country Code in Settings

**Problem:** Default country code `973` (Bahrain) is hardcoded in `whatsapp/service.py:get_default_country_code()` and not editable from the SPA Settings panel.

**Files to change:**

1. **`setup_general_configuration.py`** — Add a `whatsapp_default_country_code` field (Data) to `DW General Configuration`.

2. **`general_configuration.py`** — Include `whatsapp_default_country_code` in `get_general_configuration()` / `set_general_configuration()`.

3. **`api.py` — `save_general_configuration()`** — Add `whatsapp_default_country_code` parameter.

4. **`whatsapp/service.py` — `get_default_country_code()`**
   - After checking `frappe.conf`, also check `DW General Configuration.whatsapp_default_country_code` before falling back to `"973"`.

5. **`frontend/src/components/Settings.tsx`**
   - Add a "Default Country Code" input field in the WhatsApp section.

**Effort:** 3 hours

---

### P2-M · Settings Change Audit Log

**Problem:** No record of who changed PMS divisor, VAT account, or invoice naming series.

**Files to change:**

1. **`api.py`** — Add a small helper:
   ```python
   def _log_settings_change(section: str, changes: dict):
       frappe.log_error(
           message=f"Settings changed by {frappe.session.user}: {changes}",
           title=f"DW Settings Change — {section}",
       )
   ```
   Call it at the end of `save_pms_configuration`, `save_invoice_workflow_configuration`, and `save_general_configuration` with a dict of the new values.

   Alternatively (preferred for searchability): use Frappe's `Version` doctype or `frappe.db.add_comment()` on the singleton doc.

**Effort:** 1 hour

---

### P2-Empty-Order Guard

**Problem (from audit body, not in priority matrix):** Saving a `DW Repair Order` with zero `items` is allowed.

**Files to change:**

1. **`api.py` — `save_repair_order()`**
   ```python
   if not doc_dict.get('items'):
       frappe.throw(_("A repair order must contain at least one watch."))
   ```

2. **`repair_management/doctype/dw_repair_order/dw_repair_order.py` — `validate()`**
   ```python
   if not self.items:
       frappe.throw(_("A repair order must contain at least one watch."))
   ```

**Effort:** 30 minutes

---

### P2-PMS Divisor Plausibility Check

**Problem (from audit body):** A mis-entered `pms_vat_divisor` (e.g., `1.05` instead of `21`) silently corrupts all VAT calculations.

**Files to change:**

1. **`api.py` — `save_pms_configuration()`** — after the `> 0` check, add:
   ```python
   if pms_enabled and float(pms_vat_divisor) < 5:
       frappe.throw(
           "PMS VAT Divisor seems unusually low (less than 5). "
           "For Bahrain's standard 10% VAT, the divisor is typically 11. Verify your entry."
       )
   ```

**Effort:** 30 minutes

---

### P2-Awaiting Approval Notification Gap (Resend Override)

**Problem:** Executives cannot resend a WhatsApp notification if the cooldown hasn't expired.

**Files to change:**

1. **`whatsapp/api.py` — `notify_customer()`**
   - Add an optional `force: bool = False` parameter.
   - If `force=True` and the caller has `ROLE_EXECUTIVE`, skip the cooldown check.

2. **`frontend/src/components/NotifyCustomerModal.tsx`**
   - If the API returns a cooldown error, show a "Send Anyway" button (visible to executives only) that re-calls with `force=true`.

**Effort:** 2 hours

---

## P3 — Backlog Improvements

---

### P3-O · Manual Task Stability (Not Wiped on Re-Sync)

**Problem:** `sync_item_tasks_with_auto_sources` clears and rebuilds all tasks for an item on every save. Manually added tasks that are not derived from `recommended_work` or issue templates are silently deleted.

**Current behavior in `api.py:sync_item_tasks_with_auto_sources()`:** All tasks for the item are removed, then only auto-sourced tasks are re-added.

**Approach:** Introduce a `is_manual` flag on `DW Repair Task`:

1. **`repair_management/doctype/dw_repair_task/dw_repair_task.json`**
   - Add a `Check` field `is_manual` (default 0).

2. **`api.py` — `sync_item_tasks_with_auto_sources()`**
   - When rebuilding tasks, preserve rows where `is_manual = 1` — copy them back into the rebuilt list unchanged.

3. **`api.py` — `save_repair_order()`**
   - When a task is added via `AddTaskModal` (not from `recommended_work`), set `is_manual = 1` on the task dict before appending to `all_tasks`.

4. **`frontend/src/components/AddTaskModal.tsx`**
   - Include `is_manual: true` in the task payload.

**Effort:** 1 day

---

### P3-N · Print Format Customization Protection

**Problem:** `rename_and_sync_print_format` overwrites any manual customizations on `bench migrate`.

**Files to change:**

1. **`api.py` — `rename_and_sync_print_format()`**
   - Before overwriting `doc.html`, check if the current DB content differs from the fixture. If it does, write to `frappe.log_error` (non-blocking) so the admin is aware their customization was overwritten:
   ```python
   if doc.html and doc.html.strip() != (payload.get("html") or "").strip():
       frappe.log_error(
           f"Print Format '{new_name}' had local customizations that were overwritten by the app fixture.",
           "DW Print Format Overwrite Warning"
       )
   ```

2. **Longer-term:** Move customizable templates to a "custom override" layer — store the base HTML in a fixture field and allow a `custom_html` override field that takes precedence during rendering, so upgrades never touch the override.

**Effort:** 2 hours (for the warning); 2 days for the override layer.

---

### P3-P · Inbound WhatsApp Reply Capture

**Problem:** Customer replies to notifications have no path back into the system.

**Approach:** Implement a webhook endpoint for whapi.cloud inbound messages.

**Files to change / create:**

1. **Create `watch_doctor/whatsapp/webhook.py`**
   - `@frappe.whitelist(allow_guest=True)` endpoint `receive_whatsapp_webhook(payload_json)`.
   - Verify a shared secret from `frappe.conf.get("whapi_webhook_secret")`.
   - Match the sender phone number to a `Customer` via `mobile_no`.
   - Append the message text to `DW WhatsApp Log` as a reply row or create a new Frappe `Communication` linked to the customer.

2. **`watch_doctor/hooks.py`**
   - No Frappe hook needed — the webhook URL is registered in the whapi.cloud dashboard pointing to `/api/method/watch_doctor.whatsapp.webhook.receive_whatsapp_webhook`.

3. **`frontend/src/components/NotifyCustomerModal.tsx`**
   - Add a "Replies" tab showing inbound messages from the customer on this order.

**Effort:** 3 days

---

### P3-Q · Technician Workload View at Assignment Time

**Problem:** No visibility into how many open items a technician already has when assigning a new watch.

**Files to change:**

1. **`api.py`** — Extend `get_employees()` to include a workload count:
   ```python
   def get_employees():
       employees = frappe.get_all("DW Technician", fields=["name", "employee_name", ...])
       open_counts = frappe.db.sql("""
           SELECT technician, COUNT(*) as open_count
           FROM `tabDW Repair Item`
           WHERE status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined')
             AND technician IS NOT NULL AND technician != ''
           GROUP BY technician
       """, as_dict=True)
       count_map = {r.technician: r.open_count for r in open_counts}
       for emp in employees:
           emp['open_items'] = count_map.get(emp['name'], 0)
       return employees
   ```

2. **`frontend/src/components/AssignTechnicianModal.tsx`**
   - Show `({open_items} open)` next to each technician name in the dropdown.

**Effort:** 2 hours

---

### P3-R · Quotation Revision Tracking & Expiry Date

**Problem:** Multiple quotations for the same order overwrite the single `quotation` link. No expiry date is set.

**Files to change:**

1. **`repair_management/doctype/dw_repair_order/dw_repair_order.json`**
   - Change `quotation` from a single Link field to a child table `DW Repair Order Quotation` with columns: `quotation`, `quotation_type`, `amount`, `revision`, `creation_date`.

2. **`repair_management/doctype/dw_repair_order/dw_repair_order.py` — `create_quotation()`**
   - Append a new row to the child table instead of overwriting the single link field.
   - Set `valid_till` on the ERPNext Quotation to `add_days(today, 30)` or a configurable value from `DW General Configuration`.

3. **`api.py` — `create_quotation()` and `get_quotation_summary()`**
   - Update to read from/write to the new child table.

4. **`frontend/src/components/RepairOrderDetail.tsx`**
   - Show quotation history list instead of single quotation link.

**Effort:** 1 day

---

### P3-Daily-Report · Date Range Filter

**Problem:** The daily financial report has no way to reprint a past day's report.

**Files to change:**

1. **`api.py`** — All daily report functions already accept `report_date` as a parameter. Verify and expose this in the API response.

2. **`frontend/src/components/DailyReport.tsx`**
   - Add a date picker defaulting to today. Pass the selected date to all report API calls.

**Effort:** 2 hours

---

### P3-Dashboard · Exclude Cancelled Invoices from Revenue KPIs

**Problem (from audit body):** "Revenue this month" may include cancelled invoices.

**Files to change:**

1. **`api.py` — `get_dashboard_stats()`** (line ~1623)

   The existing query:
   ```sql
   WHERE si.docstatus = 1
   ```
   `docstatus = 1` is "Submitted" in Frappe — cancelled docs have `docstatus = 2`. This is already correct. **No change needed** — confirm and document.

---

## Summary Table

| ID | Item | Priority | Files | Est. Effort |
|----|------|----------|-------|-------------|
| P1-A | Partial delivery / invoice | P1 | `dw_repair_order.py`, `api.py` (×2), `CreateInvoiceModal.tsx`, `RepairOrderDetail.tsx` | 2 days |
| P1-B | Duplicate mobile check | P1 | `api.py` (`create_pos_customer`) | 1 hour |
| P1-C | Duplicate serial number check | P1 | `api.py` (`save_repair_order`) | 2 hours |
| P1-D | Stock soft-warning at part add | P1 | `api.py` (new endpoint), `AddPartModal.tsx` | 3 hours |
| P1-E | Credit invoice AR tracking | P1 | `api.py` (new endpoint), `Dashboard.tsx`, `RepairOrderDetail.tsx` | 1 day |
| P1-F | Optimistic locking / save conflict | P1 | `api.py` (`save_repair_order`), `apiService.ts`, `RepairOrderDetail.tsx` | 3 hours |
| P1-K | Public token on repair order | P1 | `dw_repair_order.json`, `dw_repair_order.py` | 1 hour |
| P2-G | Customer repair history in SPA | P2 | `api.py` (new endpoint), `RepairOrderForm.tsx`, `apiService.ts` | 4 hours |
| P2-H | "Create Estimate" WhatsApp trigger | P2 | `whatsapp/api.py`, new patch, `api.py` | 4 hours |
| P2-I | Promised date validation | P2 | `dw_repair_order.py`, `api.py`, `RepairOrderForm.tsx` | 1 hour |
| P2-J | Configurable WhatsApp country code | P2 | `setup_general_configuration.py`, `general_configuration.py`, `api.py`, `whatsapp/service.py`, `Settings.tsx` | 3 hours |
| P2-M | Settings change audit log | P2 | `api.py` (3 save functions) | 1 hour |
| P2-empty | Empty order guard | P2 | `api.py`, `dw_repair_order.py` | 30 min |
| P2-pms | PMS divisor plausibility check | P2 | `api.py` (`save_pms_configuration`) | 30 min |
| P2-resend | WhatsApp resend override | P2 | `whatsapp/api.py`, `NotifyCustomerModal.tsx` | 2 hours |
| P3-O | Manual task stability | P3 | `dw_repair_task.json`, `api.py` (sync + save), `AddTaskModal.tsx` | 1 day |
| P3-N | Print format overwrite warning | P3 | `api.py` (`rename_and_sync_print_format`) | 2 hours |
| P3-P | Inbound WhatsApp replies | P3 | new `whatsapp/webhook.py`, `NotifyCustomerModal.tsx` | 3 days |
| P3-Q | Technician workload at assignment | P3 | `api.py` (`get_employees`), `AssignTechnicianModal.tsx` | 2 hours |
| P3-R | Quotation revision tracking | P3 | `dw_repair_order.json`, `dw_repair_order.py`, `api.py`, `RepairOrderDetail.tsx` | 1 day |
| P3-daily | Daily report date range filter | P3 | `DailyReport.tsx` | 2 hours |

**Total P1 estimated effort: ~4 days**  
**Total P2 estimated effort: ~3 days**  
**Total P3 estimated effort: ~6 days**
