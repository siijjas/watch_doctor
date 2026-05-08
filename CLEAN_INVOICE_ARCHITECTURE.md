# Clean Invoice Architecture — Quotation & Sales Invoice Creation

> **Module:** Repair Management  
> **File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`  
> **Last Updated:** 2026-05-08

---

## Overview

The Repair Management module generates **customer-facing quotations and invoices** that display only clean, consolidated service lines (e.g. _"Repair - Rolex Submariner"_). All spare parts, internal pricing, and markup are hidden from the customer copy while maintaining 100% accurate inventory deduction and COGS tracking.

This is achieved through the **Cost-Bundled Service Line with Zero-Rate Internal Parts** architecture.

---

## Core Concept

For each watch in a repair order, we create:

1. **One visible service line** — carries the full customer price (`tasks + parts`) under a generic `REPAIR-SERVICE` item code, named _"Repair - {Brand} {Model}"_
2. **Zero or more internal part lines** — the actual stock items at `rate = 0`, flagged with `dw_is_internal_line = 1`

The internal part lines exist **only** for stock deduction via ERPNext's Stock Ledger Entries (SLEs). They are:
- Hidden from print formats via the `dw_is_internal_line` flag
- Excluded from daily report queries
- Zero-rated so they don't inflate `grand_total`

---

## Data Model

### Custom Field: `dw_is_internal_line`

| Property | Value |
|----------|-------|
| Doctypes | `Sales Invoice Item`, `Quotation Item` |
| Field Type | Check (int, 0/1) |
| Default | `0` |
| Print Hide | Yes |
| Purpose | Identifies zero-rate part lines that should be hidden from customer-facing documents |

### Service Item: `REPAIR-SERVICE`

A non-stock, sales-only item created automatically by `get_or_create_service_item()`. It has no price list entry — its rate is always set programmatically.

---

## Quotation Creation Flow

**Entry point:** `create_quotation(repair_order_name, quotation_type, watch_indices)`

```
┌──────────────────────────────────────────────────────────────────┐
│  For each watch in the repair order:                             │
│                                                                  │
│  1. Calculate tasks_cost = Σ task.rate (or template default)     │
│                                                                  │
│  2. Calculate parts_cost = Σ (part.quantity × part_rate)         │
│     where part_rate = part.rate if set, else Item.standard_rate  │
│                                                                  │
│  3. customer_total = tasks_cost + parts_cost                     │
│                                                                  │
│  4. Append service line:                                         │
│     ├── item_code:  REPAIR-SERVICE                               │
│     ├── item_name:  "Repair - {Brand} {Model}"                   │
│     ├── rate:       customer_total                                │
│     └── dw_is_internal_line: 0                                   │
│                                                                  │
│  5. For each spare part, append internal line:                   │
│     ├── item_code:           {actual stock item}                 │
│     ├── rate:                0                                   │
│     ├── price_list_rate:     0                                   │
│     ├── discount_percentage: 0                                   │
│     └── dw_is_internal_line: 1                                   │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
              quotation.insert(ignore_permissions=True)
                            │
                            ▼
                 _zero_internal_lines(quotation)
                  ── forces rate=0 on all internal
                  ── lines AFTER ERPNext's pricing
                  ── hooks have run, then save()
                            │
                            ▼
                    quotation.submit()
                            │
                            ▼
              Link quotation to repair order
              Set repair_order.quotation_amount
```

### Part Rate Resolution

The part rate used for bundling follows this precedence:

```python
part_rate = flt(part.rate) if part.rate else flt(
    frappe.db.get_value("Item", part.part, "standard_rate") or 0
)
```

| `DW Repair Part Used.rate` | Result | Source |
|---------------------------|--------|--------|
| `> 0` (manually set via Update Prices) | Use that value | Technician override |
| `0` or empty | Use `Item.standard_rate` | Master data fallback |

> **Note:** `auto_rate` on the child table is a display-only field showing the standard rate. The `rate` field is what gets used — it's what the operator sets via the "Update Prices" modal.

---

## Sales Invoice Creation Flow

**Entry point:** `create_sales_invoice(repair_order_name, source_type, payment_type, amount)`

There are two paths:

### Path A: From Quotation (`source_type = "quotation"`)

```
┌──────────────────────────────────────────────────────────────┐
│  Copy all items from linked quotation verbatim:              │
│                                                              │
│  for q_item in quotation.items:                              │
│    invoice_item.item_code    = q_item.item_code              │
│    invoice_item.item_name    = q_item.item_name              │
│    invoice_item.description  = q_item.description            │
│    invoice_item.qty          = q_item.qty                    │
│    invoice_item.rate         = q_item.rate                   │
│    invoice_item.uom          = q_item.uom                   │
│    invoice_item.dw_is_internal_line = q_item.dw_is_internal_line │
└──────────────────────────────────────────────────────────────┘
```

### Path B: Direct from Repair Order (`source_type = "order"`)

Same bundling logic as quotation creation — builds service lines and zero-rate internal part lines from the repair order's tasks and parts.

### Both Paths Then:

```
              invoice.insert(ignore_permissions=True)
                            │
                            ▼
                 _zero_internal_lines(invoice)
                            │
                            ▼
              Handle partial payments (if applicable)
              Link invoice to repair order
```

---

## The ERPNext Price Override Problem

### Problem

When `insert()` is called, ERPNext triggers `set_missing_values()` → `set_price_list_and_item_details()`, which:

1. Looks up each item's `price_list_rate` from the selling price list
2. Overwrites the `rate` field with the fetched price
3. Recalculates `amount`, `net_rate`, `net_amount`, etc.

This means our explicitly set `rate = 0` gets replaced with the item's selling price (e.g. BHD 1.000 for a battery).

### Solution: `_zero_internal_lines(doc)`

Called **after** `insert()` to force all internal lines back to zero:

```python
def _zero_internal_lines(doc):
    needs_save = False
    for item in doc.items:
        if item.dw_is_internal_line:
            item.price_list_rate = 0
            item.discount_percentage = 0
            item.rate = 0
            item.amount = 0
            item.net_rate = 0
            item.net_amount = 0
            item.base_rate = 0
            item.base_amount = 0
            item.base_net_rate = 0
            item.base_net_amount = 0
            item.base_price_list_rate = 0
            needs_save = True

    if needs_save:
        doc.save(ignore_permissions=True)
```

The `save()` call lets ERPNext recalculate document-level totals (`total`, `grand_total`, `net_total`) correctly — reflecting only the service line amounts.

---

## Print Format Filtering

Both `dw_watch_invoice.json` and `dw_watch_quotation.json` use the same Jinja filter:

```jinja
{% for row in doc.items %}
  {%- if not row.dw_is_internal_line -%}
    {# render visible row #}
  {% endif %}
{% endfor %}
```

This replaces the old `frappe.db.get_value("Item", row.item_code, "is_stock_item")` check which was:
- **Fragile** — relied on the Item master's stock flag rather than explicit marking
- **Slow** — executed a DB query per row during print rendering

---

## Daily Report Query Guards

Four SQL queries in `api.py` are protected with:

```sql
AND IFNULL(dw_is_internal_line, 0) = 0
```

| Query | Purpose | Without Guard |
|-------|---------|---------------|
| `items_sold` | Items sold breakdown | Zero-rate parts would appear as "sold" items |
| `category_breakdown` | Sales by category | Part categories would show inflated unit counts |
| `item_group_profit_summary` | Profit by item group | Zero-rate parts would create phantom COGS entries |
| `item_profit_summary` | Profit by item | Individual parts would show as zero-revenue sales |

---


## Key Functions Reference

| Function | Location | Purpose |
|----------|----------|---------|
| `create_quotation()` | Line ~397 | Creates quotation with bundled service lines |
| `create_sales_invoice()` | Line ~616 | Creates invoice (from quotation or direct) |
| `_zero_internal_lines()` | Line ~558 | Post-insert rate correction for ERPNext price override |
| `get_or_create_service_item()` | Line ~539 | Ensures `REPAIR-SERVICE` item exists |

---

## Migration

**Patch:** `watch_doctor.patches.add_internal_line_field`

Creates the `dw_is_internal_line` custom field on `Sales Invoice Item` and `Quotation Item` using `frappe.custom.doctype.custom_field.custom_field.create_custom_fields()`.
