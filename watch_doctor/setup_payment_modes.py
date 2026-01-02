"""
Script to create default payment mode configurations.
Run this in bench console:
    bench --site site2-dwy console
    exec(open('apps/watch_doctor/watch_doctor/setup_payment_modes.py').read())
"""

import frappe

def setup_default_payment_modes():
    """Create default payment mode configurations."""
    
    # Default payment modes to configure
    default_modes = [
        {"payment_mode": "Cash", "display_order": 1},
        {"payment_mode": "Credit Card", "display_order": 2},
    ]
    
    for mode_config in default_modes:
        # Check if payment mode exists in ERPNext
        if not frappe.db.exists("Mode of Payment", mode_config["payment_mode"]):
            print(f"Creating Mode of Payment: {mode_config['payment_mode']}")
            mop = frappe.new_doc("Mode of Payment")
            mop.mode_of_payment = mode_config["payment_mode"]
            mop.enabled = 1
            mop.type = "Cash" if mode_config["payment_mode"] == "Cash" else "Bank"
            mop.insert(ignore_permissions=True)
        
        # Check if config already exists
        if not frappe.db.exists("DW Payment Mode Config", mode_config["payment_mode"]):
            print(f"Creating DW Payment Mode Config: {mode_config['payment_mode']}")
            config = frappe.new_doc("DW Payment Mode Config")
            config.payment_mode = mode_config["payment_mode"]
            config.is_active = 1
            config.display_order = mode_config["display_order"]
            config.insert(ignore_permissions=True)
        else:
            print(f"DW Payment Mode Config already exists: {mode_config['payment_mode']}")
    
    frappe.db.commit()
    print("\n✅ Default payment modes configured successfully!")
    print("You can now add more payment modes via: Repair Management → DW Payment Mode Config")

if __name__ == "__main__":
    setup_default_payment_modes()
