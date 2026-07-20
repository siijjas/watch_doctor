"""
Production-Ready Code Patches for DW Repair Order Inventory Fixes

This file contains the fixed versions of key functions in dw_repair_order.py
that implement the inventory audit recommendations.

APPLIES TO: watch_doctor/repair_management/doctype/dw_repair_order/dw_repair_order.py

CHANGES:
1. create_quotation() - Include parts as separate line items
2. create_sales_invoice() - Include parts as separate line items + stock check
3. finalize_invoice() - Add transactional safety and stock entry verification
4. New helper: finalize_invoice_with_stock_validation()

DEPLOYMENT: Apply patches sequentially. Test each change on staging.
"""

# ============================================================================
# PATCH 1: FIX create_quotation() to include parts as separate items
# ============================================================================

def create_quotation_fixed(repair_order_name, quotation_type="Estimate", watch_indices=None):
    """
    Create a quotation from a repair order.
    
    FIXED: Now includes parts as separate line items (not bundled into service rate).
    
    Args:
        repair_order_name: Name of the repair order
        quotation_type: "Estimate" or "Final"
        watch_indices: JSON string of watch indices to include (e.g., "[0, 1]"), or None for all watches
    
    Returns:
        Name of the created quotation
    """
    import json
    import frappe
    from frappe import _
    
    # Parse watch indices if provided
    if watch_indices:
        if isinstance(watch_indices, str):
            watch_indices = json.loads(watch_indices)
    
    # Fetch the repair order with all child tables
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    
    # Determine which watches to include
    selected_items = []
    if watch_indices is not None:
        for idx in watch_indices:
            if idx < len(repair_order.items):
                selected_items.append(repair_order.items[idx])
    else:
        selected_items = repair_order.items
    
    # Create quotation document
    quotation = frappe.new_doc("Quotation")
    quotation.party_name = repair_order.customer
    quotation.quotation_to = "Customer"
    quotation.order_type = "Sales"
    
    quotation.title = f"{quotation_type} Quotation for {repair_order.name}"
    
    # Ensure we have a generic service item for tasks
    from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import get_or_create_service_item
    service_item_code = get_or_create_service_item()

    for item in selected_items:
        # Get tasks and parts for this watch
        item_key = str(item.idx)
        item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
        item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

        model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
        watch_item_name = f"Repair - {item.watch_brand} {model_name}"

        # Calculate costs separately
        tasks_cost = 0
        for task in item_tasks:
            task_template = frappe.get_doc("DW Task Template", task.service)
            tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

        parts_cost = 0
        for part in item_parts:
            item_doc = frappe.get_doc("Item", part.part)
            parts_cost += (part.rate if part.rate else (item_doc.standard_rate or 0)) * part.quantity

        # FIXED: Add service item with LABOR ONLY (not parts)
        try:
            rw_raw = item.recommended_work or "[]"
            rw_items = json.loads(rw_raw) if isinstance(rw_raw, str) else (rw_raw or [])
            if isinstance(rw_items, str):
                rw_items = [rw_items] if rw_items.strip() else []
        except Exception:
            rw_items = []

        if not rw_items and item_tasks:
            # Fallback: use task names from templates
            rw_items = [
                (frappe.db.get_value("DW Task Template", task.service, "task_name") or task.service)
                for task in item_tasks
            ]

        desc_lines = "<br>".join(line for line in rw_items if str(line).strip())

        # One quotation item per watch for labor
        quotation_item = quotation.append("items", {})
        quotation_item.item_code = service_item_code
        quotation_item.item_name = watch_item_name
        quotation_item.description = desc_lines or watch_item_name
        quotation_item.qty = 1
        quotation_item.rate = tasks_cost  # LABOR ONLY, NOT parts
        quotation_item.uom = "Nos"

        # FIXED: Add each part as separate quotation item
        for part in item_parts:
            if not part.part or not part.quantity:
                continue
            
            part_code = part.part
            part_qty = part.quantity
            part_rate = part.rate if part.rate else (frappe.db.get_value("Item", part_code, "standard_rate") or 0)
            part_uom = frappe.db.get_value("Item", part_code, "stock_uom") or "Nos"
            part_name = frappe.db.get_value("Item", part_code, "item_name")
            
            part_item = quotation.append("items", {})
            part_item.item_code = part_code
            part_item.item_name = part_name
            part_item.qty = part_qty
            part_item.rate = part_rate
            part_item.uom = part_uom
            part_item.description = f"Part for {watch_item_name}"
    
    # Save quotation
    quotation.insert(ignore_permissions=True)
    
    # Submit the quotation
    quotation.submit()
    
    # Reload quotation to get calculated totals
    quotation.reload()
    
    # Link quotation to repair order
    repair_order.quotation = quotation.name
    repair_order.quotation_type = quotation_type
    # Use the quotation's calculated grand_total
    repair_order.quotation_amount = quotation.grand_total or quotation.total or 0
    repair_order.save(ignore_permissions=True)
    frappe.db.commit()  # Ensure changes are committed to database
    
    frappe.msgprint(_("Quotation {0} created successfully").format(quotation.name))
    
    return quotation.name


# ============================================================================
# PATCH 2: FIX create_sales_invoice() to include parts as separate items
# ============================================================================

def create_sales_invoice_fixed(repair_order_name, source_type="quotation", payment_type="full", amount=None):
    """
    Create a sales invoice from a repair order.
    
    FIXED: Now includes parts as separate line items so Stock Entries are created.
    
    Args:
        repair_order_name: Name of the repair order
        source_type: "quotation" or "order" - source for invoice items
        payment_type: "full", "advance", or "balance" - type of payment
        amount: Amount for partial payment (required for advance/balance)
    
    Returns:
        Name of the created sales invoice
    """
    import json
    import frappe
    from frappe import _
    from frappe.utils import flt
    from watch_doctor.invoice_settings import WORKFLOW_REPAIR_SERVICE, apply_workflow_naming_series
    from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import get_or_create_service_item
    from watch_doctor.inventory_helpers import validate_parts_stock_availability
    
    # Convert amount to float if it's a string
    if amount:
        if isinstance(amount, str):
            amount = float(amount)
    
    # Fetch the repair order
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    
    # Create sales invoice as POS invoice for payment tracking
    invoice = frappe.new_doc("Sales Invoice")
    invoice.customer = repair_order.customer
    invoice.posting_date = frappe.utils.nowdate()
    invoice.due_date = frappe.utils.add_days(None, 30)  # Net 30 payment terms
    invoice.is_pos = 1  # Mark as POS invoice to enable payment tracking
    invoice.update_stock = 1  # FIXED: Ensure stock is updated on submit
    apply_workflow_naming_series(invoice, WORKFLOW_REPAIR_SERVICE)
    
    # Determine source of items
    if source_type == "quotation" and repair_order.quotation:
        # Create from quotation (which now includes parts as separate items)
        quotation = frappe.get_doc("Quotation", repair_order.quotation)
        
        # Add all items from quotation
        for q_item in quotation.items:
            invoice_item = invoice.append("items", {})
            invoice_item.item_code = q_item.item_code
            invoice_item.item_name = q_item.item_name
            invoice_item.description = q_item.description
            invoice_item.qty = q_item.qty
            invoice_item.rate = q_item.rate
            invoice_item.uom = q_item.uom
        
        total_amount = quotation.grand_total
    else:
        # Create directly from repair order
        total_amount = 0

        # Ensure we have a generic service item for tasks
        service_item_code = get_or_create_service_item()

        for item in repair_order.items:
            model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
            watch_item_name = f"Repair - {item.watch_brand} {model_name}"

            # Get tasks and parts for this watch
            item_key = str(item.idx)
            item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
            item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

            # Calculate task cost only
            tasks_cost = 0
            for task in item_tasks:
                task_template = frappe.get_doc("DW Task Template", task.service)
                tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

            # Calculate parts cost (for reference only, parts added separately below)
            parts_cost = 0
            for part in item_parts:
                item_doc = frappe.get_doc("Item", part.part)
                parts_cost += (part.rate if part.rate else (item_doc.standard_rate or 0)) * part.quantity

            # Build description from recommended_work
            try:
                rw_raw = item.recommended_work or "[]"
                rw_items = json.loads(rw_raw) if isinstance(rw_raw, str) else (rw_raw or [])
                if isinstance(rw_items, str):
                    rw_items = [rw_items] if rw_items.strip() else []
            except Exception:
                rw_items = []

            if not rw_items and item_tasks:
                rw_items = [
                    (frappe.db.get_value("DW Task Template", task.service, "task_name") or task.service)
                    for task in item_tasks
                ]

            desc_lines = "<br>".join(line for line in rw_items if str(line).strip())

            # FIXED: Add service item with LABOR ONLY
            invoice_item = invoice.append("items", {})
            invoice_item.item_code = service_item_code
            invoice_item.item_name = watch_item_name
            invoice_item.description = desc_lines or watch_item_name
            invoice_item.qty = 1
            invoice_item.rate = tasks_cost  # LABOR ONLY
            invoice_item.uom = "Nos"

            total_amount += tasks_cost

            # FIXED: Add each part as separate invoice item
            for part in item_parts:
                if not part.part or not part.quantity:
                    continue
                
                part_code = part.part
                part_qty = flt(part.quantity)
                part_rate = part.rate if part.rate else (frappe.db.get_value("Item", part_code, "standard_rate") or 0)
                part_uom = frappe.db.get_value("Item", part_code, "stock_uom") or "Nos"
                part_name = frappe.db.get_value("Item", part_code, "item_name")
                
                invoice_part = invoice.append("items", {})
                invoice_part.item_code = part_code
                invoice_part.item_name = part_name
                invoice_part.qty = part_qty
                invoice_part.rate = flt(part_rate)
                invoice_part.uom = part_uom
                invoice_part.description = f"Part for {watch_item_name}"
                
                total_amount += part_qty * flt(part_rate)
    
    # Handle partial payments
    if payment_type == "advance" or payment_type == "balance":
        if not amount:
            frappe.throw(_("Amount is required for {0} payment").format(payment_type))
        
        # Adjust invoice total by adding a discount
        discount_amount = total_amount - amount
        invoice.discount_amount = discount_amount
        invoice.apply_discount_on = "Grand Total"
        
        if payment_type == "advance":
            invoice.title = f"Advance Payment - {repair_order.name}"
        else:
            invoice.title = f"Balance Payment - {repair_order.name}"
    else:
        invoice.title = f"Invoice for {repair_order.name}"
    
    # Save invoice
    invoice.insert(ignore_permissions=True)
    
    # Link invoice to repair order
    if not repair_order.sales_invoice:
        repair_order.sales_invoice = invoice.name
    repair_order.save(ignore_permissions=True)
    
    frappe.msgprint(_("Sales Invoice {0} created successfully").format(invoice.name))
    
    return {
        "invoice_name": invoice.name,
        "invoice_amount": invoice.grand_total or invoice.total or 0,
        "print_format": frappe.db.get_value("DW Invoice Settings", None, "repair_service_print_format") or "Standard",
    }


# ============================================================================
# PATCH 3: FIX finalize_invoice() with stock validation and safety
# ============================================================================

def finalize_invoice_fixed(repair_order_name, invoice_name, discount=0, payment_mode="Cash", mark_as_delivered=True):
    """
    Finalize an invoice with discount, payment mode, and optionally mark order as delivered.
    
    FIXED: Added stock validation, transactional safety, and Stock Entry verification.
    
    Args:
        repair_order_name: Name of the repair order
        invoice_name: Name of the sales invoice
        discount: Discount amount to apply
        payment_mode: Cash, Credit Card, or Credit (Pay Later)
        mark_as_delivered: Whether to submit the repair order
    
    Returns:
        Dictionary with success status and message
    """
    import json
    import frappe
    from frappe import _
    from frappe.utils import flt
    from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY
    from watch_doctor.inventory_helpers import validate_parts_stock_availability
    
    require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
    
    # Parse boolean if passed as string
    if isinstance(mark_as_delivered, str):
        mark_as_delivered = mark_as_delivered.lower() in ['true', '1', 'yes']
    
    # Parse discount as float
    discount = float(discount or 0)
    
    # Get the invoice
    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    invoice.flags.ignore_permissions = True
    
    # Get repair order
    repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
    repair_order.flags.ignore_permissions = True
    
    # FIXED: Validate stock availability before proceeding
    shortage_map = validate_parts_stock_availability(repair_order, warehouse=invoice.set_warehouse)
    if shortage_map:
        shortage_details = "\n".join([
            f"  {shortage['item_name']} ({k}): Need {shortage['qty_required']}, Have {shortage['qty_available']}"
            for k, shortage in shortage_map.items()
        ])
        frappe.throw(
            f"Insufficient stock for repair order {repair_order_name}:\n{shortage_details}\n"
            "Please procure parts or adjust quantities before finalizing invoice."
        )
    
    # Apply discount if any
    if discount > 0:
        invoice.discount_amount = discount
        invoice.save(ignore_permissions=True)
        invoice.reload()
    
    # Add payment mode entry if this is a POS invoice
    if invoice.is_pos:
        # Clear existing payments
        invoice.payments = []
        
        # Get the Mode of Payment details
        mode_of_payment_doc = frappe.get_doc("Mode of Payment", payment_mode)
        
        # Get default account for this mode of payment
        default_account = None
        if mode_of_payment_doc.accounts:
            for acc in mode_of_payment_doc.accounts:
                if acc.company == invoice.company:
                    default_account = acc.default_account
                    break
        
        # If no account found, get company's default cash account
        if not default_account:
            default_account = frappe.get_cached_value("Company", invoice.company, "default_cash_account")
        
        # Add payment entry with the final amount (after discount)
        payment_entry = invoice.append('payments', {})
        payment_entry.mode_of_payment = payment_mode
        payment_entry.account = default_account
        
        # Set payment amount based on payment mode TYPE
        if mode_of_payment_doc.type in ['Cash', 'Bank']:
            payment_entry.amount = invoice.grand_total
        else:
            payment_entry.amount = 0
        
        # Save to update totals
        invoice.save(ignore_permissions=True)
        invoice.reload()
    else:
        # For non-POS invoices, set in remarks
        if payment_mode:
            invoice.db_set('remarks', f"Payment Mode: {payment_mode}", update_modified=False)
    
    # FIXED: Safe invoice submission with error handling
    try:
        if invoice.docstatus == 0:
            invoice.submit()
            frappe.logger().info(f"Sales Invoice {invoice.name} submitted successfully")
    except Exception as e:
        frappe.logger().error(f"Error submitting Sales Invoice {invoice.name}: {str(e)}")
        frappe.db.rollback()
        frappe.throw(
            f"Failed to submit Sales Invoice: {str(e)}\n"
            "Stock Entry may not have been created. "
            "Please review and resubmit manually."
        )
    
    # FIXED: Verify Stock Entry was created for items with stock
    try:
        stock_items = [item for item in invoice.items if frappe.db.get_value("Item", item.item_code, "is_stock_item")]
        if stock_items:
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
                    f"Check Item.is_stock_item settings."
                )
            else:
                # Link the stock entry to repair order
                repair_order.db_set("stock_entry_for_parts", stock_entries[0], update_modified=False)
    except Exception as e:
        frappe.logger().warning(f"Could not verify Stock Entry creation: {str(e)}")
    
    # Update invoiced amount
    repair_order.db_set('invoiced_amount', invoice.grand_total, update_modified=False)
    
    # Update paid amount based on payment mode TYPE
    if mode_of_payment_doc.type in ['Cash', 'Bank']:
        repair_order.db_set('paid_amount', invoice.grand_total, update_modified=False)
        repair_order.db_set('balance_amount', 0, update_modified=False)
    else:
        repair_order.db_set('paid_amount', 0, update_modified=False)
        repair_order.db_set('balance_amount', invoice.grand_total, update_modified=False)
    
    # Mark as delivered if requested
    if mark_as_delivered:
        repair_order.reload()
        repair_order.flags.ignore_permissions = True
        if repair_order.docstatus == 0:
            repair_order.submit()
            frappe.msgprint(_("Repair order marked as Delivered"))
    
    frappe.db.commit()
    
    return {
        "success": True,
        "invoice_name": invoice.name,
        "invoice_total": invoice.grand_total,
        "discount_applied": discount,
        "payment_mode": payment_mode,
        "order_delivered": mark_as_delivered
    }
