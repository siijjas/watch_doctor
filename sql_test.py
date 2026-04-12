import frappe
frappe.init(site="site2-dwy", sites_path="../../sites")
frappe.connect()
res = frappe.db.sql("""
    SELECT name, payment_type, party_type, mode_of_payment, paid_amount 
    FROM `tabPayment Entry` 
    ORDER BY creation DESC 
    LIMIT 10
""", as_dict=True)
import json
print(json.dumps(res, indent=2))
