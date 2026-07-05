import frappe


def execute():
	"""Remove the generic 'estimate_ready' WhatsApp template; superseded by watch_estimate_ready."""
	if frappe.db.exists("DW WhatsApp Template", "estimate_ready"):
		frappe.delete_doc("DW WhatsApp Template", "estimate_ready", ignore_permissions=True, force=True)
		frappe.db.commit()
