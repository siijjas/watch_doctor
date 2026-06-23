import frappe
from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY

STATUS_TO_NOTIFICATION_KEY = {
	"Pending": "order_received",
	"In Progress": "in_progress",
	"Awaiting Parts": "awaiting_parts",
	"Create Estimate": "estimate_ready",
	"Repaired": "ready_for_collection",
	"Delivered": "delivered",
}

WATCH_ESTIMATE_NOTIFICATION_KEY = "watch_estimate_ready"


@frappe.whitelist()
def notify_customer(repair_order_name: str):
	"""On-demand WhatsApp notification trigger."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	if not frappe.conf.get("whatsapp_enabled"):
		frappe.throw("WhatsApp notifications are not enabled.")

	order = frappe.get_doc("DW Repair Order", repair_order_name)
	customer = frappe.get_doc("Customer", order.customer)

	# Validate phone
	if not customer.mobile_no:
		frappe.throw(f"Customer {customer.customer_name} has no mobile number.")

	notification_key = STATUS_TO_NOTIFICATION_KEY.get(order.status)
	if not notification_key:
		frappe.throw(f"No notification template for status: {order.status}")

	# Cooldown check
	cooldown = int(frappe.conf.get("whatsapp_cooldown_minutes", 60))
	cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-cooldown)
	existing = frappe.db.exists(
		"DW WhatsApp Log",
		{
			"repair_order": repair_order_name,
			"order_status": order.status,
			"status": ["in", ["Queued", "Sent"]],
			"creation": [">=", cutoff],
		},
	)
	if existing:
		frappe.throw(
			f"Customer was already notified about this status within the last {cooldown} minutes."
		)

	# Build message
	from watch_doctor.whatsapp.service import build_message

	msg = build_message(repair_order_name, notification_key)

	# Create log
	log = frappe.get_doc(
		{
			"doctype": "DW WhatsApp Log",
			"repair_order": repair_order_name,
			"customer": order.customer,
			"customer_name": msg["customer_name"],
			"phone_number": msg["to"],
			"order_status": order.status,
			"notification_key": notification_key,
			"message_body": msg["body"],
			"status": "Queued",
			"sent_by": frappe.session.user,
			"retry_count": 0,
		}
	)
	log.insert(ignore_permissions=True)
	frappe.db.commit()

	# Enqueue async send
	frappe.enqueue(
		"watch_doctor.whatsapp.service.send_whatsapp_message",
		log_name=log.name,
		queue="short",
		is_async=True,
	)

	return {"status": "queued", "log_name": log.name}


@frappe.whitelist()
def get_notification_status(repair_order_name: str):
	"""Get the latest WhatsApp notification status for an order."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	logs = frappe.get_all(
		"DW WhatsApp Log",
		filters={"repair_order": repair_order_name},
		fields=["status", "order_status", "sent_at", "creation", "message_body"],
		order_by="creation desc",
		limit=1,
	)
	return logs[0] if logs else None


@frappe.whitelist()
def get_whatsapp_config():
	"""Return WhatsApp feature flags for the frontend (no secrets)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	return {
		"enabled": bool(frappe.conf.get("whatsapp_enabled")),
		"cooldown_minutes": int(frappe.conf.get("whatsapp_cooldown_minutes", 60)),
	}


@frappe.whitelist()
def preview_notification(repair_order_name: str):
	"""Return the resolved message body and recipient details without sending."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	order = frappe.get_doc("DW Repair Order", repair_order_name)

	notification_key = STATUS_TO_NOTIFICATION_KEY.get(order.status)
	if not notification_key:
		frappe.throw(f"No WhatsApp template configured for status: {order.status}")

	from watch_doctor.whatsapp.service import build_message

	msg = build_message(repair_order_name, notification_key)

	return {
		"customer_name": msg["customer_name"],
		"phone_display": msg["phone_raw"] or "",
		"message_body": msg["body"],
	}


@frappe.whitelist()
def preview_estimate_notification(repair_order_name: str, repair_item_name: str):
	"""Return watch-specific estimate WhatsApp message preview without sending."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	from watch_doctor.whatsapp.service import build_watch_estimate_message

	msg = build_watch_estimate_message(repair_order_name, repair_item_name, WATCH_ESTIMATE_NOTIFICATION_KEY)

	return {
		"customer_name": msg["customer_name"],
		"phone_display": msg["phone_raw"] or "",
		"message_body": msg["body"],
		"watch_label": msg.get("watch_label") or "",
		"estimate_total": msg.get("estimate_total") or "",
		"recommended_work": msg.get("recommended_work") or [],
	}


@frappe.whitelist()
def notify_estimate_customer(repair_order_name: str, repair_item_name: str):
	"""Send watch-specific estimate WhatsApp message on demand."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	if not frappe.conf.get("whatsapp_enabled"):
		frappe.throw("WhatsApp notifications are not enabled.")

	order = frappe.get_doc("DW Repair Order", repair_order_name)
	customer = frappe.get_doc("Customer", order.customer)

	if not customer.mobile_no:
		frappe.throw(f"Customer {customer.customer_name} has no mobile number.")

	item = next((row for row in (order.items or []) if row.name == repair_item_name), None)
	if not item:
		frappe.throw("Repair item not found in this order")

	watch_log_status = f"Estimate:{repair_item_name}"

	cooldown = int(frappe.conf.get("whatsapp_cooldown_minutes", 60))
	cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-cooldown)
	existing = frappe.db.exists(
		"DW WhatsApp Log",
		{
			"repair_order": repair_order_name,
			"notification_key": WATCH_ESTIMATE_NOTIFICATION_KEY,
			"order_status": watch_log_status,
			"status": ["in", ["Queued", "Sent"]],
			"creation": [">=", cutoff],
		},
	)
	if existing:
		frappe.throw(
			f"Customer was already notified about this watch estimate within the last {cooldown} minutes."
		)

	from watch_doctor.whatsapp.service import build_watch_estimate_message

	msg = build_watch_estimate_message(repair_order_name, repair_item_name, WATCH_ESTIMATE_NOTIFICATION_KEY)

	log = frappe.get_doc(
		{
			"doctype": "DW WhatsApp Log",
			"repair_order": repair_order_name,
			"customer": order.customer,
			"customer_name": msg["customer_name"],
			"phone_number": msg["to"],
			"order_status": watch_log_status,
			"notification_key": WATCH_ESTIMATE_NOTIFICATION_KEY,
			"message_body": msg["body"],
			"status": "Queued",
			"sent_by": frappe.session.user,
			"retry_count": 0,
		}
	)
	log.insert(ignore_permissions=True)
	frappe.db.commit()

	frappe.enqueue(
		"watch_doctor.whatsapp.service.send_whatsapp_message",
		log_name=log.name,
		queue="short",
		is_async=True,
	)

	return {
		"status": "queued",
		"log_name": log.name,
		"watch_label": msg.get("watch_label") or "",
		"estimate_total": msg.get("estimate_total") or "",
	}


@frappe.whitelist()
def get_template_placeholders():
	"""Return the ordered placeholder legend for the Settings UI."""
	require_roles(ROLE_EXECUTIVE)

	from watch_doctor.whatsapp.service import PLACEHOLDER_DEFINITIONS, PLACEHOLDER_SAMPLES

	return [
		{"token": token, "label": label, "sample": PLACEHOLDER_SAMPLES[token]}
		for token, label in PLACEHOLDER_DEFINITIONS
	]


@frappe.whitelist()
def get_whatsapp_templates():
	"""Return all WhatsApp notification templates."""
	require_roles(ROLE_EXECUTIVE)

	return frappe.get_all(
		"DW WhatsApp Template",
		fields=["name", "notification_key", "label", "message_body", "is_active"],
		order_by="creation asc",
	)


@frappe.whitelist()
def save_whatsapp_template(notification_key: str, message_body: str, is_active: int = 1):
	"""Update a WhatsApp template's message body and active state."""
	require_roles(ROLE_EXECUTIVE)

	if not frappe.db.exists("DW WhatsApp Template", notification_key):
		frappe.throw(f"Template '{notification_key}' not found.")

	doc = frappe.get_doc("DW WhatsApp Template", notification_key)
	doc.message_body = message_body
	doc.is_active = int(is_active)
	doc.save(ignore_permissions=True)
	frappe.db.commit()

	return {"status": "ok"}
