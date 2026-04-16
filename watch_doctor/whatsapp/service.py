import frappe
import requests
import re
import random

MAX_RETRIES = 3
BASE_DELAY_SECONDS = 10  # 10s, 20s, 40s

# Ordered list of (placeholder_token, human_label).
# Position in this list determines the {{N}} number shown to admins.
PLACEHOLDER_DEFINITIONS = [
    ("{{1}}", "Customer Name"),
    ("{{2}}", "Order ID"),
    ("{{3}}", "Current Status"),
    ("{{4}}", "Shop Name"),
    ("{{5}}", "Promised Date"),
]

# Sample values used for live preview (frontend mirrors these)
PLACEHOLDER_SAMPLES = {
    "{{1}}": "Abdullah Al-Rashid",
    "{{2}}": "RO-2024-0042",
    "{{3}}": "Ready for Collection",
    "{{4}}": "Watch Doctor",
    "{{5}}": "20 Apr 2026",
}


def should_retry(status_code: int) -> bool:
	return status_code in (429, 500, 502, 503, 504)


def get_backoff_delay(attempt: int) -> int:
	"""Exponential backoff with jitter."""
	delay = BASE_DELAY_SECONDS * (2 ** attempt)
	jitter = random.uniform(0, delay * 0.2)
	return delay + jitter


def get_default_country_code() -> str:
	"""Return the configured/default country code for WhatsApp sends."""
	configured = str(frappe.conf.get("whatsapp_default_country_code") or "").strip()
	configured = re.sub(r"[^\d]", "", configured)
	if configured:
		return configured

	try:
		country_code = frappe.db.get_value(
			"DW Country Code",
			{"is_active": 1},
			"code",
			order_by="display_order asc, creation asc",
		)
		country_code = re.sub(r"[^\d]", "", country_code or "")
		if country_code:
			return country_code
	except Exception:
		pass

	return "973"


def normalize_phone(mobile_no: str) -> str:
	"""
	Normalize customer phone for whapi.
	Supports either fully qualified numbers or local mobile numbers.
	Returns digits only, e.g. "97339398859".
	"""
	digits = re.sub(r"[^\d]", "", mobile_no or "")
	if digits.startswith("00"):
		digits = digits[2:]
	if digits.startswith("0"):
		digits = digits.lstrip("0")

	if not digits:
		frappe.throw("Customer mobile number is empty.")

	default_cc = get_default_country_code()
	if len(digits) < 9 and not digits.startswith(default_cc):
		digits = f"{default_cc}{digits}"

	if len(digits) < 9:
		frappe.throw("Customer mobile number is invalid for WhatsApp delivery.")

	return digits


def build_message(order_name: str, notification_key: str) -> dict:
	"""
	Resolve template and substitute {{N}} placeholders with actual order data.
	Returns: {"to": "...", "body": "...", "customer_name": "...", "phone_raw": "..."}

	Placeholder mapping (mirrors PLACEHOLDER_DEFINITIONS order):
	  {{1}} Customer Name  {{2}} Order ID  {{3}} Status  {{4}} Shop Name  {{5}} Promised Date
	"""
	order = frappe.get_doc("DW Repair Order", order_name)
	customer = frappe.get_doc("Customer", order.customer)

	template = frappe.db.get_value(
		"DW WhatsApp Template",
		{"notification_key": notification_key, "is_active": 1},
		"message_body",
	)
	if not template:
		frappe.throw(f"No active WhatsApp template for key: {notification_key}")

	shop_name = frappe.db.get_default("company") or "our shop"
	ref = order.reference_number or order.name
	promised = (
		frappe.utils.formatdate(order.promised_delivery_date)
		if order.promised_delivery_date
		else ""
	)

	values = {
		"{{1}}": customer.customer_name,
		"{{2}}": str(ref),
		"{{3}}": order.status,
		"{{4}}": shop_name,
		"{{5}}": promised,
	}

	body = template
	for token, value in values.items():
		body = body.replace(token, value)

	phone = normalize_phone(customer.mobile_no or "")

	return {
		"to": phone,
		"body": body,
		"customer_name": customer.customer_name,
		"phone_raw": customer.mobile_no,
	}


def send_whatsapp_message(log_name: str):
	"""
	Background job: send message via whapi.cloud and update log.
	Called via frappe.enqueue().
	"""
	log = frappe.get_doc("DW WhatsApp Log", log_name)
	token = frappe.conf.get("whapi_api_token")
	base_url = frappe.conf.get("whapi_base_url", "https://gate.whapi.cloud")

	if not token:
		log.status = "Failed"
		log.error_detail = "whapi_api_token not configured in site_config.json"
		log.save(ignore_permissions=True)
		frappe.db.commit()
		return

	try:
		resp = requests.post(
			f"{base_url}/messages/text",
			json={
				"to": log.phone_number,
				"body": log.message_body,
				"typing_time": 2,
			},
			headers={
				"Authorization": f"Bearer {token}",
				"Content-Type": "application/json",
				"Accept": "application/json",
			},
			timeout=30,
		)

		if resp.status_code == 200:
			data = resp.json()
			log.status = "Sent"
			log.whapi_message_id = data.get("message", {}).get("id", "")
			log.sent_at = frappe.utils.now_datetime()
		elif should_retry(resp.status_code) and log.retry_count < MAX_RETRIES:
			log.retry_count += 1
			log.error_detail = f"HTTP {resp.status_code}: {resp.text[:500]}"
			log.save(ignore_permissions=True)
			frappe.db.commit()
			delay = get_backoff_delay(log.retry_count)
			frappe.enqueue(
				"watch_doctor.whatsapp.service.send_whatsapp_message",
				log_name=log_name,
				queue="short",
				enqueue_after_timeout=delay,
			)
			return
		else:
			log.status = "Failed"
			log.error_detail = f"HTTP {resp.status_code}: {resp.text[:500]}"

	except requests.RequestException as e:
		if log.retry_count < MAX_RETRIES:
			log.retry_count += 1
			log.error_detail = str(e)[:500]
			log.save(ignore_permissions=True)
			frappe.db.commit()
			delay = get_backoff_delay(log.retry_count)
			frappe.enqueue(
				"watch_doctor.whatsapp.service.send_whatsapp_message",
				log_name=log_name,
				queue="short",
				enqueue_after_timeout=delay,
			)
			return
		log.status = "Failed"
		log.error_detail = str(e)[:500]

	log.save(ignore_permissions=True)
	frappe.db.commit()
