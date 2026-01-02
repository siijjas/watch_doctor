from __future__ import unicode_literals

import frappe

def execute():
    # Seed common country codes if they don't exist
    common_codes = [
        {"country_name": "India", "code": "+91"},
        {"country_name": "United States", "code": "+1"},
        {"country_name": "United Kingdom", "code": "+44"},
        {"country_name": "Australia", "code": "+61"},
        {"country_name": "UAE", "code": "+971"},
        {"country_name": "Saudi Arabia", "code": "+966"},
        {"country_name": "France", "code": "+33"},
        {"country_name": "Germany", "code": "+49"},
        {"country_name": "Canada", "code": "+1"},
        {"country_name": "Singapore", "code": "+65"}
    ]

    for item in common_codes:
        name = f"{item['code']} ({item['country_name']})"
        if not frappe.db.exists("DW Country Code", name):
            doc = frappe.get_doc({
                "doctype": "DW Country Code",
                "country_name": item["country_name"],
                "code": item["code"]
            })
            doc.insert(ignore_permissions=True)
