import frappe


NEW_TEMPLATE_BODY = (
    "Dear {{1}}, we prepared the estimate for your watch {{6}} on order #{{2}}. "
    "Diagnosis summary: {{9}}. Recommended work: {{7}}. "
    "Estimated total: {{8}}. Please confirm to proceed."
)


def execute():
    """Ensure watch-estimate WhatsApp template supports diagnosis summary placeholder."""
    notification_key = "watch_estimate_ready"

    if not frappe.db.exists("DW WhatsApp Template", notification_key):
        return

    current_body = frappe.db.get_value("DW WhatsApp Template", notification_key, "message_body") or ""
    if "{{9}}" in current_body:
        return

    updated_body = current_body.strip()
    if updated_body:
        if "Please confirm to proceed." in updated_body:
            updated_body = updated_body.replace(
                "Please confirm to proceed.",
                "Diagnosis summary: {{9}}. Please confirm to proceed.",
            )
        else:
            updated_body = f"{updated_body} Diagnosis summary: {{9}}."
    else:
        updated_body = NEW_TEMPLATE_BODY

    frappe.db.set_value("DW WhatsApp Template", notification_key, "message_body", updated_body)
    frappe.db.commit()
