"""
Inventory & Stock Deduction Helpers for Repair Order Workflow

This module provides utilities for:
1. Converting Repair Order parts into Stock Entry items
2. Validating part availability before invoice submission
3. Tracking stock deductions through GL entries
4. Ensuring transactional consistency for inventory
"""

import frappe
from frappe.utils import flt
from typing import Dict, List, Tuple


def is_negative_stock_allowed(company: str = "") -> bool:
    """Return True when negative stock is enabled for the company or globally."""

    company_name = (company or "").strip() or (frappe.db.get_single_value("Global Defaults", "default_company") or "")

    if company_name:
        try:
            company_meta = frappe.get_meta("Company")
            if company_meta.get_field("allow_negative_stock"):
                return bool(flt(frappe.db.get_value("Company", company_name, "allow_negative_stock") or 0))
        except Exception:
            pass

    return bool(flt(frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0))


def get_item_valuation_rate(item_code: str, warehouse: str = "") -> float:
    """
    Get the current valuation rate for an item (COGS basis).
    
    Priority:
    1. Bin.valuation_rate for specific warehouse (if provided)
    2. Item.valuation_rate (from standard valuation method)
    3. Item.standard_rate (fallback)
    
    Args:
        item_code: Item code to query
        warehouse: Warehouse to check (optional; if empty, uses first available)
    
    Returns:
        float: Valuation rate, defaults to standard_rate if not found
    """
    valuation_rate = 0.0
    
    # 1. Try Bin valuation_rate for specific warehouse
    if warehouse:
        valuation_rate = flt(frappe.db.get_value(
            "Bin",
            {"item_code": item_code, "warehouse": warehouse},
            "valuation_rate"
        ))
    
    # 2. If not found, try Item valuation_rate
    if not valuation_rate:
        valuation_rate = flt(frappe.db.get_value("Item", item_code, "valuation_rate"))
    
    # 3. Fallback to standard rate
    if not valuation_rate:
        valuation_rate = flt(frappe.db.get_value("Item", item_code, "standard_rate"))
    
    return valuation_rate


def get_item_stock_balance(item_code: str, warehouse: str = "") -> float:
    """
    Get the available (actual) quantity of an item in stock.
    
    Args:
        item_code: Item code to check
        warehouse: Specific warehouse (optional; sums all if empty)
    
    Returns:
        float: Available quantity, 0 if item not found or out of stock
    """
    if not item_code:
        return 0.0
    
    if warehouse:
        qty = frappe.db.get_value(
            "Bin",
            {"item_code": item_code, "warehouse": warehouse},
            "actual_qty"
        )
        return flt(qty)
    else:
        # Sum across all warehouses
        result = frappe.db.sql(
            """
            SELECT SUM(actual_qty) as total_qty
            FROM `tabBin`
            WHERE item_code = %s AND actual_qty > 0
            """,
            (item_code,),
            as_dict=True
        )
        return flt(result[0].total_qty) if result and result[0].total_qty else 0.0


def validate_parts_stock_availability(repair_order, warehouse: str = "", company: str = "") -> Dict:
    """
    Validate that all parts in a repair order have sufficient stock.
    
    Args:
        repair_order: DW Repair Order document
        warehouse: Warehouse to check against (optional; checks all if empty)
        company: Company name for checking allow-negative-stock settings
    
    Returns:
        dict: Empty if all parts available, otherwise maps part code to:
              {
                  "item_name": str,
                  "qty_required": float,
                  "qty_available": float,
                  "shortage": float,
                  "valuation_rate": float
              }
    """
    if is_negative_stock_allowed(company=company):
        return {}

    shortage_map = {}
    
    for part in repair_order.all_parts or []:
        if not part.part or not part.quantity:
            continue
        
        part_code = part.part
        qty_required = flt(part.quantity)
        qty_available = get_item_stock_balance(part_code, warehouse)
        valuation_rate = get_item_valuation_rate(part_code, warehouse)
        
        if qty_available < qty_required:
            item_name = frappe.db.get_value("Item", part_code, "item_name")
            shortage_map[part_code] = {
                "item_name": item_name,
                "qty_required": qty_required,
                "qty_available": qty_available,
                "shortage": qty_required - qty_available,
                "valuation_rate": valuation_rate
            }
    
    return shortage_map


def get_repair_order_parts_as_si_items(repair_order, item_idx: int = None) -> List[Dict]:
    """
    Convert DW Repair Part Used records into Sales Invoice item dicts.
    
    Each part becomes a separate line item with:
    - item_code: from DW Repair Part Used.part
    - qty: from DW Repair Part Used.quantity
    - rate: manual override or Item.standard_rate
    - uom: from Item.stock_uom
    
    Args:
        repair_order: DW Repair Order document
        item_idx: Optional; if provided, only returns parts for that repair item (1-based)
    
    Returns:
        List of dicts, each ready to be appended to Sales Invoice.items
    """
    si_items = []
    
    for part in repair_order.all_parts or []:
        if not part.part or not part.quantity:
            continue
        
        # Filter by item_idx if specified
        if item_idx is not None and flt(part.repair_item_key) != item_idx:
            continue
        
        part_code = part.part
        qty = flt(part.quantity)
        
        # Determine effective rate
        if part.rate:
            rate = flt(part.rate)
        else:
            rate = flt(frappe.db.get_value("Item", part_code, "standard_rate") or 0)
        
        # Get UOM from Item master
        uom = frappe.db.get_value("Item", part_code, "stock_uom") or "Nos"
        
        si_items.append({
            "item_code": part_code,
            "qty": qty,
            "rate": rate,
            "uom": uom,
            # The following will be auto-populated by SI on insert:
            # "warehouse": set_warehouse or company default
            # "amount": qty * rate
            # "valuation_rate": from Bin (used by Stock Entry)
        })
    
    return si_items


def create_stock_entry_for_parts(
    repair_order_name: str,
    warehouse: str = "",
    stock_entry_name: str = None
) -> str:
    """
    Manually create a Stock Entry (Material Issue) for parts used in a repair.
    
    TYPICALLY: This is auto-created by ERPNext when Sales Invoice with stock items
    is submitted with update_stock=1. Use this only for exceptional cases.
    
    Args:
        repair_order_name: Name of DW Repair Order
        warehouse: Warehouse to issue from (optional; uses default if empty)
        stock_entry_name: Name for the Stock Entry (optional; auto-generated if empty)
    
    Returns:
        str: Name of created Stock Entry (submitted)
    """
    from frappe.model.document import Document
    
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)

    # Guard: skip if there are no parts to issue.
    parts = [p for p in (repair_order.all_parts or []) if p.part and flt(p.quantity)]
    if not parts:
        frappe.logger().info(f"No parts to issue for Repair Order {repair_order_name}, skipping Stock Entry.")
        return None

    if not warehouse:
        warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse") or ""
    
    if not warehouse:
        frappe.throw("No warehouse specified and no default warehouse configured. Cannot create Stock Entry.")
    
    # Create Stock Entry
    stock_entry = frappe.new_doc("Stock Entry")
    stock_entry.stock_entry_type = "Material Issue"
    stock_entry.purpose = "Material Issue"
    stock_entry.posting_date = frappe.utils.nowdate()
    stock_entry.company = frappe.db.get_value("Warehouse", warehouse, "company") or frappe.db.get_default("company")
    stock_entry.from_warehouse = warehouse
    stock_entry.reference_doctype = "DW Repair Order"
    stock_entry.reference_name = repair_order_name
    
    # Add parts as Stock Entry items
    for part in parts:
        if not part.part or not part.quantity:
            continue
        
        se_item = stock_entry.append("items", {})
        se_item.item_code = part.part
        se_item.qty = flt(part.quantity)
        se_item.s_warehouse = warehouse
        se_item.t_warehouse = ""  # Issuing (no target warehouse)
        # valuation_rate will be auto-filled from Bin
    
    # Save and submit
    stock_entry.insert(ignore_permissions=True)
    stock_entry.submit()
    frappe.db.commit()
    
    frappe.logger().info(f"Created Stock Entry {stock_entry.name} for Repair Order {repair_order_name}")
    
    return stock_entry.name


def get_stock_entry_for_repair_order(repair_order_name: str) -> str:
    """
    Get the Stock Entry (Material Issue) linked to a Repair Order via its Sales Invoice.
    
    Args:
        repair_order_name: Name of DW Repair Order
    
    Returns:
        str: Stock Entry name, or None if not found
    """
    repair_order = frappe.db.get_value(
        "DW Repair Order",
        repair_order_name,
        ["sales_invoice", "stock_entry_for_parts"]
    )
    
    if not repair_order:
        return None
    
    sales_invoice_name, stock_entry_name = repair_order
    
    # 1. Check if stock_entry_for_parts field is already populated
    if stock_entry_name:
        return stock_entry_name
    
    # 2. Try to find Stock Entry via Sales Invoice reference
    if sales_invoice_name:
        stock_entry = frappe.db.get_value(
            "Stock Entry",
            {
                "reference_doctype": "Sales Invoice",
                "reference_name": sales_invoice_name,
                "docstatus": 1
            },
            "name"
        )
        if stock_entry:
            # Update the field for future reference
            frappe.db.set_value(
                "DW Repair Order",
                repair_order_name,
                "stock_entry_for_parts",
                stock_entry,
                update_modified=False
            )
            return stock_entry
    
    return None


def reconcile_repair_parts_to_stock_ledger(repair_order_name: str) -> Dict:
    """
    Audit function: Compare DW Repair Part Used quantities to Stock Ledger entries.
    
    Returns dict with:
    - "reconciled": bool (all parts accounted for)
    - "parts": list of {part_code, qty_in_repair, qty_in_stock_ledger, variance}
    - "issues": list of discrepancies found
    """
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    sales_invoice = None
    stock_entry = None
    
    if repair_order.sales_invoice:
        sales_invoice = frappe.db.get_value(
            "Sales Invoice",
            repair_order.sales_invoice,
            "name"
        )
    
    if sales_invoice:
        stock_entry = frappe.db.get_value(
            "Stock Entry",
            {
                "reference_doctype": "Sales Invoice",
                "reference_name": sales_invoice,
                "docstatus": 1
            },
            "name"
        )
    
    reconciliation = {
        "repair_order": repair_order_name,
        "sales_invoice": sales_invoice,
        "stock_entry": stock_entry,
        "reconciled": True,
        "parts": [],
        "issues": []
    }
    
    # Map parts from repair order
    parts_map = {}
    for part in repair_order.all_parts or []:
        if part.part not in parts_map:
            parts_map[part.part] = 0
        parts_map[part.part] += flt(part.quantity)
    
    # Check each part against Stock Ledger
    for part_code, qty_in_repair in parts_map.items():
        qty_in_stock_ledger = 0
        
        if stock_entry:
            # Sum quantities from Stock Ledger for this repair's Stock Entry
            sle_rows = frappe.db.sql(
                """
                SELECT SUM(ABS(qty_after_transaction)) as total
                FROM `tabStock Ledger Entry`
                WHERE item_code = %s
                  AND voucher_type = 'Stock Entry'
                  AND voucher_no = %s
                """,
                (part_code, stock_entry),
                as_dict=True
            )
            qty_in_stock_ledger = flt(sle_rows[0].total) if sle_rows and sle_rows[0].total else 0
        
        variance = qty_in_repair - qty_in_stock_ledger
        
        reconciliation["parts"].append({
            "item_code": part_code,
            "qty_in_repair": qty_in_repair,
            "qty_in_stock_ledger": qty_in_stock_ledger,
            "variance": variance
        })
        
        if variance != 0:
            reconciliation["reconciled"] = False
            reconciliation["issues"].append(
                f"{part_code}: repair qty={qty_in_repair}, stock ledger qty={qty_in_stock_ledger}, variance={variance}"
            )
    
    return reconciliation
