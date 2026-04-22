import frappe


def execute():
	"""Rename watch status label and ensure watch-estimate WhatsApp template exists."""
	frappe.reload_doc("repair_management", "doctype", "dw_repair_item")
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_template")

	frappe.db.sql(
		"""
		update `tabDW Repair Item`
		set status = 'Create Estimate'
		where status = 'Approval for Estimate'
		"""
	)

	notification_key = "watch_estimate_ready"
	if not frappe.db.exists("DW WhatsApp Template", notification_key):
		doc = frappe.get_doc(
			{
				"doctype": "DW WhatsApp Template",
				"notification_key": notification_key,
				"label": "Watch Estimate Ready",
				"is_active": 1,
				"message_body": "Dear {{1}}, we prepared the estimate for your watch {{6}} on order #{{2}}. Recommended work: {{7}}. Estimated total: {{8}}. Please confirm to proceed.",
			}
		)
		doc.insert(ignore_permissions=True)

	frappe.db.commit()
