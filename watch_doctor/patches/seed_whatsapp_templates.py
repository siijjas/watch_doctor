import frappe


def execute():
	"""Seed default WhatsApp notification templates using {{N}} numbered placeholders."""
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_template")
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_log")

	templates = [
		{
			"notification_key": "order_received",
			"label": "Order Received",
			"is_active": 1,
			"message_body": "Dear {{1}}, your repair order #{{2}} has been received. We'll update you as work begins. Thank you for choosing {{4}}.",
		},
		{
			"notification_key": "in_progress",
			"label": "In Progress",
			"is_active": 1,
			"message_body": "Dear {{1}}, your repair order #{{2}} is now being worked on by our technicians. We'll notify you when it's ready.",
		},
		{
			"notification_key": "awaiting_parts",
			"label": "Awaiting Parts",
			"is_active": 1,
			"message_body": "Dear {{1}}, your repair order #{{2}} requires parts that are being sourced. We'll update you once work resumes.",
		},
		{
			"notification_key": "ready_for_collection",
			"label": "Ready for Collection",
			"is_active": 1,
			"message_body": "Dear {{1}}, great news! Your repair order #{{2}} is complete and ready for collection. Please visit us at your convenience.",
		},
		{
			"notification_key": "delivered",
			"label": "Delivered",
			"is_active": 1,
			"message_body": "Dear {{1}}, your repair order #{{2}} has been delivered. Thank you for your business! We'd love to see you again at {{4}}.",
		},
		{
			"notification_key": "watch_estimate_ready",
			"label": "Watch Estimate Ready",
			"is_active": 1,
			"message_body": "Dear {{1}}, we prepared the estimate for your watch {{6}} on order #{{2}}. Diagnosis summary: {{9}}. Recommended work: {{7}}. Estimated total: {{8}}. Please confirm to proceed.",
		},
	]

	for t in templates:
		if not frappe.db.exists("DW WhatsApp Template", t["notification_key"]):
			doc = frappe.get_doc({"doctype": "DW WhatsApp Template", **t})
			doc.insert(ignore_permissions=True)
			print(f"  Created WhatsApp template: {t['label']}")
		else:
			print(f"  WhatsApp template exists: {t['label']}")

	frappe.db.commit()
