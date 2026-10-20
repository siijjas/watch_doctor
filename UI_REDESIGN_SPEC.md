# Watch Doctor v2 — UI/UX redesign spec

> **Generated:** 2026-10-18 · **Branch:** develop
> Prototype (Claude Design canvas, 24 screens, clickable): https://claude.ai/artifact/Mbjmmi94sbVSVnD3mv7n94
> Source: a full read of `frontend/src/` (≈20.6k lines), `watch_doctor/api/`, the DW Repair Order controller, print formats, roles and WhatsApp module.

This document is the hand-off for the rebuild. Part A is what the audit found. Part B is the design. Part C is the build order.

---

## Part A — What the audit found

### A1. Four status vocabularies for one fact
| Where | Values | Who sees it |
|---|---|---|
| `DW Repair Item.status` | Pending, Under Diagnosis, Diagnosed, Create Estimate, Quoted, Approved, In Repair, Completed, Not Repairable, Declined, Delivered | order page badge + workflow `<select>` |
| `DW Repair Item.diagnosis_status` | Pending Diagnosis, Diagnosed, Not Repairable, Awaiting Approval, Quoted, Declined | order page pill; a shadow of the above (`resolve_repair_item_diagnosis_status`) |
| `DW Repair Order.status` | Pending, In Progress, Create Estimate, Awaiting Parts, Repaired, Delivered | list filter, dashboard, WhatsApp template key |
| Tracker `stage` | not_started, workshop, estimate, approval, parts, ready, collected | Order Tracker only |

Plus four unrelated colour maps (`constants.ts`, `RepairOrderList.tsx`, `OrderTracker.tsx`, dashboards) and two priority maps.

### A2. Three list screens that answer the same question
`RepairOrderList` (per order, raw statuses, modified-desc), `OrderTracker` (per watch, stages, next actions, Excel) and the dashboards' "aged pending" (status = Pending only). Header search box is decorative (`Header.tsx:338`), dashboard row clicks search a field the server does not match.

### A3. Order page (`RepairOrderDetail.tsx`, 2,381 lines)
- 12 modal states + 6 for estimate notify; every edit deep-clones and saves the **whole order** (`save_repair_order`).
- `AddTaskModal` is wired but no button opens it. "Add Issue" **replaces all tasks** when recommended work matches templates (1375-1381).
- Completed / Not Repairable / Declined have no buttons; they live in a `<select>` that allows any jump with no confirm. Delivered only via invoicing.
- `CreateInvoiceModal` totals from `quotation_amount || 0` even for "direct from order" → invoice of 0. `finalize_invoice` without `item_indices` marks **every** non-declined watch Delivered.
- `alert()`/`confirm()` ×20, artificial 500 ms sleeps, emoji icons, 20 px photo controls, hover-only affordances, desktop-only dropdown.

### A4. Intake
- Create = `RepairOrderIntakeWizard` (848 lines), Edit = `RepairOrderForm` (1,563 lines). Different field sets, different complaint UI (pills vs checkboxes), different condition UI, free-text DD/MM/YYYY dates in one, native in the other.
- Save errors are console-only (`App.tsx:207`). `intake_checklist` is never rendered. Country code defaults to +91. Duplicate customers are exact-match only. Nothing prints on create.

### A5. POS (`POS.tsx`, 1,676 lines)
- **No PMS UI**: backend returns `is_pms`, frontend drops it; mixing PMS and standard throws only at Pay.
- Discount lives inside the payment modal and is converted to a %, so it drifts. Screen total ignores the tax template.
- Held order edits are silently discarded on Pay (`submit_pos_draft` submits the stored draft).
- No change due, no reprint, auto-print via `window.open` after an await (popup-blocked), emoji icons, hover-only price edit.

### A6. Reports and settings
- 8 reports; R2≈R7, R3≈R8, R4⊂R5, R1⊂Dashboard. Unpaid invoices appear in four places. One monthly report has no print builder. No Excel export on any report. Profit rows are returned to Data Entry users (gating is client-side).
- `Settings.tsx` is 3,458 lines: 18 flat tabs, 13 copy-pasted CRUD sections, no dirty-state guard, `alert()` ×28, no mobile layout.

### A7. Backend facts the UI must respect
- Status resolution (`resolve_repair_item_status`): Delivered sticky → task-driven (any task In Progress ⇒ In Repair; all Completed ⇒ Completed, **even over Not Repairable/Declined**) → manual sticky set → diagnosis-driven → technician assigned ⇒ Under Diagnosis.
- `create_quotation` does **not** move the watch to Quoted. Approval, start and completion are manual hand-offs. Tracker `update_watch_stage` is the right primitive (Exec/Data Entry only).
- Technician row filter is server-side; technicians may edit any field on an accessible order except via `update_repair_item_diagnosis` (own watch only). `create_quotation` / `create_sales_invoice` are unguarded.
- WhatsApp: 100 % manual, keyed by **order** status; no template for Create Estimate; 60-min cooldown throws.
- No public customer page exists; `www/repair.py` serves the staff SPA. `public_token` is generated but unused.
- Bag label is 1.5 × 1 in Jinja via browser print; no barcode/QR yet.

---

## Part B — The design

### B1. Principles
1. **One stage per watch.** Received → Diagnosing → Estimate to send → Waiting customer → In repair (+ Waiting parts flag) → Ready / To return → Collected. Mapping in S2 on the canvas and in `B4` below. Diagnosis status disappears from the UI; order status is shown only as a summary ("In repair · 1 ready").
2. **Role-first home.** Receptionist → Front desk queue (D2 / M4). Owner → Dashboard (D11 / M7). Technician → My bench (M2). The old "Hello, name" header and decorative search are gone; search is the first control on the queue.
3. **Every queue row carries its next action** (message, send estimate, assign, remind, collect). Decisions become one-tap, server-validated transitions (`update_watch_stage` extended with `quote`, `send`, `ready`, `return`, `collect`).
4. **Receptionist sets stages, technicians never do** (owner's decision, Oct 2026). Technician ticks tasks and enters diagnosis; both advance the stage automatically through existing backend rules.
5. **Money flows are explicit.** Estimate (D5) = review prices → quotation → send → record answer. Collect (D6) = pick watches → amount → payment → print, with change due, split, credit, warranty note.
6. **One intake** (D7 / M6) for creating; editing happens on the order page. Native dates, chips for complaints and conditions, camera upload, prints on create, duplicate-phone warning, +973 default.
7. **One design system** (S1): Manrope, cream ground, one accent, 9 stage badges with 4.5:1 contrast, 42/44 px targets, stroke icons, toasts instead of alerts, sheets instead of popovers on phones.

### B2. Screen inventory (24 artboards)
| # | Screen | Replaces | Key behaviours |
|---|---|---|---|
| S1 | Design system | 4 colour maps, 3 table styles | tokens, badges, controls |
| S2 | Stage model | — | mapping table, who moves what, follow-up thresholds |
| D1/M1 | Sign in | LoginPage | role landing, keep signed in |
| D2/M4 | Front desk | OrderTracker + RepairOrderList (open) + aged list | global search incl. collected, stage tiles, attention chips, per-watch rows with next action |
| D3 | Orders | RepairOrderList | per-order history, stage/period/tech/money filters, show-collected toggle, Excel |
| D4/M5 | Order | RepairOrderDetail + 12 modals | per-watch card: stage select (desk), stepper, technician select, complaint chips, photos, diagnosis (read), tasks with **Add task**, parts with stock search inline, waiting-parts flag, note; print menu; right rail customer/dates/money; activity |
| D5 | Estimate | CreateQuotationModal + ViewQuotationModal + estimate notify + workflow select | review & edit prices per task/part, include/exclude watches, type, valid-till, note → quotation → WhatsApp/SMS/skip → Approved / Declined / Changes, advance capture |
| D6 | Collect & invoice | CreateInvoiceModal + PaymentModal + ViewInvoiceModal | select ready watches only, amount from selection, discount here, advance shown, modes incl. Benefit, cash tendered → change, split, credit due date, warranty presets, print/WhatsApp toggles, done state with reprint/PDF/credit note |
| D7/M6 | Intake | Wizard + Form | 3 steps, new customer inline, priority segmented, native dates, brand/model search-or-create, chips by category, photos, "more details" collapsed, on-create prints and optional WhatsApp |
| D8 | Customer | nothing (customers were search-only) | profile, repairs, retail invoices, message log, notes, known watches |
| D9 | POS | POS.tsx main | PMS badges + staff margin note + mixed-cart block, discount on cart, VAT line, qty typed, price editable, change due, held banner, reprint last |
| D10 | POS back office | POS modals | held (edits kept), collect (any unpaid invoice, reference field), returns (per line qty, reason, refund mode defaults to original) |
| D11/M7 | Dashboard | Dashboard + ExecutiveDashboard | period, honest KPIs (collected by delivery date; invoiced vs actually collected), attention list, stage mix, technicians, trend, top complaints, receivables |
| D12/M8 | Reports | 8 reports + DailyReport hub | 4 reports × sub-views, one period control (day/week/month/range, prev/next), Print/Excel/PDF on all |
| D13 | Settings | Settings.tsx | 5 groups, search, unsaved-changes bar, one generic template editor, staff table that links user ↔ technician |
| D14 | WhatsApp centre | Settings WhatsApp tab + DW WhatsApp Log (Desk only) | templates with "sent from" and preview, log with retry, owner summary |
| M2 | My bench | RepairOrderList for technicians | to-do grouped by urgency, done today, scan button |
| M3 | Watch job | WatchCard for technicians | read complaint/photos, enter movement, findings, work needed (→ tasks), tick tasks, parts, "need a part" to desk, no stage control |

### B3. Navigation
- Desktop sidebar: Front desk · Orders · New order · Customers · Point of sale ‖ Dashboard · Reports · Settings. Role-gated the same way as today (`hasRole`).
- Phone tabs: receptionist Desk · New · Today · More; owner Today · Orders · New · Reports; technician My bench · Find · Me.
- Real URLs (`/desk`, `/orders/:name`, `/orders/:name/estimate`, `/orders/:name/collect`, `/intake`, `/customers/:id`, `/pos`, `/pos/desk`, `/dashboard`, `/reports/:report`, `/settings/:section`) so refresh, back and QR deep links work.

### B4. Stage mapping (UI ← backend)
| UI stage | `DW Repair Item.status` | Tracker stage |
|---|---|---|
| Received | Pending | not_started |
| Diagnosing | Under Diagnosis | workshop |
| Estimate to send | Diagnosed, Create Estimate | estimate |
| Waiting customer | Quoted | approval |
| In repair | Approved, In Repair | workshop |
| Waiting parts (flag) | any + `awaiting_parts=1` | parts |
| Ready | Completed | ready |
| To return | Not Repairable, Declined | ready |
| Collected | Delivered / order submitted | collected |

Backwards moves from the desk require a reason and are written to the activity log (`status_changed_on` + a comment).

### B5. Backend changes the design assumes (small)
1. `update_watch_stage` gains actions `quote` (after `create_quotation`, sets Quoted), `ready`, `return` (Not Repairable/Declined with reason), `collect` (invoice flow), and accepts a `reason` for backwards moves.
2. `create_quotation` sets watch status to Quoted when called from the estimate flow.
3. `create_sales_invoice` / `finalize_invoice` always receive explicit `item_names`; amount computed from those items (never `quotation_amount || 0`).
4. Narrow endpoints for the order page: `assign_technician(item)`, `add_task(item, template|name, rate)`, `add_part(item, item_code, qty, task)`, `set_awaiting_parts(item, expected, note)`, `set_internal_note(item, text)` — stop whole-document saves from the UI.
5. `sync_item_tasks_with_auto_sources` must not drop tasks with manual edits (already true) and must not re-add removed ones; Add Issue must append, not replace.
6. Task-driven override should not drag Not Repairable/Declined back to In Repair.
7. WhatsApp: add keys `reminder_uncollected` and an estimate-sent key per watch; map `ready_for_collection` to the **watch** stage; return cooldown as a soft warning, not an exception; expose the log to the SPA.
8. POS: expose `is_pms` and `get_pms_info` to the cart; apply discount as an amount; `submit_pos_draft` must accept the current cart; add `last_receipt` reprint; PMS mix check before Pay.
9. Reports: four endpoints (`workshop`, `sales_purchases`, `cash_bank`, `profit_loss`) each taking `from_date, to_date`; profit gated server-side; Excel export server-side or via the existing `exportExcel.ts`.
10. Bag label: add a QR with the order's deep link (`/orders/<name>`); scan in the Find screens via the browser camera. No public page unless decided later (`public_token` would back it).
11. Permissions: guard `create_quotation` / `create_sales_invoice` with `require_roles(executive, data_entry)`; technician `save_repair_order` limited to own watches' diagnosis/tasks/parts.

### B6. Component kit to build (frontend)
`AppShell` (sidebar/tabs by role), `StageBadge`, `StageStrip`, `StageSelect` (desk only), `QueueRow`, `SearchField` (debounced, digit-normalised), `Chips` (single/multi), `Segmented`, `Toggle`, `Sheet` (bottom sheet ≤640 px, popover above), `Toast` (global), `ConfirmSheet` (money/delete only), `DataTable` (one style, overflow-x), `MoneyInput` (3 dp), `DatePicker` (native), `PhotoRow` (camera capture), `PaymentModes` (single/split/credit, shared by D6, D9, D10), `TemplateCrud` (generic settings editor), `PeriodControl` (reports).

---

## Part C — Build order

| Phase | Scope | Done when |
|---|---|---|
| 0 | Tokens + component kit, router with URLs, role landing, global toast. Old screens untouched. | Storybook-style page renders every component; `/desk` route exists. |
| 1 | Front desk (D2/M4), Orders (D3), Order page (D4/M5) with narrow endpoints, My bench + Watch job (M2/M3). Remove Order Tracker and RepairOrderList. | Receptionist runs a day without the old list screens. |
| 2 | Intake (D7/M6) with prints on create and QR label; Estimate (D5); Collect (D6). Remove Form, Wizard, 5 money modals. | A watch can go intake → estimate → approval → collect without Desk. |
| 3 | POS (D9/D10) with PMS UI and kept held edits; Customer (D8). | PMS sale prints the right format without a backend error. |
| 4 | Dashboard (D11/M7), Reports (D12/M8) on four endpoints, Settings (D13) + WhatsApp centre (D14). Delete the 8 report components and the 3,458-line settings file. | Owner reads everything from the SPA; no Desk tabs for printing. |
| 5 | Phone polish: install prompt, scan QR to open an order, offline retry for POS, large-text mode for the bench. | — |

Each phase ships behind the existing role checks so the old screen stays until its replacement is live.

### Phase 0 status (done 2026-10-18)
- **Tokens:** `frontend/src/design/tokens.css` (CSS variables, stage badge tones, `.dw-root` scope) and Tailwind `dw-*` colours. Manrope loads in `index.html` but only applies inside `.dw-root`, so old screens look unchanged.
- **Stage model:** `frontend/src/design/stages.ts`, the single mapping from backend status to UI stage, plus backward-move detection, stage-to-status for the desk select, and the order summary line.
- **Component kit:** `frontend/src/design/kit/` holds every B6 component, plus Button, Field, inputs, Card, EmptyState, Icon and UnsavedBar. Gallery at `/repair/kit`.
- **Router:** `frontend/src/router.tsx` with no new dependency. Routes `/desk`, `/bench`, `/orders`, `/orders/:name`, `/intake`, `/pos`, `/dashboard`, `/reports`, `/settings` and `/kit` render the existing screens until their phase ships. Frappe serves sub-URLs via `website_route_rules` in `hooks.py`.
- **Role landing:** owner goes to `/dashboard`, receptionist to `/desk` (the Order Tracker for now), technician to `/bench`. Defined in `frontend/src/design/nav.ts`.
- **Global toast:** `ToastProvider` wraps the app; new code calls `useToast()` instead of `alert()`.
- `AppShell` is built and used by the gallery only. Phase 1 moves screens into it and retires the old Sidebar and Header.


### Phase 1 status (done 2026-10-19, uncommitted)
- **Screens** (`frontend/src/screens/`), all inside `AppShell`; the old Sidebar, Header, `OrderTracker.tsx` and `RepairOrderList.tsx` are deleted.
  - `FrontDesk.tsx` (`/desk`, D2/M4): per-watch queue from `get_order_tracker`, search incl. collected, attention chips, stage tiles, "what to tell the customer", next action per row (assign, send estimate, record answer, part arrived, collect, return), Excel and print.
  - `OrdersScreen.tsx` (`/orders`, D3): `list_order_history` with stage, period, technician and money filters, show-collected toggle, 50 per page, Excel of every match. Technicians see it as "Find", scoped to their watches.
  - `OrderScreen.tsx` (`/orders/:name`, D4/M5): one card per watch (stage select, stepper, technician, complaints, photos, diagnosis, tasks, parts with stock search, parts hold, note), rail with customer, dates (promised, priority, tag edited in place), money, activity. Estimate, invoice, payment and WhatsApp still open the existing windows until Phase 2. After an estimate is made, a sheet offers WhatsApp or "told another way", both moving the watch to Waiting customer.
  - `Bench.tsx` (`/bench`, M2) and `WatchJob.tsx` (`/orders/:name/watch/:item`, M3): diagnosis saves as you tap, ticks locked before approval, "Need a part" flags the desk. A technician opening an order with one of their watches lands on that job (QR-ready).
  - `/orders/:name/classic` keeps the old order page reachable for one more phase.
- **Backend**: `api/jobs.py` (order context, bench, `assign_technician`, `add_task`, `set_task_status`, `remove_task`, `add_part`, `remove_part`, `set_awaiting_parts`, `set_internal_note`, `set_watch_issues`, `update_order_details`), `tracker.set_watch_stage` (desk stage select with reason, refuses moves the rules would undo, logs to activity), `orders.list_order_history`.
- **Controller fixes** (`dw_repair_order.py`): Not Repairable / Declined no longer pulled back by task ticks (B5.6); task rows keep their names across saves, so `DW Repair Part Used.task` links stop breaking (375 of 426 were already broken); issue-suggested tasks read the stored `all_issues`; a part only starts its task in the save that adds it.
- Still for Phase 2: B5.1 `collect`, B5.2 server-side, B5.3, B5.7–B5.11.

### Phase 2 status (done 2026-10-19, uncommitted)
- **Intake** (`screens/Intake.tsx`, `/intake`, D7/M6): customer search that ignores spaces, +973 and leading zeros (`api/intake.find_customers`); new customer inline with +973 default and a live duplicate-number check (`check_phone`, `create_customer` refuses a number another customer has); priority, received/promised dates, tag; watches via the shared `screens/shared/WatchForm.tsx` (brand/model search-or-create, complaint chips, condition chips by category, camera photos, more details); review; prints bag label and drop-off receipt on create (windows opened inside the click so pop-up blockers allow them); optional WhatsApp "order received". Draft kept in localStorage.
- **Estimate** (`screens/EstimateScreen.tsx`, `/orders/:name/estimate`, D5): per-watch price review with editable task and part prices (`set_task_rate`, `set_part_line`, saved on the order so the invoice matches), add work/parts, include or leave out each watch, type, valid until, note → `create_estimate` (quotation for exactly the chosen watches) → print/PDF, WhatsApp preview and send or "told them" (moves to Waiting customer) → Approved / Declined / Wants changes.
- **Collect** (`screens/CollectScreen.tsx`, `/orders/:name/collect`, D6): tick the ready watches, amount from those watches only, discount in BHD or %, VAT and totals from `preview_collect` (the real draft invoice, rolled back), warranty note chips, `PaymentModes` (single with change due, split, credit), print, optional WhatsApp thank-you → `collect_watches` creates and submits the invoice in one request and marks only those watches collected. Return-only orders close without an invoice.
- **Order page**: estimate and collect open the new screens; "Order details" (customer, received date), "Edit details" per watch and "Add another watch" replace the old edit form; invoice sheet with reprint, PDF and note.
- **Bag label**: `DW RO Bag Label` now carries a QR code of the staff link `/repair/orders/<name>` (`watch_doctor/print_helpers.py`, registered as a Jinja method in `hooks.py`); local mobile number, smaller order number so it fits 1.5 × 1 in.
- **Backend fixes**: `create_quotation` / `create_sales_invoice` require desk roles (B5.11); `create_quotation` takes item names, valid-till and a note; adding a part no longer starts the repair before the customer approves.
- **Removed**: `RepairOrderIntakeWizard`, `RepairOrderForm`, `RepairOrderDetail` (classic view), the quotation/invoice/payment/price windows and the 15 other components only they used, plus `constants.ts` and `mockData.ts`. 35 files.
- Not done: email of estimate/invoice (the old windows had it), advance payments at approval, quotation coverage per watch (Quotation has no `remarks` column, so the old coverage note was never saved).

### Phase 3 status (done 2026-10-19, uncommitted)
- **Point of sale** (`screens/pos/PosScreen.tsx`, `/pos`, D9): scan or type, Enter adds the first match; category chips from item groups in stock; PMS badges; the cart's subtotal, discount, VAT and total come from `till_preview` (the real draft invoice, rolled back), so the screen total is what the invoice charges; staff-only PMS cost / margin / VAT-on-margin per line; a PMS + standard mix is blocked before Pay; discount in BHD stays an amount (`discount_amount`), or %; price and quantity editable; single (change due), split, credit (needs a named customer); auto-print opens inside the click; customer search by number or name with quick add (+973).
- **Back office** (`screens/pos/PosBackOffice.tsx`, `/pos/held`, `/pos/collect`, `/pos/returns`, D10): held sales with items and who held them, resume keeps edits (`till_charge` charges the cart on screen and deletes the draft; `till_hold` updates the same draft), delete with confirm; collect on any unpaid invoice with a reference; returns per line with refund defaulting to the original payment mode. "Reprint last" on every POS tab (`till_last_receipt`).
- **Customers** (`screens/CustomerScreen.tsx`, `/customers`, `/customers/:name`, D8): list (search or most recent), profile with repairs, retail invoices, WhatsApp messages, watches we know, repairs billed / retail / outstanding, staff note (Customer `customer_details`), edit contact with duplicate-number check. Linked from the order page.
- **Backend**: `api/till.py`, `api/customers.py`; `api/pos.build_pos_invoice` shared by checkout, preview and hold; `get_pos_drafts` no longer lists repair invoice drafts as held sales (7 of 11 "held" drafts were repair drafts).
- **Removed**: `components/POS.tsx` (1,676 lines) and the two UI pieces only it used.
- Verified: a PMS sale submits and prints `PMS Invoice` with VAT on the margin and no standard tax rows.

### Phase 4 status (done 2026-10-19, uncommitted)
- **Dashboard** (`screens/DashboardScreen.tsx`, `/dashboard`, D11/M7) on `api/owner.get_overview`: watches received, collected (by the date handed over, not the order's last edit), invoiced after returns split repairs / retail / B2B / returns (same split as the Sales report), money actually taken by mode, received → collected average and median, the desk's follow-up counts (each links to that front desk filter), unpaid over 30 days, workshop stage mix (palette checked with the dataviz validator), technicians open / finished, received vs collected per day with a table view, top complaints, money owed with age.
- **Reports** (`screens/ReportsScreen.tsx`, `/reports/:report`, D12/M8): Workshop, Sales & purchases, Cash & bank, Profit & loss (owner only, server-side) on `api/reports.py`, each `(from_date, to_date)`; the money ones reuse the existing builders (`monthly_*_report.build_*`), so their figures keep their meaning. One period control (day / week / month / range, prev / next). Every report prints (also PDF from the print dialog) and exports to Excel from the same blocks shown on screen.
- **Settings** (`screens/settings/SettingsScreen.tsx`, `/settings/:section`, D13): five groups with search; shop details and logo, invoice series and print formats, PMS, payment modes and POS profiles, one generic list editor for complaints, conditions, findings, work, movements, calibers, services, brands, models, technicians (now with their login), sales people and country codes (`api/setup_lists.py`, allow-listed fields, renames follow links, in-use records cannot be deleted); unsaved-changes bar on forms.
- **WhatsApp centre** (`screens/settings/WhatsAppCentre.tsx`, `/settings/whatsapp`, D14): templates with placeholder chips and preview, message log (new), owner summary with today's text and send-now.
- **Removed**: `Dashboard.tsx`, `ExecutiveDashboard.tsx`, `DailyReport.tsx`, the 8 report components and their shared modules, `printReport.ts` (the desk list print moved to `screens/desk/printQueue.ts`), `Settings.tsx` (3,458 lines), and the UI pieces only they used. App bundle 1,155 KB → 563 KB. Type check has no errors.
- Left in place (unused by the SPA now, harmless): `api/dashboard.py`, `api/pos.get_daily_report`; chart.js / react-chartjs-2 in package.json.

### Phase 5 status (done 2026-10-19, uncommitted)
- **Install to home screen**: `frontend/public/manifest.json` (start `/repair/`, standalone, icons in `frontend/public/icons/`), Apple touch icon and meta tags in `index.html`, and a service worker served at `/repair_sw.js` (`www/repair_sw.py` + `www/repair_sw.js`, scope `/repair/`). It caches the hashed bundle files and keeps the last app page so the app still opens with no connection; API calls are never cached. `design/pwa.ts` registers it and catches the browser's install offer. Phones show a one-time banner ("Install" on Android, "Share → Add to Home Screen" on iPhone, "Not now" hides it for good on that device); the More sheet also has "Install the app".
- **Scan to open an order** (`screens/shared/ScanSheet.tsx`): Scan button on the bench header, scan icon in the front desk and orders search. Reads the bag-label QR with the camera where the browser can (BarcodeDetector, Chrome on Android); otherwise it explains that the phone's camera app opens the label link directly and takes the tag or order number typed in. Order links and 8-digit numbers open the order; anything else searches orders.
- **Offline retry for POS** (`screens/pos/pendingSales.ts`): every Charge carries a client reference; `till_charge(client_ref)` returns the invoice already made for that reference (`replayed: 1`) instead of charging twice. If the request never reaches the server, the sale is kept on that till (localStorage), the cart clears for the next customer, and a banner lists waiting sales with "Try now"; they resend when the browser comes back online and every 20 s. A sale the server refuses stays in the list with the reason and "Back to the cart" / "Discard".
- **Larger text**: "Larger text" switch in the More sheet and an "Aa" button on the bench header; scales the page content by 15 % on that device (navigation stays the same size). Checked at 390 px on bench, job, front desk, orders, order, POS, customer and dashboard with no sideways scroll (bench header now wraps; segmented controls scroll if they still cannot fit).
- Needs `bench restart` and `bench --site site2-dwy clear-cache` for `/repair_sw.js` and the `client_ref` change.
- 2026-10-20 owner feedback on POS: payment modes moved out of the cart into a payment sheet opened by "Pay BHD …", so the button is always in view; the staff-only PMS cost / margin line and the PMS info box were removed from the cart (the PMS badge and the mixed-invoice block stay).
