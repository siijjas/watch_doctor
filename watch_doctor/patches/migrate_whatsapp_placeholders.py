import frappe

# Map old Python-style named placeholders → new numbered tokens.
# Must list longer / more specific patterns first to avoid partial matches.
OLD_TO_NEW = [
	("{customer_name}", "{{1}}"),
	("{ref}", "{{2}}"),
	("{status}", "{{3}}"),
	("{shop_name}", "{{4}}"),
	("{promised_date}", "{{5}}"),
]


def execute():
	"""Migrate WhatsApp templates from {name} placeholders to {{N}} numbered tokens."""
	frappe.reload_doc("repair_management", "doctype", "dw_whatsapp_template")

	templates = frappe.get_all("DW WhatsApp Template", fields=["name", "message_body"])

	updated_count = 0
	for t in templates:
		body = t["message_body"] or ""
		new_body = body
		for old, new in OLD_TO_NEW:
			new_body = new_body.replace(old, new)
		if new_body != body:
			frappe.db.set_value("DW WhatsApp Template", t["name"], "message_body", new_body)
			print(f"  Migrated placeholders in template: {t['name']}")
			updated_count += 1

	if updated_count:
		frappe.db.commit()
		print(f"  {updated_count} template(s) updated.")
	else:
		print("  No templates needed migration.")
