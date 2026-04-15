import frappe


def execute():
	"""Seed default WhatsApp notification templates."""
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_template")
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_log")

	templates = [
		{
			"notification_key": "order_received",
			"label": "Order Received",
			"is_active": 1,
			"message_body": "Dear {customer_name}, your repair order #{ref} has been received. We'll update you as work begins. Thank you for choosing {shop_name}.",
		},
		{
			"notification_key": "in_progress",
			"label": "In Progress",
			"is_active": 1,
			"message_body": "Dear {customer_name}, your repair order #{ref} is now being worked on by our technicians. We'll notify you when it's ready.",
		},
		{
			"notification_key": "awaiting_parts",
			"label": "Awaiting Parts",
			"is_active": 1,
			"message_body": "Dear {customer_name}, your repair order #{ref} requires parts that are being sourced. We'll update you once work resumes.",
		},
		{
			"notification_key": "ready_for_collection",
			"label": "Ready for Collection",
			"is_active": 1,
			"message_body": "Dear {customer_name}, great news! Your repair order #{ref} is complete and ready for collection. Please visit us at your convenience.",
		},
		{
			"notification_key": "delivered",
			"label": "Delivered",
			"is_active": 1,
			"message_body": "Dear {customer_name}, your repair order #{ref} has been delivered. Thank you for your business! We'd love to see you again at {shop_name}.",
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
