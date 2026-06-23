import frappe


def execute():
	"""Seed the 'estimate_ready' WhatsApp template for the Create Estimate order status."""
	if frappe.db.exists("DW WhatsApp Template", "estimate_ready"):
		return

	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_template")

	doc = frappe.get_doc({
		"doctype": "DW WhatsApp Template",
		"notification_key": "estimate_ready",
		"label": "Estimate Ready for Approval",
		"is_active": 1,
		"message_body": (
			"Dear {{1}}, we have prepared an estimate for your repair order #{{2}}. "
			"Please visit us or contact us to review and approve the work. "
			"Thank you for choosing {{4}}."
		),
	})
	doc.insert(ignore_permissions=True)
	frappe.db.commit()
