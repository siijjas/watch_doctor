# Comprehensive Inventory & Service Workflow Audit Report
**Watch Doctor Repair Management**

**Audit Date:** May 6, 2026  
**Scope:** Repair Order → Inventory deduction workflow  
**Version:** Based on codebase state at commit analysis  

---

## Executive Summary

The Watch Doctor repair management system has **critical gaps in inventory management**:

1. ⚠️ **CRITICAL: Parts are Never Deducted from Stock**
   - Parts added to repair orders are NOT converted to Stock Entry line items
   - Parts remain in custom `DW Repair Part Used` table only
   - Inventory levels are never updated when repairs are completed

2. ⚠️ **CRITICAL: Sales Invoice Doesn't Include Parts as Items**
   - Sales Invoice created with single generic "REPAIR-SERVICE" line item
   - Parts cost bundled into service rate, not itemized
   - Therefore, ERPNext cannot auto-create Stock Entries for parts

3. ⚠️ **HIGH: No Stock Ledger Entries for Parts**
   - No GL entries recording consumption of parts from inventory
   - No valuation impact on finished goods or work-in-progress
   - Stock counts become unreliable

4. ⚠️ **HIGH: Pricing Inconsistency**
   - Manual part rate overrides use sales price, not valuation rate
   - Stock reduction (if it existed) would use wrong cost basis
   - GL entries would have incorrect amounts

5. ⚠️ **MEDIUM: No Transactional Integrity Controls**
   - Repair Order submission doesn't trigger Stock Entry creation
   - No locks preventing over-allocation of parts with limited stock
   - Partial invoice scenarios have no inventory rollback

---

## 1. Root Cause Analysis

### 1.1 Architecture Decision: Service-First Invoicing

The system treats a repair as a **service** (labor + parts), not a **product sale**:

```
Repair Order
├── DW Repair Item (watch)
├── DW Repair Task (labor - NOT in inventory)
└── DW Repair Part Used (parts - IN inventory BUT disconnected)

↓ (create_sales_invoice)

Sales Invoice
└── ONE Item: "REPAIR-SERVICE" (qty=1, rate=tasks_cost + parts_cost)
    (Parts are bundled into rate, NOT itemized)

↓ (on_submit, ERPNext's update_stock)

Stock Entry (NOT CREATED - no parts in SI items)
↓
Stock Ledger (NO ENTRIES for parts)
```

### 1.2 Why This Is Wrong

Standard ERPNext workflow for inventory consumption:

```
Stock Issue Entry (Material Request → Stock Entry)
OR
Sales Invoice with stock_item=1, update_stock=1
    ├─ Creates Stock Entry (Issue)
    ├─ Updates Bin.actual_qty
    ├─ Creates Stock Ledger Entry
    └─ Updates Item valuation
```

Watch Doctor's workflow:

```
Sales Invoice with ONE non-stock service item
    └─ No Stock Entry created (no stock items in SI)
    └─ No Bin updates
    └─ No Stock Ledger
    └─ Inventory unaffected ❌
```

### 1.3 Code Evidence

**File:** `dw_repair_order.py:get_or_create_service_item()` (line ~520)

```python
service_item = frappe.new_doc("Item")
service_item.item_code = item_code
service_item.item_name = "Repair Service"
service_item.item_group = "Services"
service_item.stock_uom = "Nos"
service_item.is_stock_item = 0  # ← NOT a stock item!
service_item.is_sales_item = 1
```

**File:** `dw_repair_order.py:create_sales_invoice()` (line ~650)

```python
# Add all items from quotation (which only has the REPAIR-SERVICE item)
for q_item in quotation.items:
    invoice_item = invoice.append("items", {})
    invoice_item.item_code = q_item.item_code  # Always "REPAIR-SERVICE"
    invoice_item.qty = q_item.qty               # Always 1
    invoice_item.rate = q_item.rate             # Bundled cost

# Parts exist in repair_order.all_parts but are NEVER added to invoice items!
```

---

## 2. Detailed Findings

### 2.1 Finding #1: Parts Table Data Flow Disconnection

| Stage | Status |
|-------|--------|
| **Create Repair Order** | ✅ Parts added to `DW Repair Part Used` table |
| **Calculate Pricing** | ✅ `amount = qty × effective_rate` calculated |
| **Quotation Generation** | ✅ Parts cost summed into service rate |
| **Invoice Generation** | ❌ Parts NEVER added as line items |
| **Stock Entry Creation** | ❌ Not triggered (no stock items) |
| **Stock Ledger** | ❌ No entries created |
| **Bin Updates** | ❌ Stock balances unchanged |

**Impact:** Parts inventory is invisible to ERPNext Inventory module.

---

### 2.2 Finding #2: Sales Invoice Structure Defect

**Current Implementation:**

```
Sales Invoice
├── Item: "REPAIR-SERVICE"
│   ├── qty: 1
│   ├── rate: $500 (= labor $300 + parts $200)
│   └── is_stock_item: No ← Blocks Stock Entry creation
└── No other items
```

**What Should Happen:**

```
Sales Invoice
├── Item: "REPAIR-SERVICE" (labor)
│   ├── qty: 1
│   ├── rate: $300
│   └── is_stock_item: No
├── Item: "BATTERY" (part)
│   ├── qty: 2
│   ├── rate: $50 each
│   ├── amount: $100
│   └── is_stock_item: Yes ← Triggers Stock Entry
├── Item: "CRYSTAL" (part)
│   ├── qty: 1
│   ├── rate: $100
│   └── is_stock_item: Yes ← Triggers Stock Entry
└── Stock Entry auto-created on submit
    ├── Type: Material Issue
    ├── Items: BATTERY (qty -2), CRYSTAL (qty -1)
    └── Updates Bin and Stock Ledger
```

---

### 2.3 Finding #3: Pricing Inconsistency - Sales vs. Valuation

**Code Location:** `dw_repair_part_used.py:validate()` (line ~20)

```python
def validate(self):
    if self.part and not self.auto_rate:
        item_rate = frappe.get_cached_value("Item", self.part, "standard_rate")
        if item_rate:
            self.auto_rate = item_rate
    
    effective_rate = self.rate if self.rate else (self.auto_rate or 0)
    self.amount = (self.quantity or 0) * effective_rate
```

**Issue:** 
- `standard_rate` used for sales price estimation ✅
- **BUT** no reference to `valuation_rate` (FIFO/Weighted Average cost basis)
- When/if Stock Entries are created, they should use `valuation_rate`, not `standard_rate`

**Example Impact:**
```
Item: "BATTERY"
├── standard_rate: $60 (sales price)
├── valuation_rate: $30 (COGS via FIFO)
└── Part overridden with manual rate: $55

If Stock Entry is created:
- GL Debit (Stock Expense): $55 × qty ← WRONG (should be $30)
- Variance: $25 × qty unrecorded
```

---

### 2.4 Finding #4: No Transactional Consistency

**Scenario: Partial Invoice Submission Fails**

```
1. Repair Order submitted → Status: Delivered
2. Sales Invoice created (draft)
3. User submits SI, but post-date validation fails
4. SI remains draft, but Repair Order is already submitted
5. Stock is NOT reserved or deducted
6. Parts can be used by another order → OVER-ALLOCATION
```

**Current Code:** No locks or rollback logic in `finalize_invoice()`.

**File:** `dw_repair_order.py:finalize_invoice()` (line ~900)

```python
def finalize_invoice(repair_order_name, invoice_name, ...):
    # ... no try/except around invoice.submit()
    if invoice.docstatus == 0:
        invoice.submit()  # Can fail silently or throw uncaught exception
    # ... rest of code executes regardless
```

---

### 2.5 Finding #5: No Stock Reservation

**Issue:** Parts can be added to multiple repairs without stock check.

**Example:**
```
Bin: "BATTERY" in "Warehouse 1"
├── actual_qty: 5
└── reserved_qty: 0

Repair Order 1 adds: 3 batteries → reserved_qty should be 3
Repair Order 2 adds: 3 batteries → reserved_qty should be 6
                    (5 in stock, but 6 reserved = OVERSOLD)
```

**Current Code:** No Material Request or Stock Reservation created.

---

## 3. Impact Assessment

### 3.1 Business Risks

| Risk | Severity | Impact |
|------|----------|--------|
| Stock Counts Unreliable | CRITICAL | Cannot trust inventory for reordering, audits, or financial reporting |
| Over-Allocation of Parts | CRITICAL | Risk of promising repairs you can't complete |
| GL Inaccuracy | HIGH | Inventory GL balance ≠ physical counts, audit failures |
| Valuation Variance | HIGH | COGS doesn't match actual consumption; profit margin wrong |
| No Audit Trail | HIGH | Cannot trace part usage from repair order to stock ledger |

### 3.2 Compliance & Audit Issues

- **Financial Controls:** Stock movements not recorded → SOX/COSO failures
- **Inventory Audits:** Physical counts don't match GL → Investigation required
- **Tax Compliance:** COGS calculation incorrect if using sales prices instead of valuation rates

---

## 4. Solution: Production-Ready Fixes

### 4.1 FIX #1: Convert Sales Invoice to Multi-Item Structure

**Objective:** Include parts as separate line items so ERPNext auto-creates Stock Entries.

**Changes Required:**

#### A. Modify `create_sales_invoice()` function

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

Replace:
```python
# Current: Single service item with bundled cost
invoice_item = invoice.append("items", {})
invoice_item.item_code = service_item_code
invoice_item.qty = 1
invoice_item.rate = watch_total  # Includes parts cost
```

With:
```python
# NEW: Add service item for labor only
invoice_item = invoice.append("items", {})
invoice_item.item_code = service_item_code
invoice_item.qty = 1
invoice_item.rate = tasks_cost  # Labor only, NOT parts
invoice_item.uom = "Nos"

# NEW: Add each part as separate invoice item
for part in item_parts:
    if part.part and part.quantity:
        invoice_part = invoice.append("items", {})
        invoice_part.item_code = part.part
        invoice_part.qty = part.quantity
        invoice_part.rate = part.rate if part.rate else (frappe.db.get_value("Item", part.part, "standard_rate") or 0)
        invoice_part.uom = frappe.db.get_value("Item", part.part, "stock_uom") or "Nos"
        # ERPNext will auto-set warehouse and calculate amount
```

**Benefits:**
- ✅ Parts appear in Sales Invoice items
- ✅ Parts set `is_stock_item=1` (from Item master)
- ✅ Sales Invoice submission auto-creates Stock Entry
- ✅ Stock Ledger entries created automatically
- ✅ Bin balances updated

#### B. Update `create_quotation()` Similarly

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

Replace:
```python
# Current: One service item with bundled cost
quotation_item.rate = watch_total  # Includes parts
```

With:
```python
# Keep service item for labor
quotation_item.rate = tasks_cost  # Labor only

# Add part items separately
for part in item_parts:
    if part.part and part.quantity:
        part_item = quotation.append("items", {})
        part_item.item_code = part.part
        part_item.qty = part.quantity
        part_item.rate = part.rate if part.rate else (frappe.db.get_value("Item", part.part, "standard_rate") or 0)
        part_item.uom = frappe.db.get_value("Item", part.part, "stock_uom") or "Nos"
```

---

### 4.2 FIX #2: Use Valuation Rate for Stock Movements

**Objective:** Ensure Stock Entries use COGS basis (valuation_rate), not sales price.

**Implementation:**

#### A. Create Helper Function

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

```python
def get_item_valuation_rate(item_code: str, warehouse: str = "") -> float:
    """
    Get the current valuation rate for an item.
    
    Priority:
    1. Bin.valuation_rate for specific warehouse (if provided)
    2. Item.valuation_rate (standard method average)
    
    Returns float, defaults to standard_rate if valuation rate is 0.
    """
    from frappe.utils import flt
    
    valuation_rate = 0.0
    
    if warehouse:
        valuation_rate = flt(frappe.db.get_value(
            "Bin",
            {"item_code": item_code, "warehouse": warehouse},
            "valuation_rate"
        ))
    
    if not valuation_rate:
        valuation_rate = flt(frappe.db.get_value("Item", item_code, "valuation_rate"))
    
    if not valuation_rate:
        # Fallback to standard rate if valuation rate is not set
        valuation_rate = flt(frappe.db.get_value("Item", item_code, "standard_rate"))
    
    return valuation_rate
```

#### B. Add Comments to Clarify Pricing

**In `create_sales_invoice()`:**

```python
for part in item_parts:
    if part.part and part.quantity:
        invoice_part = invoice.append("items", {})
        invoice_part.item_code = part.part
        invoice_part.qty = part.quantity
        
        # Use sales price for customer invoice (not valuation rate)
        # Valuation will be handled by Stock Entry on submit
        selling_rate = part.rate if part.rate else \
                      (frappe.db.get_value("Item", part.part, "standard_rate") or 0)
        
        invoice_part.rate = selling_rate
        # NOTE: When this SI is submitted with update_stock=1,
        # ERPNext will create Stock Entry using item's current valuation_rate,
        # NOT the selling_rate. This is correct behavior.
```

---

### 4.3 FIX #3: Add Stock Reservation Check

**Objective:** Validate that stock is available before allowing Repair Order finalization.

**Implementation:**

#### A. Create Validation Function

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

```python
def validate_parts_stock_availability(repair_order: Document, warehouse: str = ""):
    """
    Check if all parts in the repair order have sufficient stock.
    Throws validation error if any part is over-allocated.
    
    Args:
        repair_order: DW Repair Order document
        warehouse: Warehouse to check (optional; checks all warehouses if empty)
    
    Returns: dict with summary {part: [qty_required, qty_available]}
    """
    from frappe.utils import flt
    
    shortage_map = {}
    
    for part in repair_order.all_parts or []:
        if not part.part or not part.quantity:
            continue
        
        part_code = part.part
        qty_required = flt(part.quantity)
        
        # Get available quantity
        if warehouse:
            qty_available = flt(frappe.db.get_value(
                "Bin",
                {"item_code": part_code, "warehouse": warehouse},
                "actual_qty"
            ))
        else:
            # Sum across all warehouses
            bin_rows = frappe.db.sql("""
                SELECT SUM(actual_qty) as total_qty
                FROM `tabBin`
                WHERE item_code = %s
            """, (part_code,), as_dict=True)
            qty_available = flt(bin_rows[0].total_qty) if bin_rows and bin_rows[0].total_qty else 0
        
        if qty_available < qty_required:
            item_name = frappe.db.get_value("Item", part_code, "item_name")
            shortage_map[part_code] = {
                "item_name": item_name,
                "qty_required": qty_required,
                "qty_available": qty_available,
                "shortage": qty_required - qty_available
            }
    
    return shortage_map


@frappe.whitelist()
def check_parts_availability(repair_order_name: str, warehouse: str = ""):
    """
    Whitelist endpoint to check parts availability before invoicing.
    Returns:
    - empty dict if all parts available
    - dict of shortages with detail if any part is short
    """
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    return validate_parts_stock_availability(repair_order, warehouse)
```

#### B. Call Validation in `finalize_invoice()`

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

```python
@frappe.whitelist()
def finalize_invoice(repair_order_name, invoice_name, discount=0, payment_mode="Cash", mark_as_delivered=True):
    """..."""
    import json
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
    
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    
    # NEW: Check stock availability
    shortage_map = validate_parts_stock_availability(repair_order, warehouse=invoice.set_warehouse)
    if shortage_map:
        shortage_details = "\n".join([
            f"  {shortage['item_name']} ({k}): Need {shortage['qty_required']}, Have {shortage['qty_available']}"
            for k, shortage in shortage_map.items()
        ])
        frappe.throw(
            f"Insufficient stock for repair order {repair_order_name}:\n{shortage_details}\n"
            "Please procure parts before finalizing invoice."
        )
    
    # ... rest of function unchanged
```

---

### 4.4 FIX #4: Improve Transactional Safety

**Objective:** Ensure Stock Entry creation doesn't fail silently.

**Implementation:**

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

```python
@frappe.whitelist()
def finalize_invoice(repair_order_name, invoice_name, discount=0, payment_mode="Cash", mark_as_delivered=True):
    """..."""
    
    # ... existing code ...
    
    # IMPROVED: Safe invoice submission with error handling
    try:
        if invoice.docstatus == 0:
            invoice.submit()
            frappe.logger().info(f"Sales Invoice {invoice.name} submitted successfully")
    except Exception as e:
        frappe.logger().error(f"Error submitting Sales Invoice {invoice.name}: {str(e)}")
        # Rollback any partial changes
        frappe.db.rollback()
        frappe.throw(
            f"Failed to submit Sales Invoice: {str(e)}\n"
            "Stock Entry may not have been created. "
            "Please review and resubmit manually."
        )
    
    # IMPROVED: Verify Stock Entry was created
    try:
        stock_entries = frappe.get_all(
            "Stock Entry",
            filters={
                "reference_doctype": "Sales Invoice",
                "reference_name": invoice.name,
                "docstatus": 1
            },
            pluck="name"
        )
        if not stock_entries:
            frappe.logger().warning(
                f"Stock Entry not created for Sales Invoice {invoice.name}. "
                f"Items may not be stock items (is_stock_item=0)."
            )
    except Exception:
        pass
    
    # ... rest of function ...
```

---

### 4.5 FIX #5: Document Coupling  - Link to Stock Entry

**Objective:** Audit trail connecting Repair Order → Sales Invoice → Stock Entry.

**Implementation:**

#### A. Add Linking Fields to DW Repair Order

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.json`

```json
{
  "fieldname": "stock_entry_for_parts",
  "fieldtype": "Link",
  "label": "Stock Entry (Parts Issue)",
  "options": "Stock Entry",
  "read_only": 1,
  "help": "Auto-populated when Sales Invoice is submitted with stock items"
}
```

#### B. Populate on Invoice Submit

**File:** `watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py`

```python
# In finalize_invoice(), after invoice.submit():

stock_entry = frappe.db.get_value(
    "Stock Entry",
    {"reference_doctype": "Sales Invoice", "reference_name": invoice.name, "docstatus": 1},
    "name"
)

if stock_entry:
    repair_order.db_set("stock_entry_for_parts", stock_entry, update_modified=False)
```

---

## 5. Testing Strategy

### 5.1 Unit Test: Multi-Item Invoice Generation

**File:** `watch_doctor/test_repair_item_workflow.py` (new test)

```python
def test_sales_invoice_includes_parts_as_items():
    """Verify parts are added as separate line items to Sales Invoice."""
    # 1. Create Repair Order with parts
    ro = create_repair_order_with_parts(
        parts=[
            {"item_code": "BATTERY", "qty": 2, "rate": 50},
            {"item_code": "CRYSTAL", "qty": 1, "rate": 100},
        ]
    )
    
    # 2. Create Sales Invoice
    si = create_sales_invoice(ro.name, source_type="order")
    si_doc = frappe.get_doc("Sales Invoice", si["invoice_name"])
    
    # 3. Assertions
    assert len(si_doc.items) == 3, f"Expected 3 items (1 service + 2 parts), got {len(si_doc.items)}"
    
    service_items = [item for item in si_doc.items if item.item_code == "REPAIR-SERVICE"]
    part_items = [item for item in si_doc.items if item.item_code in ["BATTERY", "CRYSTAL"]]
    
    assert len(service_items) == 1
    assert len(part_items) == 2
    
    battery_item = next(i for i in part_items if i.item_code == "BATTERY")
    assert battery_item.qty == 2
    assert battery_item.rate == 50
    
    print("✅ Test passed: Parts included as separate line items")
```

### 5.2 Integration Test: Stock Ledger Entry Creation

**File:** `watch_doctor/test_repair_item_workflow.py` (new test)

```python
def test_stock_entry_created_on_invoice_submit():
    """Verify Stock Entry is created and Stock Ledger updated."""
    # 1. Setup initial stock
    create_stock_entry(
        item_code="BATTERY",
        warehouse="Main Warehouse",
        qty=10,
        entry_type="Material Receipt"
    )
    
    # Get initial balance
    initial_bin = frappe.db.get_value(
        "Bin",
        {"item_code": "BATTERY", "warehouse": "Main Warehouse"},
        "actual_qty"
    )
    assert initial_bin == 10
    
    # 2. Create Repair Order with BATTERY part
    ro = create_repair_order_with_parts(
        parts=[{"item_code": "BATTERY", "qty": 3, "rate": 50}]
    )
    
    # 3. Create and submit Sales Invoice
    si = create_sales_invoice(ro.name, source_type="order")
    si_doc = frappe.get_doc("Sales Invoice", si["invoice_name"])
    si_doc.submit()
    
    # 4. Verify Stock Entry created
    stock_entries = frappe.get_all(
        "Stock Entry",
        filters={
            "reference_doctype": "Sales Invoice",
            "reference_name": si["invoice_name"],
            "docstatus": 1
        }
    )
    assert len(stock_entries) > 0, "Stock Entry not created for Sales Invoice with stock items"
    
    # 5. Verify Bin updated
    final_bin = frappe.db.get_value(
        "Bin",
        {"item_code": "BATTERY", "warehouse": "Main Warehouse"},
        "actual_qty"
    )
    assert final_bin == 7, f"Expected Bin balance 7 (10-3), got {final_bin}"
    
    # 6. Verify Stock Ledger Entry
    sle_rows = frappe.get_all(
        "Stock Ledger Entry",
        filters={
            "item_code": "BATTERY",
            "warehouse": "Main Warehouse",
            "voucher_type": "Stock Entry",
            "voucher_no": stock_entries[0]["name"]
        }
    )
    assert len(sle_rows) > 0, "Stock Ledger Entry not created"
    
    print("✅ Test passed: Stock Entry and Ledger created correctly")
```

### 5.3 Scenario Test: Part Shortage Warning

**File:** `watch_doctor/test_repair_item_workflow.py` (new test)

```python
def test_part_shortage_check_before_invoice_finalization():
    """Verify warning when insufficient stock."""
    # 1. Setup: Only 2 units of BATTERY in stock
    create_stock_entry(
        item_code="BATTERY",
        warehouse="Main Warehouse",
        qty=2,
        entry_type="Material Receipt"
    )
    
    # 2. Create Repair Order requesting 3 units of BATTERY
    ro = create_repair_order_with_parts(
        parts=[{"item_code": "BATTERY", "qty": 3, "rate": 50}]
    )
    
    # 3. Check availability
    shortage = check_parts_availability(ro.name, warehouse="Main Warehouse")
    
    # 4. Assertions
    assert "BATTERY" in shortage, "Should report BATTERY shortage"
    assert shortage["BATTERY"]["shortage"] == 1, "Should show shortage of 1 unit"
    
    # 5. Verify finalize_invoice throws error
    si = create_sales_invoice(ro.name)
    with pytest.raises(frappe.ValidationError) as excinfo:
        finalize_invoice(ro.name, si["invoice_name"])
    
    assert "Insufficient stock" in str(excinfo.value)
    print("✅ Test passed: Shortage check blocks invoice finalization")
```

---

## 6. Migration & Rollout

### 6.1 Database Migration (Patch)

**File:** `watch_doctor/patches/add_stock_entry_link_to_repair_order.py`

```python
"""
Migrate DW Repair Order to add stock_entry_for_parts link field.
Also document existing Sales Invoices and their Stock Entries.
"""

import frappe
from frappe.model.utils import rename_field


def execute():
    # Step 1: Add new field to doctype
    if not frappe.db.has_column("tabDW Repair Order", "stock_entry_for_parts"):
        frappe.db.add_column("tabDW Repair Order", "stock_entry_for_parts", "Link")
        frappe.db.commit()
    
    # Step 2: Retroactively link existing Stock Entries to Repair Orders
    # (if Sales Invoice was already linked)
    sales_invoices = frappe.get_all(
        "Sales Invoice",
        filters={"docstatus": 1, "reference_doctype": "DW Repair Order"},
        fields=["name", "reference_name"]
    )
    
    for si_row in sales_invoices:
        stock_entry = frappe.db.get_value(
            "Stock Entry",
            {"reference_doctype": "Sales Invoice", "reference_name": si_row.name, "docstatus": 1},
            "name"
        )
        
        if stock_entry and si_row.reference_name:
            frappe.db.set_value(
                "DW Repair Order",
                si_row.reference_name,
                "stock_entry_for_parts",
                stock_entry
            )
    
    frappe.db.commit()
    print("✅ Migration complete: stock_entry_for_parts field added and populated")


if __name__ == "__main__":
    execute()
```

### 6.2 Phased Rollout Plan

| Phase | Action | Risk |
|-------|--------|------|
| **Phase 1** | Deploy FIX #1 (multi-item invoices) on dev/staging | LOW - backward compatible |
| **Phase 2** | Run comprehensive tests on staging | MEDIUM - identify edge cases |
| **Phase 3** | Enable FIX #2-#5 on staging | MEDIUM - changes invoice structure |
| **Phase 4** | Run data migration (patch) on production (backup first!) | HIGH - alters invoice generation |
| **Phase 5** | Monitor for 1 week; verify Stock Ledger accuracy | HIGH - critical flow change |
| **Phase 6** | Communicate to team; update documentation | LOW - operational |

### 6.3 Rollback Plan

If issues found in Phase 5:

1. Revert code to previous version
2. Set `update_stock=0` on newly created Sales Invoices (manual fix)
3. Delete manually-created Stock Entries (if erroneous)
4. Revert Repair Order submissions if needed
5. Run post-mortem on what failed

---

## 7. Configuration Checklist

### 7.1 Pre-Requisites for Production

- [ ] All parts (items in `DW Repair Part Used`) must have `is_stock_item=1` in Item master
- [ ] All parts must have valid warehouse assignments
- [ ] Valuation method configured (FIFO/Weighted Avg/Manual) on Item master
- [ ] Default warehouse set on Sales Invoice or Repair Order for parts deduction
- [ ] Stock Ledger entries configured for GL mapping (via Accounting > Stock Ledger Account)
- [ ] Bin creation enabled (usually default)
- [ ] Material Receipt Stock Entries already created for initial quantities

### 7.2 Configuration Items to Verify

**Item Master for Each Part:**
```
Item Code: BATTERY
├── item_group: "Parts & Accessories"
├── is_stock_item: 1 ✅
├── stock_uom: "Nos"
├── valuation_rate: [auto-calculated]
├── standard_rate: $60
├── warehouse: "Main Warehouse" (if specific)
└── track_qty: 1 ✅
```

**Company > Accounting > Stock Settings:**
```
├── Stock Entry on Transfer: Yes
├── Create Material Request: Yes
├── Stock UOM: "Nos"
└── Default Warehouse: "Main Warehouse"
```

---

## 8. Documentation & Communication

### 8.1 User Guide Update

**Add to Admin Manual:**

> **Inventory Management for Repairs**
>
> When you create a Sales Invoice for a repair order with parts, Watch Doctor now:
> 1. Lists parts as separate line items (e.g., "BATTERY qty 2 @ $50")
> 2. Creates a Stock Entry (Material Issue) on invoice submission
> 3. Updates your Bin balances and Stock Ledger automatically
>
> **What you need to do:**
> - Ensure all parts have `is_stock_item=1` configured in Item master
> - Verify warehouse is set on the Sales Invoice
> - Run Stock Reconciliation monthly to reconcile physical vs. system counts
>
> **Before finalizing invoice:**
> - System checks if you have enough stock
> - If parts are short, you'll see a warning before submitting
> - Procure missing parts or adjust quantities before proceeding
>

### 8.2 API Documentation Update

**New Endpoint:**

```
POST /api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.check_parts_availability

Parameters:
  - repair_order_name: "2504.0001"
  - warehouse: "Main Warehouse" (optional)

Response:
  // Empty if all parts available
  {
    "BATTERY": {
      "item_name": "Renata Battery",
      "qty_required": 3,
      "qty_available": 2,
      "shortage": 1
    }
  }
```

---

## 9. Summary of Changes

| Change | File | Lines | Impact |
|--------|------|-------|--------|
| Multi-item invoice generation | dw_repair_order.py | create_sales_invoice() | CRITICAL - Changes invoice structure |
| Quotation multi-item update | dw_repair_order.py | create_quotation() | MEDIUM - Improves consistency |
| Stock availability check | dw_repair_order.py | validate_parts_stock_availability() | HIGH - Blocks over-allocation |
| Transactional safety | dw_repair_order.py | finalize_invoice() | MEDIUM - Error handling |
| Stock Entry linking | dw_repair_order.json | new field | LOW - Audit trail |
| Data migration patch | patches/add_stock_entry_link.py | new file | ONE-TIME - Backward link |
| Unit & integration tests | test_repair_item_workflow.py | new tests | LOW - Validation |

---

## 10. Conclusion & Recommendations

### Summary

Watch Doctor has a **critical inventory management gap**: repair parts are never deducted from stock. The root cause is that the system treats repairs as a single bundled "service" line item, preventing ERPNext from creating Stock Entries.

### Recommended Actions (Priority Order)

1. **IMMEDIATE (This Sprint):**
   - ✅ Implement FIX #1 & #5 (multi-item invoicing + linking)
   - ✅ Deploy tests to catch regressions
   - ✅ Roll out to staging

2. **NEXT SPRINT:**
   - ✅ Implement FIX #3 & #4 (stock checks + safety)
   - ✅ Conduct UAT with operations team
   - ✅ Prepare rollout plan

3. **PRODUCTION (Phased Rollout):**
   - ✅ Phase 1-3: Deploy and test
   - ✅ Phase 4: Run migration patch (with backup)
   - ✅ Phase 5: Monitor for 1 week
   - ✅ Phase 6: Team communication + documentation

4. **ONGOING:**
   - ✅ Monthly Stock Reconciliation
   - ✅ Reconcile GL to Stock Ledger
   - ✅ Audit repair cost accuracy

---

**Prepared by:** ERPNext Inventory Auditor  
**Date:** May 6, 2026  
**Classification:** Production Audit - High Priority

