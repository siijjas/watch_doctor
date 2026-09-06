import frappe
import requests
import re

from watch_doctor.list_field_utils import normalize_string_list as _normalize_string_list

MAX_RETRIES = 3

# Ordered list of (placeholder_token, human_label).
# Position in this list determines the {{N}} number shown to admins.
PLACEHOLDER_DEFINITIONS = [
    ("{{1}}", "Customer Name"),
    ("{{2}}", "Order ID"),
    ("{{3}}", "Current Status"),
    ("{{4}}", "Shop Name"),
    ("{{5}}", "Promised Date"),
	("{{6}}", "Watch Details"),
	("{{7}}", "Recommended Works"),
	("{{8}}", "Estimate Total"),
	("{{9}}", "Diagnosis Summary"),
]

# Sample values used for live preview (frontend mirrors these)
PLACEHOLDER_SAMPLES = {
    "{{1}}": "Abdullah Al-Rashid",
    "{{2}}": "RO-2024-0042",
    "{{3}}": "Ready for Collection",
    "{{4}}": "Watch Doctor",
    "{{5}}": "20 Apr 2026",
    "{{6}}": "Omega Seamaster (SN: A12345)",
    "{{7}}": "Movement service, Gasket replacement",
    "{{8}}": "BHD 68.000",
	"{{9}}": "Circuit damage, Movement wear",
}


def _replace_template_tokens(template: str, values: dict[str, str]) -> str:
	body = template
	for token, value in values.items():
		body = body.replace(token, str(value or ""))
	return body


def _get_task_rate(task) -> float:
	rate = task.rate or task.auto_rate
	if rate:
		return float(rate)
	if task.service:
		return float(frappe.db.get_value("DW Task Template", task.service, "default_rate") or 0)
	return 0.0


def _get_part_rate(part) -> float:
	rate = part.rate or part.auto_rate
	if rate:
		return float(rate)
	if part.part:
		return float(frappe.db.get_value("Item", part.part, "standard_rate") or 0)
	return 0.0


def should_retry(status_code: int) -> bool:
	return status_code in (429, 500, 502, 503, 504)


def get_default_country_code() -> str:
	"""Return the configured/default country code for WhatsApp sends."""
	# 1. site_config.json override
	configured = str(frappe.conf.get("whatsapp_default_country_code") or "").strip()
	configured = re.sub(r"[^\d]", "", configured)
	if configured:
		return configured

	# 2. DW General Configuration (editable from Settings UI)
	try:
		from watch_doctor.general_configuration import DOCTYPE_NAME as GC_DOCTYPE
		cc_from_config = frappe.db.get_single_value(GC_DOCTYPE, "whatsapp_default_country_code") or ""
		cc_from_config = re.sub(r"[^\d]", "", str(cc_from_config).strip())
		if cc_from_config:
			return cc_from_config
	except Exception:
		pass

	# 3. DW Country Code list
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
	  {{6}} Watch Details  {{7}} Recommended Works  {{8}} Estimate Total  {{9}} Diagnosis Summary
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
		"{{6}}": "",
		"{{7}}": "",
		"{{8}}": "",
		"{{9}}": "",
	}

	body = _replace_template_tokens(template, values)

	phone = normalize_phone(customer.mobile_no or "")

	return {
		"to": phone,
		"body": body,
		"customer_name": customer.customer_name,
		"phone_raw": customer.mobile_no,
	}


def build_watch_estimate_message(order_name: str, repair_item_name: str, notification_key: str = "watch_estimate_ready") -> dict:
	"""Build a watch-specific estimate WhatsApp message."""
	order = frappe.get_doc("DW Repair Order", order_name)
	customer = frappe.get_doc("Customer", order.customer)

	template = frappe.db.get_value(
		"DW WhatsApp Template",
		{"notification_key": notification_key, "is_active": 1},
		"message_body",
	)
	if not template:
		frappe.throw(f"No active WhatsApp template for key: {notification_key}")

	item = next((row for row in (order.items or []) if row.name == repair_item_name), None)
	if not item:
		frappe.throw("Repair item not found in this order")

	brand = str(item.watch_brand or "").strip()
	model = str(item.watch_model or "").strip()
	brand_display = frappe.db.get_value("DW Watch Brand", brand, "brand_name") if brand else ""
	model_display = frappe.db.get_value("DW Watch Model", model, "model_name") if model else ""
	brand_label = str(brand_display or brand).strip()
	model_label = str(model_display or model).strip()
	serial = str(item.serial_number or "").strip()
	watch_label = " ".join([value for value in [brand_label, model_label] if value]).strip() or item.name
	if serial:
		watch_label = f"{watch_label} (SN: {serial})"

	recommended_work = _normalize_string_list(getattr(item, "recommended_work", None))
	recommended_work_text = ", ".join(recommended_work) if recommended_work else "General diagnosis completed"
	diagnosis_summary = _normalize_string_list(getattr(item, "diagnosis_summary", None))
	diagnosis_summary_text = ", ".join(diagnosis_summary) if diagnosis_summary else "General diagnosis completed"

	item_key = str(getattr(item, "idx", "") or "")
	item_tasks = [
		task
		for task in (getattr(order, "all_tasks", []) or [])
		if str(getattr(task, "repair_item_key", "") or "") == item_key
	]
	item_parts = [
		part
		for part in (getattr(order, "all_parts", []) or [])
		if str(getattr(part, "repair_item_key", "") or "") == item_key
	]

	tasks_total = sum(_get_task_rate(task) for task in item_tasks)
	parts_total = sum(_get_part_rate(part) * float(part.quantity or 0) for part in item_parts)
	estimate_total = tasks_total + parts_total
	currency = frappe.db.get_default("currency") or frappe.defaults.get_global_default("currency") or "USD"
	estimate_total_text = frappe.utils.fmt_money(estimate_total, currency=currency)

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
		"{{3}}": str(item.status or order.status),
		"{{4}}": shop_name,
		"{{5}}": promised,
		"{{6}}": watch_label,
		"{{7}}": recommended_work_text,
		"{{8}}": estimate_total_text,
		"{{9}}": diagnosis_summary_text,
	}
	body = _replace_template_tokens(template, values)
	phone = normalize_phone(customer.mobile_no or "")

	return {
		"to": phone,
		"body": body,
		"customer_name": customer.customer_name,
		"phone_raw": customer.mobile_no,
		"watch_label": watch_label,
		"estimate_total": estimate_total_text,
		"recommended_work": recommended_work,
		"diagnosis_summary": diagnosis_summary,
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
			frappe.enqueue(
				"watch_doctor.whatsapp.service.send_whatsapp_message",
				log_name=log_name,
				queue="short",
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
			frappe.enqueue(
				"watch_doctor.whatsapp.service.send_whatsapp_message",
				log_name=log_name,
				queue="short",
			)
			return
		log.status = "Failed"
		log.error_detail = str(e)[:500]

	log.save(ignore_permissions=True)
	frappe.db.commit()
