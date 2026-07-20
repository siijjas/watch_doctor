# Desk bug: clicking a row in DW Repair Order's Items grid does nothing

Status: **root cause confirmed, fix not yet implemented.** Spun off from the
investigation noted in `API_PY_AUDIT.md` ("the DW Repair Order Items grid in
Desk doesn't open a row for editing at all when clicked").

## Symptom

In Desk, open any `DW Repair Order`, click a row in the **Items** grid
(child table `DW Repair Item`). Nothing happens — no dialog, no expanded
row-form, no visible error to the user.

## Root cause

`DW Repair Item.issues` is a `Table` field (options: `DW Repair Item Issue`)
that is nested **two levels** below the root document:

```
DW Repair Order -> items (DW Repair Item) -> issues (DW Repair Item Issue)
```

Browser console shows the actual crash when a row is clicked:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'permlevel')
    at Object.get_field_display_status (perm.js:204:11)
    at oo.refresh (grid.js:422:38)
    at frappe.ui.form.ControlTable.refresh_input (table.js:141:13)
    at frappe.ui.form.ControlTable.refresh (base_control.js:140:9)
    at Object.attach_doc_and_docfields (layout.js:497:59)
    at Object.refresh (layout.js:359:8)
    at io.render (grid_row_form.js:26:15)
    at ii.show_form (grid_row.js:1384:18)
    at ii.toggle_view (grid_row.js:1366:9)
```

When Desk opens a grid row it builds a `GridRowForm` → `Layout` containing a
control for every field on `DW Repair Item`, including a nested `ControlTable`
for `issues`. That nested table's own `Grid` instance ends up with an
undefined `df` by the time `grid.refresh()` runs, so
`frappe.perm.get_field_display_status()` throws. The exception fires inside
`show_form()` *before* the code reaches `this.row.toggle(false)`
(grid_row.js), so the original collapsed row is never hidden and no form is
ever shown — from the user's point of view, the click just does nothing.

This reproduces for **every** row, because every `DW Repair Item` row has
this same nested `issues` field in its layout — it's not data-dependent.

## Why the field is there, and why it's doubly broken

Per `API_PY_AUDIT.md`'s item 6 write-up (2026-07-09), this is a known,
pre-existing, deliberately-deferred finding, independent of that refactor:

- `Document.get_all_children()` only walks **one level** of child tables from
  the root document. `items[].issues` is a *grandchild* table, so it is
  **never actually persisted** by a plain `doc.save()` — confirmed true even
  in the original, unmodified `save_repair_order` code, before any of today's
  changes. After a save + reload, `item.issues` comes back empty and
  `issue_description` stays `None`.
- The field survives only **in-memory**, within a single save cycle, because
  `_flatten_pending_nested_child_rows()` (`dw_repair_order.py`) explicitly
  calls `item.set("issues", resolved_item_issues)` so that
  `get_auto_task_services_for_item()` (`dw_repair_order.py:269`,
  `item.get("issues")`) can resolve `DW Issue Template.suggested_task` during
  that same save. It is never meant to be a real, durable data store.
- The **actual, persisted, working** issue data lives in the flat
  `all_issues` table on `DW Repair Order` itself (hidden field, keyed by
  `repair_item_key` = `str(item.idx)`) — this is what the SPA
  (`watch_doctor/api/orders.py`), WhatsApp templates (`whatsapp/service.py`),
  and quotation/task logic actually read.
- `dw_repair_item.py`'s `validate()` also reads `self.issues` directly to
  build `issue_description` — same in-memory-only caveat applies there too.

So `items[].issues` is redundant with `all_issues`, never durably persisted,
and — as of this investigation — **also crashes Desk's native row editor**
merely by existing in the child doctype's field list (regardless of whether
it's hidden; Frappe builds a control/grid for every field in a grid row form
irrespective of the `hidden` flag, so setting `"hidden": 1` alone would
**not** avoid the crash — the field must actually be removed from
`DW Repair Item`'s `fields`/`field_order` to stop Desk from building a nested
`ControlTable` for it at all).

## What needs to change

1. Remove the `issues` (Table) field from
   `watch_doctor/repair_management/doctype/dw_repair_item/dw_repair_item.json`
   (`fields` array and the stray `field_order` entry — note `field_order`
   also still lists two other already-nonexistent fields, `tasks` and
   `parts_used`, left over from an earlier cleanup; worth removing in the
   same pass).
2. Update `get_auto_task_services_for_item()`
   (`dw_repair_order.py:243`) to read `item.flags.get("pending_issues")`
   instead of `item.get("issues")` for the `suggested_task` lookup, so it no
   longer depends on the doomed field. Need to double check call ordering in
   `_run_save_pipeline()` (`dw_repair_order.py:650`) — `sync_item_tasks_with_auto_sources`
   (which calls this) runs after `_flatten_pending_nested_child_rows`, so
   `item.flags.pending_issues` should already be populated by then for the
   SPA path; for the **Desk path** (no flags set — Desk users currently type
   directly into `items[].issues`), this lookup would need a different
   source now that the field is gone (see open question below).
3. Update `dw_repair_item.py`'s `validate()` (reads `self.issues` to build
   `issue_description`) to stop referencing the removed field. Likely should
   instead be computed from `all_issues` filtered by `repair_item_key`,
   probably as a step in `_run_save_pipeline()` on the parent (the child's
   own `validate()` can't easily see sibling children on the parent anyway).
4. Decide replacement Desk UX for viewing/editing issues per item, now that
   the only-ever-broken inline editor is gone. Options discussed but not yet
   decided:
   - **Read-only display**: show that item's issues as read-only text
     (sourced from `all_issues`) on the item row; Desk becomes view-only for
     issues, SPA remains the place to edit them.
   - **Un-hide `all_issues`** directly on the Repair Order form so Desk users
     have *some* native editing path, keying rows by `repair_item_key`
     (= item's row number) manually.
   - **Fix the crash only, for now**: just remove the field to stop the
     crash and keep the pipeline working: no replacement UX in this pass,
     revisit issue-editing UX for Desk separately later.

## Files involved

- `watch_doctor/repair_management/doctype/dw_repair_item/dw_repair_item.json`
- `watch_doctor/repair_management/doctype/dw_repair_item/dw_repair_item.py`
- `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`
  (`get_auto_task_services_for_item`, `_flatten_pending_nested_child_rows`,
  `_run_save_pipeline`)
- `API_PY_AUDIT.md` (existing write-up of the persistence half of this bug)
