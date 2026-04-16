"""Idempotent setup for PMS custom fields and the DW PMS Settings singleton."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    """Main entry point for schema-only PMS setup."""
    _create_custom_fields()
    _ensure_pms_settings()
    _ensure_pms_settings_fields()
    frappe.db.commit()
    frappe.clear_cache()


def _create_custom_fields():
    """Add PMS-specific fields to Sales Invoice and Sales Invoice Item."""

    custom_fields = {
        "Sales Invoice Item": [
            {
                "fieldname": "dw_pms_section",
                "label": "Profit Margin Scheme",
                "fieldtype": "Section Break",
                "insert_after": "edit_references",
                "collapsible": 1,
                "depends_on": "eval:doc.dw_is_pms_item",
                "print_hide": 1,
            },
            {
                "fieldname": "dw_is_pms_item",
                "label": "PMS Item",
                "fieldtype": "Check",
                "insert_after": "dw_pms_section",
                "read_only": 1,
                "print_hide": 1,
                "description": "Auto-set when the item belongs to the configured PMS group.",
            },
            {
                "fieldname": "dw_pms_purchase_cost",
                "label": "Purchase Cost (PMS)",
                "fieldtype": "Currency",
                "insert_after": "dw_is_pms_item",
                "read_only": 1,
                "print_hide": 1,
                "description": "Absorbed cost from stock valuation at the time of sale.",
            },
            {
                "fieldname": "dw_pms_cb1",
                "fieldtype": "Column Break",
                "insert_after": "dw_pms_purchase_cost",
            },
            {
                "fieldname": "dw_pms_margin",
                "label": "PMS Margin",
                "fieldtype": "Currency",
                "insert_after": "dw_pms_cb1",
                "read_only": 1,
                "print_hide": 1,
                "description": "Selling price minus purchase cost.",
            },
            {
                "fieldname": "dw_pms_vat",
                "label": "PMS VAT",
                "fieldtype": "Currency",
                "insert_after": "dw_pms_margin",
                "read_only": 1,
                "print_hide": 1,
                "description": "Derived from the configured PMS VAT divisor.",
            },
        ],
        "Sales Invoice": [
            {
                "fieldname": "dw_pms_section",
                "label": "Profit Margin Scheme",
                "fieldtype": "Section Break",
                "insert_after": "against_income_account",
                "collapsible": 1,
                "depends_on": "eval:doc.dw_has_pms_items",
                "print_hide": 1,
            },
            {
                "fieldname": "dw_has_pms_items",
                "label": "Has PMS Items",
                "fieldtype": "Check",
                "insert_after": "dw_pms_section",
                "read_only": 1,
                "print_hide": 1,
            },
            {
                "fieldname": "dw_pms_total_vat",
                "label": "Total PMS VAT",
                "fieldtype": "Currency",
                "insert_after": "dw_has_pms_items",
                "read_only": 1,
                "print_hide": 1,
                "bold": 1,
                "description": "Sum of margin-based VAT across all PMS items.",
            },
            {
                "fieldname": "dw_pms_cb1",
                "fieldtype": "Column Break",
                "insert_after": "dw_pms_total_vat",
            },
            {
                "fieldname": "dw_pms_disclaimer",
                "label": "PMS Disclaimer",
                "fieldtype": "Small Text",
                "insert_after": "dw_pms_cb1",
                "read_only": 1,
                "print_hide": 0,
                "description": "Printed on PMS invoices.",
            },
        ],
    }

    create_custom_fields(custom_fields, update=True)


def _ensure_pms_settings():
    """Create the DW PMS Settings doctype (singleton) if it doesn't exist."""
    if frappe.db.exists("DocType", "DW PMS Settings"):
        return

    doc = frappe.get_doc({
        "doctype": "DocType",
        "name": "DW PMS Settings",
        "module": "Repair Management",
        "custom": 1,
        "issingle": 1,
        "editable_grid": 0,
        "track_changes": 0,
        "fields": [
            {
                "fieldname": "pms_enabled",
                "fieldtype": "Check",
                "label": "Enable Profit Margin Scheme",
                "default": "0",
                "description": "When enabled, PMS invoices require a complete configuration.",
            },
            {
                "fieldname": "pms_item_group",
                "fieldtype": "Link",
                "label": "PMS Item Group",
                "options": "Item Group",
                "description": "Items in this group are treated as PMS items.",
            },
            {
                "fieldname": "sb_accounts",
                "fieldtype": "Section Break",
                "label": "Accounts",
            },
            {
                "fieldname": "pms_vat_account",
                "fieldtype": "Link",
                "label": "PMS VAT Output Account",
                "options": "Account",
                "description": "Liability account for PMS VAT. Must be a non-group Tax account.",
            },
            {
                "fieldname": "standard_sales_taxes_template",
                "fieldtype": "Link",
                "label": "Standard Sales Taxes Template",
                "options": "Sales Taxes and Charges Template",
                "description": "Used for non-PMS Sales Invoices in POS.",
            },
            {
                "fieldname": "standard_item_tax_template",
                "fieldtype": "Link",
                "label": "Standard Item Tax Template",
                "options": "Item Tax Template",
                "description": "Reference template for standard-rated items.",
            },
            {
                "fieldname": "pms_vat_divisor",
                "fieldtype": "Float",
                "label": "PMS VAT Divisor",
                "description": "Margin is divided by this value to derive PMS VAT.",
            },
            {
                "fieldname": "sb_print",
                "fieldtype": "Section Break",
                "label": "Print Settings",
            },
            {
                "fieldname": "pms_print_format",
                "fieldtype": "Link",
                "label": "PMS Print Format",
                "options": "Print Format",
                "description": "Sales Invoice print format used for PMS customer invoices.",
            },
            {
                "fieldname": "pms_disclaimer",
                "fieldtype": "Small Text",
                "label": "Invoice Disclaimer Text",
            },
        ],
        "permissions": [
            {"role": "System Manager", "read": 1, "write": 1, "create": 1},
            {"role": "DW Executive", "read": 1, "write": 1},
        ],
    })
    doc.flags.ignore_permissions = True
    doc.insert()
    frappe.msgprint("Created DW PMS Settings doctype")


def _ensure_pms_settings_fields():
    """Add newly introduced PMS settings fields for existing sites."""
    custom_fields = {
        "DW PMS Settings": [
            {
                "fieldname": "standard_sales_taxes_template",
                "fieldtype": "Link",
                "label": "Standard Sales Taxes Template",
                "options": "Sales Taxes and Charges Template",
                "insert_after": "pms_vat_account",
            },
            {
                "fieldname": "standard_item_tax_template",
                "fieldtype": "Link",
                "label": "Standard Item Tax Template",
                "options": "Item Tax Template",
                "insert_after": "standard_sales_taxes_template",
            },
            {
                "fieldname": "pms_vat_divisor",
                "fieldtype": "Float",
                "label": "PMS VAT Divisor",
                "insert_after": "standard_item_tax_template",
            },
            {
                "fieldname": "pms_print_format",
                "fieldtype": "Link",
                "label": "PMS Print Format",
                "options": "Print Format",
                "insert_after": "sb_print",
            },
        ],
    }
    create_custom_fields(custom_fields, update=True)
