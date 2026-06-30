import frappe
from frappe import _  # noqa: F401
import json
from frappe.utils import now_datetime

from watch_doctor.invoice_settings import (
	clear_invoice_settings_cache,
	get_invoice_workflow_options,
	get_invoice_workflow_settings,
	get_sales_invoice_print_context,
	validate_invoice_workflow_settings,
)

from watch_doctor.general_configuration import get_general_configuration, set_general_configuration

from watch_doctor.pos_enhancements import (
	apply_pos_profile,
	build_pos_print_url,
	get_pos_profile_settings,
)

from watch_doctor.permissions import (
    require_roles,
    can_access_repair_order,
    get_dw_roles,
    get_current_technician,
    get_current_technician_identifiers,
    ROLE_EXECUTIVE,
    ROLE_DATA_ENTRY,
    ROLE_TECHNICIAN,
    PRIVILEGED_ROLES,
)
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	WATCH_STATUS_COMPLETED,
	WATCH_STATUS_DIAGNOSED,
	WATCH_STATUS_IN_REPAIR,
	WATCH_STATUS_QUOTED,
	WATCH_STATUS_UNDER_DIAGNOSIS,
	normalize_repair_item_status,
	resolve_repair_item_diagnosis_status,
	resolve_repair_item_status,
)


# ==================== User Info ====================

@frappe.whitelist()
def get_user_info():
    """Return the current user's DW roles and linked technician record."""
    user = frappe.session.user
    dw_roles = get_dw_roles(user)

    technician = None
    if "technician" in dw_roles:
        tech_values = get_current_technician_identifiers(user)
        if tech_values:
            technician = frappe.db.get_value(
                "DW Technician",
                {"name": ["in", tech_values]},
				["name", "technician_name", "email"],
                as_dict=True,
            )

    return {
        "user": user,
        "roles": dw_roles,
        "technician": technician,
    }


# ==================== App Configuration ====================

@frappe.whitelist()
def get_app_config():
	"""Return app-level configuration: logo URL, currency symbol, decimal places."""
	from watch_doctor.pms import get_pms_runtime_configuration
	invoice_settings = get_invoice_workflow_settings()
	general_config = get_general_configuration()
	config = {
		"logo_url": "",
		"currency_code": "",
		"currency_symbol": "",
		"decimal_places": 0,
		"general_configuration": general_config,
		"repair_service_print_format": invoice_settings.get("repair_service_print_format") or "Standard",
		"pos_standard_print_format": invoice_settings.get("pos_standard_print_format") or "DW POS Retail Receipt",
		"pos_pms_print_format": invoice_settings.get("pos_pms_print_format") or "DW PMS Tax Invoice",
	}

	# Logo stored via frappe defaults (no schema change needed)
	try:
		logo = frappe.db.get_default("dw_logo_url", "watch_doctor")
		config["logo_url"] = logo or ""
	except Exception:
		pass

	# Default currency: prefer default Company currency, fall back to System Settings
	try:
		currency_code = None
		# Try default company first
		default_company = frappe.db.get_single_value("Global Defaults", "default_company")
		if default_company:
			currency_code = frappe.db.get_value("Company", default_company, "default_currency")
		# Fallback to System Settings
		if not currency_code:
			currency_code = frappe.db.get_single_value("System Settings", "currency")
		currency_code = currency_code or ""
		config["currency_code"] = currency_code
	except Exception:
		pass

	# Fetch symbol and decimal places from Currency doctype
	try:
		currency_row = frappe.db.get_value(
			"Currency", config["currency_code"],
			["symbol", "fraction_units"], as_dict=True
		)
		if currency_row:
			config["currency_symbol"] = currency_row.symbol or config["currency_code"]
			fraction_units = int(currency_row.fraction_units or 100)
			import math
			config["decimal_places"] = round(math.log10(fraction_units)) if fraction_units > 1 else 0
	except Exception:
		pass

	try:
		pms_runtime = get_pms_runtime_configuration()
		if not config["pos_pms_print_format"]:
			config["pos_pms_print_format"] = pms_runtime.get("pms_print_format") or "DW PMS Tax Invoice"
	except Exception:
		pass

	return config


def _log_settings_change(section: str, changes: dict):
	"""Record who changed which settings values for audit trail."""
	frappe.log_error(
		message=f"Settings changed by {frappe.session.user}: {changes}",
		title=f"DW Settings Change — {section}",
	)


@frappe.whitelist()
def get_invoice_workflow_configuration():
	"""Return centralized invoice workflow settings and selectable options."""
	require_roles(ROLE_EXECUTIVE)
	return {
		"config": get_invoice_workflow_settings(),
		"options": get_invoice_workflow_options(),
	}


@frappe.whitelist()
def save_invoice_workflow_configuration(
	repair_service_naming_series: str = "",
	repair_service_print_format: str = "",
	pos_standard_naming_series: str = "",
	pos_standard_print_format: str = "",
	pos_pms_naming_series: str = "",
	pos_pms_print_format: str = "",
	ro_label_print_format: str = "",
):
	"""Persist centralized naming series and print formats for invoice workflows."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.setup_invoice_settings import execute as ensure_invoice_settings_setup

	if not frappe.db.exists("DocType", "DW Invoice Settings"):
		ensure_invoice_settings_setup()

	config = {
		"repair_service_naming_series": repair_service_naming_series or "",
		"repair_service_print_format": repair_service_print_format or "",
		"pos_standard_naming_series": pos_standard_naming_series or "",
		"pos_standard_print_format": pos_standard_print_format or "",
		"pos_pms_naming_series": pos_pms_naming_series or "",
		"pos_pms_print_format": pos_pms_print_format or "",
		"ro_label_print_format": ro_label_print_format or "",
	}
	validate_invoice_workflow_settings(config)

	for fieldname, value in config.items():
		frappe.db.set_single_value("DW Invoice Settings", fieldname, value)

	if frappe.db.exists("DocType", "DW PMS Settings"):
		frappe.db.set_single_value("DW PMS Settings", "pms_print_format", config.get("pos_pms_print_format") or "")

	frappe.db.commit()
	clear_invoice_settings_cache()
	frappe.clear_cache()
	_log_settings_change("Invoice Workflow", config)
	return {"success": True, "config": get_invoice_workflow_settings()}


@frappe.whitelist()
def get_sales_invoice_print_context_api(invoice_name: str):
	"""Return workflow-aware print format metadata for a Sales Invoice."""
	return get_sales_invoice_print_context(invoice_name)


@frappe.whitelist()
def get_ro_label_print_format():
	"""Return the configured repair order label print format."""
	from watch_doctor.invoice_settings import get_ro_label_print_format
	return {"print_format": get_ro_label_print_format()}


@frappe.whitelist()
def save_logo_url(logo_url):
	"""Persist the app logo URL using frappe defaults."""
	require_roles(ROLE_EXECUTIVE)
	try:
		frappe.db.set_default("dw_logo_url", logo_url, "watch_doctor")
		frappe.db.commit()
		return {"success": True}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "save_logo_url error")
		return {"success": False, "error": str(e)}


def rename_and_sync_print_format(old_name, new_name, file_path):
	"""Rename a Print Format if needed and overwrite its HTML from an exported JSON fixture."""
	with open(file_path, "r", encoding="utf-8") as handle:
		payload = json.load(handle)

	if old_name != new_name and frappe.db.exists("Print Format", old_name) and not frappe.db.exists("Print Format", new_name):
		frappe.rename_doc("Print Format", old_name, new_name, force=True, ignore_permissions=True)

	doc = frappe.get_doc("Print Format", new_name)
	incoming_html = (payload.get("html") or "").strip()
	if doc.html and doc.html.strip() != incoming_html:
		frappe.log_error(
			f"Print Format '{new_name}' had local customizations that were overwritten by the app fixture.",
			"DW Print Format Overwrite Warning",
		)
	doc.html = incoming_html
	doc.save(ignore_permissions=True)
	frappe.db.commit()
	frappe.clear_cache()

	return {
		"name": doc.name,
		"modified": doc.modified,
	}


@frappe.whitelist()
def get_general_configuration_api():
	"""Return editable general company information for the Settings UI."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.setup_general_configuration import execute as ensure_general_configuration_setup

	if not frappe.db.exists("DocType", "DW General Configuration"):
		ensure_general_configuration_setup()

	return {"config": get_general_configuration()}


@frappe.whitelist()
def save_general_configuration(
	company_name: str = "",
	company_phone: str = "",
	company_email: str = "",
	company_website: str = "",
	company_address: str = "",
	cr_number: str = "",
	vat_registration_number: str = "",
	repair_receipt_subtitle: str = "",
	whatsapp_default_country_code: str = "",
):
	"""Persist editable general company information used in print formats."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.setup_general_configuration import execute as ensure_general_configuration_setup

	if not frappe.db.exists("DocType", "DW General Configuration"):
		ensure_general_configuration_setup()

	config = {
		"company_name": company_name or "",
		"company_phone": company_phone or "",
		"company_email": company_email or "",
		"company_website": company_website or "",
		"company_address": company_address or "",
		"cr_number": cr_number or "",
		"vat_registration_number": vat_registration_number or "",
		"repair_receipt_subtitle": repair_receipt_subtitle or "",
		"whatsapp_default_country_code": whatsapp_default_country_code or "",
	}

	result = set_general_configuration(config)
	_log_settings_change("General Configuration", config)
	return {"success": True, "config": result}


@frappe.whitelist()
def get_pms_configuration():
	"""Return editable PMS/VAT configuration and option lists for the Settings UI."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.pms import get_pms_runtime_configuration

	company = _get_default_company()
	config = get_pms_runtime_configuration()
	invoice_settings = get_invoice_workflow_settings()
	config["pms_print_format"] = invoice_settings.get("pos_pms_print_format") or config.get("pms_print_format") or ""

	item_groups = frappe.get_all(
		"Item Group",
		filters={"is_group": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=500,
	)
	tax_accounts = frappe.get_all(
		"Account",
		filters={"company": company, "account_type": "Tax", "is_group": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=500,
	)
	sales_taxes_templates = frappe.get_all(
		"Sales Taxes and Charges Template",
		filters={"disabled": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=500,
	)
	item_tax_templates = frappe.get_all(
		"Item Tax Template",
		pluck="name",
		order_by="name asc",
		limit_page_length=500,
	)
	print_formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": "Sales Invoice", "disabled": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=200,
	)

	return {
		"config": config,
		"options": {
			"item_groups": item_groups,
			"tax_accounts": tax_accounts,
			"sales_taxes_templates": sales_taxes_templates,
			"item_tax_templates": item_tax_templates,
			"print_formats": print_formats,
		},
	}


@frappe.whitelist()
def save_pms_configuration(
	pms_enabled: int = 0,
	pms_item_group: str = "",
	pms_vat_account: str = "",
	pms_disclaimer: str = "",
	standard_sales_taxes_template: str = "",
	standard_item_tax_template: str = "",
	pms_print_format: str = "",
	pms_vat_divisor: float = 0,
):
	"""Persist editable PMS/VAT configuration from the Settings UI."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.pms import clear_pms_runtime_configuration_cache
	from watch_doctor.setup_pms import execute as ensure_pms_setup
	from watch_doctor.setup_invoice_settings import execute as ensure_invoice_settings_setup

	if not frappe.db.exists("DocType", "DW PMS Settings"):
		ensure_pms_setup()
	if not frappe.db.exists("DocType", "DW Invoice Settings"):
		ensure_invoice_settings_setup()

	validators = [
		("Item Group", pms_item_group),
		("Account", pms_vat_account),
		("Sales Taxes and Charges Template", standard_sales_taxes_template),
		("Item Tax Template", standard_item_tax_template),
		("Print Format", pms_print_format),
	]
	for doctype, value in validators:
		if value and not frappe.db.exists(doctype, value):
			frappe.throw(f"{doctype} {value} does not exist")

	if pms_enabled and float(pms_vat_divisor or 0) <= 0:
		frappe.throw("PMS VAT Divisor must be greater than zero")
	if pms_enabled and float(pms_vat_divisor or 0) < 5:
		frappe.throw(
			"PMS VAT Divisor seems unusually low (less than 5). "
			"For Bahrain's standard 10% VAT, the divisor is typically 11. Verify your entry."
		)

	if pms_enabled:
		missing_fields = []
		for value, label in [
			(pms_item_group, "PMS Item Group"),
			(pms_vat_account, "PMS VAT Account"),
			(pms_disclaimer, "PMS Disclaimer"),
			(standard_sales_taxes_template, "Standard Sales Taxes Template"),
			(standard_item_tax_template, "Standard Item Tax Template"),
			(pms_print_format, "PMS Print Format"),
		]:
			if not value:
				missing_fields.append(label)
		if missing_fields:
			frappe.throw(
				"Profit Margin Scheme cannot be enabled until all PMS/VAT settings are configured. "
				f"Missing fields: {', '.join(missing_fields)}."
			)

	frappe.db.set_single_value("DW PMS Settings", "pms_enabled", 1 if int(pms_enabled) else 0)
	frappe.db.set_single_value("DW PMS Settings", "pms_item_group", pms_item_group or "")
	frappe.db.set_single_value("DW PMS Settings", "pms_vat_account", pms_vat_account or "")
	frappe.db.set_single_value("DW PMS Settings", "standard_sales_taxes_template", standard_sales_taxes_template or "")
	frappe.db.set_single_value("DW PMS Settings", "standard_item_tax_template", standard_item_tax_template or "")
	frappe.db.set_single_value("DW PMS Settings", "pms_print_format", pms_print_format or "")
	frappe.db.set_single_value("DW PMS Settings", "pms_vat_divisor", float(pms_vat_divisor or 0))
	frappe.db.set_single_value("DW Invoice Settings", "pos_pms_print_format", pms_print_format or "")
	frappe.db.set_single_value(
		"DW PMS Settings",
		"pms_disclaimer",
		pms_disclaimer or "",
	)

	frappe.db.commit()
	clear_pms_runtime_configuration_cache()
	clear_invoice_settings_cache()
	frappe.clear_cache()
	_log_settings_change("PMS Configuration", {
		"pms_enabled": pms_enabled,
		"pms_item_group": pms_item_group,
		"pms_vat_account": pms_vat_account,
		"pms_vat_divisor": pms_vat_divisor,
		"pms_print_format": pms_print_format,
	})
	return {"success": True, "config": get_pms_configuration()["config"]}


MOVEMENT_TYPE_VALUES = {
	"quartz movement",
	"automatic movement",
	"manual-wind movement",
	"chronograph movement",
	"gmt movement",
	"day-date movement",
	"moonphase movement",
	"co-axial movement",
	"solar movement",
	"kinetic movement",
	"eco-drive movement",
	"mecha-quartz movement",
	"vintage movement",
	"swiss movement",
	"japanese movement",
}


def normalize_string_list(value):
	if isinstance(value, list):
		result = []
		for entry in value:
			text = str(entry or "").strip()
			if text and text not in result:
				result.append(text)
		return result
	if isinstance(value, str):
		trimmed = value.strip()
		if not trimmed:
			return []
		try:
			parsed = json.loads(trimmed)
			if isinstance(parsed, list):
				return normalize_string_list(parsed)
		except Exception:
			pass
		return [trimmed]
	return []


def is_likely_caliber_code(value):
	trimmed = str(value or "").strip()
	if not trimmed:
		return False
	return bool(any(char.isdigit() for char in trimmed) and frappe.safe_decode(trimmed) and __import__("re").match(r"^[A-Za-z0-9.-]+(?: [A-Za-z0-9.-]+)?$", trimmed))


def split_legacy_movement_information(values):
	movement_type = []
	movement_caliber = []

	for entry in normalize_string_list(values):
		lowered = entry.lower()
		if lowered in MOVEMENT_TYPE_VALUES:
			movement_type.append(entry)
		elif is_likely_caliber_code(entry):
			movement_caliber.append(entry)

	return {
		"movement_type": normalize_string_list(movement_type),
		"movement_caliber": normalize_string_list(movement_caliber),
	}


def combine_movement_information(movement_type, movement_caliber):
	return normalize_string_list([
		*normalize_string_list(movement_type),
		*normalize_string_list(movement_caliber),
	])


DIAGNOSIS_MANUAL_STATUSES = {"Not Repairable", "Awaiting Approval", "Quoted", "Declined"}
VALID_DIAGNOSIS_STATUSES = {"Pending Diagnosis", "Diagnosed", "Not Repairable", "Awaiting Approval", "Quoted", "Declined"}


def has_diagnosis_content(diagnosis_summary=None, movement_type=None, movement_caliber=None, recommended_work=None):
	return any([
		normalize_string_list(diagnosis_summary),
		normalize_string_list(movement_type),
		normalize_string_list(movement_caliber),
		normalize_string_list(recommended_work),
	])


def resolve_diagnosis_status(current_status, diagnosis_summary=None, movement_type=None, movement_caliber=None, recommended_work=None):
	if not has_diagnosis_content(diagnosis_summary, movement_type, movement_caliber, recommended_work):
		return "Pending Diagnosis"

	status = str(current_status or "").strip()
	if status in DIAGNOSIS_MANUAL_STATUSES:
		return status

	return "Diagnosed"


def resolve_task_template_name(task_value, create_missing=False, description=None):
	task_value = str(task_value or "").strip()
	if not task_value:
		return None

	if frappe.db.exists("DW Task Template", task_value):
		return task_value

	match = frappe.db.sql(
		"""
		select name
		from `tabDW Task Template`
		where lower(task_name) = lower(%s)
		limit 1
		""",
		(task_value,),
		as_dict=True,
	)
	if match:
		return match[0].name

	if create_missing:
		try:
			task_doc = frappe.get_doc({
				"doctype": "DW Task Template",
				"task_name": task_value,
				"description": (description or "").strip() or None,
			})
			task_doc.insert(ignore_permissions=True)
			return task_doc.name
		except Exception:
			# Handle duplicate creation races by re-resolving after insert failure.
			retry_match = frappe.db.sql(
				"""
				select name
				from `tabDW Task Template`
				where lower(task_name) = lower(%s)
				limit 1
				""",
				(task_value,),
				as_dict=True,
			)
			if retry_match:
				return retry_match[0].name

	return None


def get_auto_task_services_for_item(item):
	recommended_work = normalize_string_list(item.get("recommended_work"))
	resolved_services = []
	seen = set()
	recommended_descriptions = {}

	if recommended_work:
		normalized_recommended = [value.lower() for value in recommended_work]
		description_rows = frappe.db.sql(
			"""
			select work_name, description
			from `tabDW Recommended Work Template`
			where lower(work_name) in ({placeholders})
			""".format(placeholders=", ".join(["%s"] * len(recommended_work))),
			tuple(normalized_recommended),
			as_dict=True,
		)
		recommended_descriptions = {
			str((row.get("work_name") or "")).strip().lower(): row.get("description")
			for row in description_rows
		}

	if recommended_work:
		candidates = recommended_work
	else:
		candidates = []
		for issue in item.get("issues") or []:
			issue_name = issue.get("issue") if hasattr(issue, "get") else None
			if not issue_name:
				continue
			suggested_task = frappe.db.get_value("DW Issue Template", issue_name, "suggested_task")
			if suggested_task:
				candidates.append(suggested_task)

	for candidate in candidates:
		candidate_value = str(candidate or "").strip()
		if not candidate_value:
			continue
		service_name = resolve_task_template_name(
			candidate_value,
			create_missing=bool(recommended_work),
			description=recommended_descriptions.get(candidate_value.lower()),
		)
		if not service_name or service_name in seen:
			continue
		seen.add(service_name)
		resolved_services.append(service_name)

	return resolved_services


def sync_item_tasks_with_auto_sources(order_doc, item):
	service_names = get_auto_task_services_for_item(item)
	technician = str(item.get("technician") or "").strip()
	item_key = str(item.idx)

	existing_tasks_by_service = {}
	manual_tasks_for_item = []
	for task in (order_doc.all_tasks or []):
		if str(task.repair_item_key) != item_key:
			continue
		if int(task.is_manual or 0):
			manual_tasks_for_item.append(task)
			continue
		service_name = str(task.service or "").strip()
		if service_name and service_name not in existing_tasks_by_service:
			existing_tasks_by_service[service_name] = task

	remaining_tasks = [task for task in (order_doc.all_tasks or []) if str(task.repair_item_key) != item_key]
	order_doc.set("all_tasks", [])
	for task in remaining_tasks:
		order_doc.append("all_tasks", {
			"repair_item_key": task.repair_item_key,
			"service": task.service,
			"technician": task.technician,
			"notes": task.notes,
			"status": task.status,
			"rate": task.rate,
			"auto_rate": task.auto_rate,
			"price_manually_set": task.price_manually_set,
			"is_manual": int(task.is_manual or 0),
		})

	# Re-add manual tasks first (they are always preserved unchanged)
	for task in manual_tasks_for_item:
		order_doc.append("all_tasks", {
			"repair_item_key": item_key,
			"service": task.service,
			"technician": task.technician,
			"notes": task.notes,
			"status": task.status,
			"rate": task.rate,
			"auto_rate": task.auto_rate,
			"price_manually_set": task.price_manually_set,
			"is_manual": 1,
		})

	for service_name in service_names:
		existing_task = existing_tasks_by_service.get(service_name)
		order_doc.append("all_tasks", {
			"repair_item_key": item_key,
			"service": service_name,
			"technician": technician or (existing_task.technician if existing_task else ""),
			"notes": existing_task.notes if existing_task else "",
			"status": (existing_task.status if existing_task else "Pending") or "Pending",
			"rate": existing_task.rate if existing_task else None,
			"auto_rate": existing_task.auto_rate if existing_task else None,
			"price_manually_set": existing_task.price_manually_set if existing_task else 0,
			"is_manual": 0,
		})

	return service_names


@frappe.whitelist()
def save_repair_order(doc_json):
	"""Custom save method for repair orders that handles system fields properly."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	doc_dict = json.loads(doc_json) if isinstance(doc_json, str) else doc_json

	# Technicians may only update orders they are assigned to
	if doc_dict.get('name'):
		if not can_access_repair_order(doc_dict['name']):
			frappe.throw(_("You do not have access to this repair order"), frappe.PermissionError)

		# Optimistic locking: reject the save if another session already saved a newer version
		client_modified = str(doc_dict.get('modified') or '').strip()
		if client_modified:
			db_modified = str(
				frappe.db.get_value('DW Repair Order', doc_dict['name'], 'modified') or ''
			).strip()
			if db_modified and client_modified != db_modified:
				frappe.throw(
					_("This order was modified by another user while you were editing. "
					  "Please reload the page and re-apply your changes."),
					title=_("Save Conflict"),
				)
	
	# Remove system fields recursively.
	# `modified` is kept on the ROOT doc for optimistic-locking; strip it only from child rows.
	def clean_dict(d, is_root=False):
		if isinstance(d, dict):
			keys_to_remove = ['creation', 'modified_by', 'owner', 'simple_description',
			                  'docstatus', '__islocal', '__unsaved', '__onload']
			if not is_root:
				keys_to_remove.append('modified')
			for key in keys_to_remove:
				d.pop(key, None)
			for key, value in d.items():
				if isinstance(value, dict):
					clean_dict(value, is_root=False)
				elif isinstance(value, list):
					for item in value:
						if isinstance(item, dict):
							clean_dict(item, is_root=False)
		return d

	doc_dict = clean_dict(doc_dict, is_root=True)
	
	# Debug: log what we received
	frappe.logger().info(f"=== save_repair_order called ===")
	frappe.logger().info(f"Order: {doc_dict.get('name', 'NEW')}")
	for idx, item in enumerate(doc_dict.get('items', [])):
		frappe.logger().info(f"Item {idx}: technician={item.get('technician')}, status={item.get('status')}")
	
	# Auto-update item statuses based on technician assignment BEFORE merging with doc
	# This ensures the status change is included in the update
	for item in doc_dict.get('items', []):
		item['pre_existing_condition'] = json.dumps(normalize_string_list(item.get('pre_existing_condition')))
		diagnosis_summary = normalize_string_list(item.get('diagnosis_summary'))
		item['diagnosis_summary'] = json.dumps(diagnosis_summary)
		legacy_movement_information = normalize_string_list(item.get('movement_information'))
		movement_type = normalize_string_list(item.get('movement_type'))
		movement_caliber = normalize_string_list(item.get('movement_caliber'))
		recommended_work = normalize_string_list(item.get('recommended_work'))
		if not movement_type and not movement_caliber and legacy_movement_information:
			split_movement = split_legacy_movement_information(legacy_movement_information)
			movement_type = split_movement['movement_type']
			movement_caliber = split_movement['movement_caliber']
		incoming_status = str(item.get('diagnosis_status') or '').strip()
		if incoming_status and incoming_status not in VALID_DIAGNOSIS_STATUSES:
			frappe.throw(_("Invalid diagnosis status"))
		item['diagnosis_status'] = resolve_diagnosis_status(
			incoming_status,
			diagnosis_summary=diagnosis_summary,
			movement_type=movement_type,
			movement_caliber=movement_caliber,
			recommended_work=recommended_work,
		)
		item['movement_type'] = json.dumps(movement_type)
		item['movement_caliber'] = json.dumps(movement_caliber)
		item['movement_information'] = json.dumps(combine_movement_information(movement_type, movement_caliber))
		item['recommended_work'] = json.dumps(recommended_work)
		item['status'] = resolve_repair_item_status(
			current_status=item.get('status'),
			diagnosis_status=item['diagnosis_status'],
			technician=item.get('technician'),
			recommended_work=recommended_work,
			task_statuses=[task.get('status') for task in (item.get('tasks') or [])],
		)
		item['diagnosis_status'] = resolve_repair_item_diagnosis_status(
			item['status'],
			current_diagnosis_status=item['diagnosis_status'],
			has_diagnosis_content=has_diagnosis_content(
				diagnosis_summary,
				movement_type,
				movement_caliber,
				recommended_work,
			),
		)

	# Flatten nested structures (tasks, parts, issues) from items into the main doc tables
	# This is necessary because frontend uses nested structure but backend uses flat tables linked by repair_item_key
	all_tasks = []
	all_parts = []
	all_issues = []

	def ensure_other_issue_template():
		"""Return a valid DW Issue Template name for the generic Other issue."""
		if frappe.db.exists("DW Issue Template", "Other"):
			return "Other"
		existing_other = frappe.db.sql(
			"""
			select name
			from `tabDW Issue Template`
			where lower(issue_name) = 'other'
			limit 1
			""",
			as_dict=True,
		)
		if existing_other:
			return existing_other[0].name
		other_doc = frappe.get_doc({
			"doctype": "DW Issue Template",
			"issue_name": "Other",
			"description": "Generic issue placeholder for custom complaints",
			"is_active": 1,
		})
		other_doc.insert(ignore_permissions=True)
		return other_doc.name

	def resolve_issue_template_name(raw_issue):
		"""Resolve an issue label or name into a valid DW Issue Template name."""
		if not raw_issue:
			return None
		issue_value = str(raw_issue).strip()
		if not issue_value:
			return None
		if frappe.db.exists("DW Issue Template", issue_value):
			return issue_value
		by_issue_name = frappe.db.sql(
			"""
			select name
			from `tabDW Issue Template`
			where lower(issue_name) = lower(%s)
			limit 1
			""",
			(issue_value,),
			as_dict=True,
		)
		if by_issue_name:
			return by_issue_name[0].name
		return None
	
	for i, item in enumerate(doc_dict.get('items', [])):
		item_key = str(i + 1)
		
		# Process Tasks
		if item.get('tasks'):
			for task in item['tasks']:
				task['repair_item_key'] = item_key
				all_tasks.append(task)
		
		# Process Parts
		if item.get('parts_used'):
			for part in item['parts_used']:
				part['repair_item_key'] = item_key
				all_parts.append(part)
				
		# Process Issues
		if item.get('issues'):
			for issue in item['issues']:
				raw_issue = issue.get('issue')
				is_other = bool(issue.get('is_other'))
				if is_other or (str(raw_issue or '').strip().lower() == 'other'):
					# Child doctype requires a valid Link value even for custom "Other" entries.
					issue['issue'] = ensure_other_issue_template()
					issue['is_other'] = 1
				else:
					resolved_name = resolve_issue_template_name(raw_issue)
					if resolved_name:
						issue['issue'] = resolved_name
				issue['repair_item_key'] = item_key
				all_issues.append(issue)
				
	doc_dict['all_tasks'] = all_tasks
	doc_dict['all_parts'] = all_parts
	doc_dict['all_issues'] = all_issues
	
	# Auto-update task statuses when parts are added
	# Group parts by task
	parts_by_task = {}
	for part in doc_dict.get('all_parts', []):
		task_name = part.get('task')
		if task_name:
			if task_name not in parts_by_task:
				parts_by_task[task_name] = []
			parts_by_task[task_name].append(part)
	
	# Update task status from Pending to In Progress if it has parts
	for task in doc_dict.get('all_tasks', []):
		task_name = task.get('name')
		if task_name and task_name in parts_by_task and task.get('status') == 'Pending':
			frappe.logger().info(f"Updating task {task_name} status from Pending to In Progress (has parts)")
			task['status'] = 'In Progress'

	# Re-resolve item workflow status after task auto-updates.
	tasks_by_item = {}
	for task in doc_dict.get('all_tasks', []):
		item_key = str(task.get('repair_item_key') or '')
		if not item_key:
			continue
		tasks_by_item.setdefault(item_key, []).append(task)

	for index, item in enumerate(doc_dict.get('items', []), start=1):
		item_key = str(index)
		item_tasks = tasks_by_item.get(item_key, [])
		recommended_work = normalize_string_list(item.get('recommended_work'))
		diagnosis_summary = normalize_string_list(item.get('diagnosis_summary'))
		movement_type = normalize_string_list(item.get('movement_type'))
		movement_caliber = normalize_string_list(item.get('movement_caliber'))
		item['status'] = resolve_repair_item_status(
			current_status=item.get('status'),
			diagnosis_status=item.get('diagnosis_status'),
			technician=item.get('technician'),
			recommended_work=recommended_work,
			task_statuses=[task.get('status') for task in item_tasks],
		)
		item['diagnosis_status'] = resolve_repair_item_diagnosis_status(
			item['status'],
			current_diagnosis_status=item.get('diagnosis_status'),
			has_diagnosis_content=has_diagnosis_content(
				diagnosis_summary,
				movement_type,
				movement_caliber,
				recommended_work,
			),
		)
	
	# Auto-update order status based on item statuses
	item_statuses = [normalize_repair_item_status(item.get('status')) for item in doc_dict.get('items', [])]
	if item_statuses:
		if all(status in {WATCH_STATUS_COMPLETED, 'Delivered'} for status in item_statuses):
			doc_dict['status'] = 'Repaired'
		elif any(status == WATCH_STATUS_APPROVAL_FOR_ESTIMATE for status in item_statuses):
			doc_dict['status'] = WATCH_STATUS_APPROVAL_FOR_ESTIMATE
		elif any(status in {
			WATCH_STATUS_UNDER_DIAGNOSIS,
			WATCH_STATUS_DIAGNOSED,
			WATCH_STATUS_QUOTED,
			WATCH_STATUS_IN_REPAIR,
			WATCH_STATUS_COMPLETED,
		} for status in item_statuses):
			doc_dict['status'] = 'In Progress'
		else:
			doc_dict['status'] = 'Pending'
	
	# Guard: order must have at least one watch
	if not doc_dict.get('items'):
		frappe.throw(_("A repair order must contain at least one watch."))

	# Promised date must not be before the received date
	received = doc_dict.get('received_date') or ''
	promised = doc_dict.get('promised_delivery_date') or ''
	if received and promised and promised < received:
		frappe.throw(_("Promised delivery date cannot be before the received date."))

	# Get or create document
	if doc_dict.get('name'):
		# Update existing
		doc = frappe.get_doc('DW Repair Order', doc_dict['name'])
		doc.update(doc_dict)
	else:
		# Create new
		doc = frappe.get_doc(doc_dict)

	# Keep repair tasks auto-managed from recommended work / issue suggestions,
	# including fallback task-template creation for new recommended work names.
	for item in doc.items or []:
		sync_item_tasks_with_auto_sources(doc, item)

	# Recompute item and order statuses after auto-sync.
	for item in doc.items or []:
		recommended_work = normalize_string_list(item.get('recommended_work'))
		diagnosis_summary = normalize_string_list(item.get('diagnosis_summary'))
		movement_type = normalize_string_list(item.get('movement_type'))
		movement_caliber = normalize_string_list(item.get('movement_caliber'))
		item_task_statuses = [
			task.status
			for task in (doc.all_tasks or [])
			if str(task.repair_item_key) == str(item.idx)
		]
		item.status = resolve_repair_item_status(
			current_status=item.status,
			diagnosis_status=item.diagnosis_status,
			technician=item.technician,
			recommended_work=recommended_work,
			task_statuses=item_task_statuses,
		)
		item.diagnosis_status = resolve_repair_item_diagnosis_status(
			item.status,
			current_diagnosis_status=item.diagnosis_status,
			has_diagnosis_content=has_diagnosis_content(
				diagnosis_summary,
				movement_type,
				movement_caliber,
				recommended_work,
			),
		)

	item_statuses = [normalize_repair_item_status(item.status) for item in (doc.items or [])]
	if item_statuses:
		if all(status in {WATCH_STATUS_COMPLETED, 'Delivered'} for status in item_statuses):
			doc.status = 'Repaired'
		elif any(status == WATCH_STATUS_APPROVAL_FOR_ESTIMATE for status in item_statuses):
			doc.status = WATCH_STATUS_APPROVAL_FOR_ESTIMATE
		elif any(status in {
			WATCH_STATUS_UNDER_DIAGNOSIS,
			WATCH_STATUS_DIAGNOSED,
			WATCH_STATUS_QUOTED,
			WATCH_STATUS_IN_REPAIR,
			WATCH_STATUS_COMPLETED,
		} for status in item_statuses):
			doc.status = 'In Progress'
		else:
			doc.status = 'Pending'
	
	doc.save()
	frappe.db.commit()

	# Reload to get all child tables populated
	doc.reload()

	frappe.logger().info(f"After save: order status={doc.status}")
	for item in doc.items:
		frappe.logger().info(f"After save: item {item.idx} status={item.status}, technician={item.technician}")

	# Auto-fire WhatsApp notification when order enters "Create Estimate" status.
	# Wrapped in try/except so a WhatsApp misconfiguration never blocks a save.
	try:
		if doc.status == WATCH_STATUS_APPROVAL_FOR_ESTIMATE and frappe.conf.get("whatsapp_enabled"):
			from watch_doctor.whatsapp.api import notify_customer
			notify_customer(doc.name)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Auto-notify Create Estimate failed (non-blocking)")

	return doc.as_dict()


@frappe.whitelist()
def update_repair_item_diagnosis(item_name, diagnosis_json):
	"""Update diagnosis fields for a single repair item with item-level technician checks."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	diagnosis = json.loads(diagnosis_json) if isinstance(diagnosis_json, str) else (diagnosis_json or {})

	item_row = frappe.db.get_value(
		"DW Repair Item",
		item_name,
		["name", "parent", "technician"],
		as_dict=True,
	)
	if not item_row:
		frappe.throw(_("Repair item not found"), frappe.DoesNotExistError)

	if not can_access_repair_order(item_row.parent):
		frappe.throw(_("You do not have access to this repair order"), frappe.PermissionError)

	roles = set(frappe.get_roles())
	is_privileged = bool(roles & PRIVILEGED_ROLES)
	if not is_privileged and ROLE_TECHNICIAN in roles:
		tech_values = set(get_current_technician_identifiers())
		if not tech_values or (item_row.technician or "") not in tech_values:
			frappe.throw(_("You can only update diagnosis for watches assigned to you"), frappe.PermissionError)

	allowed_fields = {
		"diagnosis_status",
		"diagnosis_summary",
		"movement_type",
		"movement_caliber",
		"movement_information",
		"recommended_work",
	}
	for key in diagnosis.keys():
		if key not in allowed_fields:
			frappe.throw(_("Field {0} is not allowed in diagnosis update").format(key), frappe.PermissionError)

	incoming_status = str(diagnosis.get("diagnosis_status") or "").strip()
	if incoming_status and incoming_status not in VALID_DIAGNOSIS_STATUSES:
		frappe.throw(_("Invalid diagnosis status"))

	order_doc = frappe.get_doc("DW Repair Order", item_row.parent)
	target_item = next((item for item in order_doc.items if item.name == item_name), None)
	if not target_item:
		frappe.throw(_("Repair item not found in parent order"), frappe.DoesNotExistError)

	diagnosis_summary = normalize_string_list(diagnosis.get("diagnosis_summary"))
	target_item.diagnosis_summary = json.dumps(diagnosis_summary)
	legacy_movement_information = normalize_string_list(diagnosis.get("movement_information"))
	movement_type = normalize_string_list(diagnosis.get("movement_type"))
	movement_caliber = normalize_string_list(diagnosis.get("movement_caliber"))
	if not movement_type and not movement_caliber and legacy_movement_information:
		split_movement = split_legacy_movement_information(legacy_movement_information)
		movement_type = split_movement["movement_type"]
		movement_caliber = split_movement["movement_caliber"]
	target_item.movement_type = json.dumps(movement_type)
	target_item.movement_caliber = json.dumps(movement_caliber)
	target_item.movement_information = json.dumps(combine_movement_information(movement_type, movement_caliber))
	recommended_work = normalize_string_list(diagnosis.get("recommended_work"))
	target_item.recommended_work = json.dumps(recommended_work)
	sync_item_tasks_with_auto_sources(order_doc, target_item)
	resolved_diagnosis_status = resolve_diagnosis_status(
		incoming_status,
		diagnosis_summary=diagnosis_summary,
		movement_type=movement_type,
		movement_caliber=movement_caliber,
		recommended_work=recommended_work,
	)

	has_content = has_diagnosis_content(
		target_item.diagnosis_summary,
		target_item.movement_type,
		target_item.movement_caliber,
		target_item.recommended_work,
	)
	item_task_statuses = [
		task.status
		for task in (order_doc.all_tasks or [])
		if str(task.repair_item_key) == str(target_item.idx)
	]
	target_item.status = resolve_repair_item_status(
		current_status=target_item.status,
		diagnosis_status=resolved_diagnosis_status,
		technician=target_item.technician,
		recommended_work=recommended_work,
		task_statuses=item_task_statuses,
	)
	target_item.diagnosis_status = resolve_repair_item_diagnosis_status(
		target_item.status,
		current_diagnosis_status=resolved_diagnosis_status,
		has_diagnosis_content=has_content,
	)

	if has_content:
		target_item.diagnosis_date = now_datetime()
		if ROLE_TECHNICIAN in roles and not is_privileged:
			current_technician = get_current_technician()
			if current_technician:
				target_item.diagnosed_by = current_technician
	elif is_privileged:
		target_item.diagnosed_by = None
		target_item.diagnosis_date = None

	order_doc.save()
	frappe.db.commit()

	return {
		"item_name": target_item.name,
		"diagnosis_status": target_item.diagnosis_status,
		"diagnosis_summary": normalize_string_list(target_item.diagnosis_summary),
		"movement_type": normalize_string_list(target_item.movement_type),
		"movement_caliber": normalize_string_list(target_item.movement_caliber),
		"movement_information": normalize_string_list(target_item.movement_information),
		"recommended_work": normalize_string_list(target_item.recommended_work),
		"diagnosed_by": target_item.diagnosed_by,
		"diagnosis_date": target_item.diagnosis_date,
	}




@frappe.whitelist()
def list_repair_orders(
	start: int = 0,
	limit_page_length: int = 100,
	search: str = "",
	status: str = "All",
	include_total: int = 0,
):
	"""Return lightweight repair order list with customer display."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)

	# Keep page size bounded to protect API performance.
	try:
		start = max(0, int(start or 0))
	except (TypeError, ValueError):
		start = 0
	try:
		limit_page_length = int(limit_page_length or 100)
	except (TypeError, ValueError):
		limit_page_length = 100
	limit_page_length = max(1, min(limit_page_length, 500))
	search = (search or "").strip()
	status = (status or "All").strip()
	include_total = int(include_total or 0)

	# Technicians: only orders assigned to them
	roles = set(frappe.get_roles())
	extra_filters = {}
	if not (roles & PRIVILEGED_ROLES) and ROLE_TECHNICIAN in roles:
		tech_values = get_current_technician_identifiers()
		if tech_values:
			assigned_orders = frappe.get_all(
				"DW Repair Item",
				filters={"technician": ["in", tech_values]},
				fields=["parent"],
				distinct=True,
			)
			order_names = [r.parent for r in assigned_orders]
			if not order_names:
				return []
			extra_filters["name"] = ["in", order_names]
		else:
			return []

	where_clauses = ["1=1"]
	query_values = {
		"start": start,
		"limit": limit_page_length,
	}

	if "name" in extra_filters and extra_filters["name"][0] == "in":
		where_clauses.append("o.name IN %(order_names)s")
		query_values["order_names"] = tuple(extra_filters["name"][1])

	if status and status != "All":
		where_clauses.append("o.status = %(status)s")
		query_values["status"] = status

	if search:
		where_clauses.append("""
			(
				o.name LIKE %(needle)s
				OR IFNULL(o.reference_number, '') LIKE %(needle)s
				OR IFNULL(o.customer, '') LIKE %(needle)s
				OR IFNULL(c.customer_name, '') LIKE %(needle)s
				OR IFNULL(c.mobile_no, '') LIKE %(needle)s
			)
		""")
		query_values["needle"] = f"%{search}%"

	orders = frappe.db.sql(
		f"""
			SELECT
				o.name,
				o.customer,
				o.reference_number,
				o.status,
				o.priority,
				o.received_date,
				c.customer_name,
				c.mobile_no AS customer_mobile
			FROM `tabDW Repair Order` o
			LEFT JOIN `tabCustomer` c ON c.name = o.customer
			WHERE {' AND '.join(where_clauses)}
			ORDER BY o.modified DESC
			LIMIT %(limit)s OFFSET %(start)s
		""",
		query_values,
		as_dict=True,
	)

	total_count = None
	if include_total:
		# Build a separate values dict for COUNT — strip LIMIT/OFFSET keys which
		# have no placeholders in the COUNT SQL (passing unused keys causes pymysql
		# "not all arguments converted" error).
		count_values = {k: v for k, v in query_values.items() if k not in ("start", "limit")}
		count_sql = f"""
			SELECT COUNT(*) as count
			FROM `tabDW Repair Order` o
			LEFT JOIN `tabCustomer` c ON c.name = o.customer
			WHERE {' AND '.join(where_clauses)}
		"""
		# Only pass values when there are actual filter params; passing an empty
		# dict to pymysql still triggers substitution and errors on plain SQL.
		if count_values:
			count_rows = frappe.db.sql(count_sql, count_values, as_dict=True)
		else:
			count_rows = frappe.db.sql(count_sql, as_dict=True)
		total_count = count_rows[0].get("count", 0) if count_rows else 0

	order_names = [o.name for o in orders]
	item_count_map = {}
	if order_names:
		item_counts = frappe.db.sql(
			"""
				SELECT parent, COUNT(name) AS item_count
				FROM `tabDW Repair Item`
				WHERE parent IN %(order_names)s
				GROUP BY parent
			""",
			{"order_names": tuple(order_names)},
			as_dict=True,
		)
		item_count_map = {row.parent: int(row.item_count or 0) for row in item_counts}

	for o in orders:
		o["customer_name"] = o.get("customer_name") or o.get("customer")
		o["customer_mobile"] = o.get("customer_mobile") or ""
		o["item_count"] = item_count_map.get(o.name, 0)

	if include_total:
		return {
			"orders": orders,
			"total_count": int(total_count or 0),
		}

	return orders


@frappe.whitelist()
def search_customers(txt: str = ""):
	"""Search customers by name."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	filters = []
	or_filters = []
	if txt:
		needle = f"%{txt}%"
		or_filters = [
			["customer_name", "like", needle],
			["mobile_no", "like", needle],
			["name", "like", needle]
		]

	customers = frappe.get_all(
		"Customer",
		fields=["name", "customer_name", "mobile_no"],
		filters=filters,
		or_filters=or_filters,
		limit_page_length=50,
	)

	# Add phone display from linked contacts if available
	for c in customers:
		# Try to get primary contact phone
		contact = frappe.db.get_value(
			"Dynamic Link",
			{
				"link_doctype": "Customer",
				"link_name": c["name"],
				"parenttype": "Contact"
			},
			"parent"
		)
		if contact:
			phone = frappe.db.get_value("Contact", contact, "phone")
			c["phone_display"] = phone or c.get("mobile_no") or ""
		else:
			c["phone_display"] = c.get("mobile_no") or ""

	return customers


@frappe.whitelist()
def get_watch_brands(txt: str = ""):
	"""Search watch brands by name."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = []
	if txt:
		needle = f"%{txt}%"
		filters = [["brand_name", "like", needle]]
	
	brands = frappe.get_all(
		"DW Watch Brand",
		fields=["name", "brand_name", "description"],
		filters=filters,
		limit_page_length=500,
		order_by="brand_name asc"
	)
	
	return brands


@frappe.whitelist()
def create_watch_brand(brand_name: str, description: str = ""):
	"""Create a new watch brand."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if not brand_name:
		frappe.throw(_("Brand name is required"))
	
	if frappe.db.exists("DW Watch Brand", {"brand_name": brand_name}):
		frappe.throw(_("Brand already exists"))
		
	doc = frappe.get_doc({
		"doctype": "DW Watch Brand",
		"brand_name": brand_name,
		"description": description
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def create_watch_model(brand: str, model_name: str, description: str = ""):
	"""Create a new watch model."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if not brand or not model_name:
		frappe.throw(_("Brand and Model name are required"))
		
	if frappe.db.exists("DW Watch Model", {"brand": brand, "model_name": model_name}):
		frappe.throw(_("Model already exists for this brand"))
		
	doc = frappe.get_doc({
		"doctype": "DW Watch Model",
		"brand": brand,
		"model_name": model_name,
		"description": description
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def get_watch_models(brand: str = "", txt: str = ""):
	"""Get watch models for a specific brand, optionally filtered by search text."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = []
	
	# Always filter by brand if provided
	if brand:
		filters.append(["brand", "=", brand])
	
	# Add text search filter if provided
	if txt:
		needle = f"%{txt}%"
		filters.append(["model_name", "like", needle])
	
	models = frappe.get_all(
		"DW Watch Model",
		fields=["name", "brand", "model_name", "description"],
		filters=filters,
		limit_page_length=100,
		order_by="model_name asc"
	)
	
	return models



@frappe.whitelist()
def get_issue_templates():
	"""Get all active issue templates with suggested tasks."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Issue Template",
		fields=["name", "issue_name", "description", "suggested_task"],
		filters={"is_active": 1},
		limit_page_length=100,
		order_by="issue_name asc"
	)
	
	return templates


@frappe.whitelist()
def get_watch_condition_templates():
	"""Get all active pre-existing watch condition templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Watch Condition Template",
		fields=["name", "condition_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="condition_name asc"
	)
	return templates


@frappe.whitelist()
def get_diagnosis_summary_templates():
	"""Get all active diagnosis summary templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Diagnosis Summary Template",
		fields=["name", "summary_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="summary_name asc",
	)


@frappe.whitelist()
def get_recommended_work_templates():
	"""Get all active recommended work templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Recommended Work Template",
		fields=["name", "work_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="work_name asc",
	)


@frappe.whitelist()
def get_movement_info_templates():
	"""Get all active movement information templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Information Template",
		fields=["name", "movement_info", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="movement_info asc",
	)


@frappe.whitelist()
def get_movement_type_templates():
	"""Get all active movement type templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Type Template",
		fields=["name", "movement_type", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="movement_type asc",
	)


@frappe.whitelist()
def get_movement_caliber_templates():
	"""Get all active movement caliber templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Caliber Template",
		fields=["name", "caliber_code", "description"],
		filters={"is_active": 1},
		limit_page_length=400,
		order_by="caliber_code asc",
	)


@frappe.whitelist()
def get_country_codes():
	"""Get all active country codes."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	codes = frappe.get_all(
		"DW Country Code",
		fields=["name", "country_name", "code"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="country_name asc"
	)
	return codes



@frappe.whitelist()
def search_items(txt: str = "", item_group: str = ""):
	"""Search items by code, name, or description for parts selection.
	
	Supports flexible word-order matching. For example, 'battery 357' will find '357 RENATA BATTERY'.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = {
		"disabled": 0  # Only show enabled items
	}
	
	if item_group:
		filters["item_group"] = item_group
	
	if txt:
		# Split search text into words for flexible matching
		words = txt.strip().split()
		limit = 50
		
		if words:
			# Build SQL query to match ALL words in any order
			# Each word must appear in item_code OR item_name OR description
			conditions = []
			params = []
			
			for word in words:
				word_pattern = f"%{word}%"
				conditions.append("""
					(item_code LIKE %s OR item_name LIKE %s OR description LIKE %s)
				""")
				params.extend([word_pattern, word_pattern, word_pattern])
			
			# Combine all word conditions with AND
			where_clause = " AND ".join(conditions)
			
			# Add disabled filter
			where_clause += " AND disabled = 0"
			
			if item_group:
				where_clause += " AND item_group = %s"
				params.append(item_group)
			
			sql = f"""
				SELECT name, item_code, item_name, description, standard_rate, stock_uom
				FROM `tabItem`
				WHERE {where_clause}
				ORDER BY item_name ASC
				LIMIT {limit}
			"""
			
			items = frappe.db.sql(sql, params, as_dict=True)
		else:
			items = []
	else:
		# When no search query, return first 100 items as suggestions
		limit = 100
		items = frappe.get_all(
			"Item",
			fields=["name", "item_code", "item_name", "description", "standard_rate", "stock_uom"],
			filters=filters,
			limit_page_length=limit,
			order_by="item_name asc"
		)
	
	# Add actual stock balance for each item
	for item in items:
		# Get actual stock qty from Bin table
		stock_qty = frappe.db.sql("""
			SELECT SUM(actual_qty)
			FROM `tabBin`
			WHERE item_code = %s
		""", item['item_code'])
		item['stock_qty'] = stock_qty[0][0] if stock_qty and stock_qty[0][0] else 0
	
	return items



@frappe.whitelist()
def get_item_stock(item_code: str, warehouse: str = ""):
	"""Return available stock qty for a single item across all warehouses (or a specific one)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	item_code = (item_code or "").strip()
	if not item_code:
		frappe.throw(_("item_code is required"))
	warehouse = (warehouse or "").strip()
	if warehouse:
		qty = frappe.db.sql(
			"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s AND warehouse = %s",
			(item_code, warehouse),
		)
	else:
		qty = frappe.db.sql(
			"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s",
			(item_code,),
		)
	available = float((qty[0][0] or 0) if qty else 0)
	return {"item_code": item_code, "available_qty": available}


@frappe.whitelist()
def get_task_templates():
	"""Get all active task templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Task Template",
		fields=["name", "task_name", "description", "default_rate"],
		filters={"is_active": 1},
		limit_page_length=100,
		order_by="task_name asc"
	)
	return templates


@frappe.whitelist()
def get_employees():
	"""Get all technicians with their current open-item workload count."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	employees = frappe.get_all(
		"DW Technician",
		fields=["name", "technician_name as employee_name"],
		limit_page_length=100,
		order_by="technician_name asc",
	)
	open_counts = frappe.db.sql(
		"""
		SELECT technician, COUNT(*) AS open_count
		FROM `tabDW Repair Item`
		WHERE status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined')
		  AND technician IS NOT NULL AND technician != ''
		GROUP BY technician
		""",
		as_dict=True,
	)
	count_map = {r.technician: r.open_count for r in open_counts}
	for emp in employees:
		emp["open_items"] = count_map.get(emp["name"], 0)
	return employees


@frappe.whitelist()
def get_payment_modes():
	"""Get configured payment modes for repair workflow."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	payment_modes = frappe.db.sql("""
		SELECT 
			pmc.payment_mode as name,
			pmc.payment_mode as mode_of_payment,
			mop.type
		FROM `tabDW Payment Mode Config` pmc
		INNER JOIN `tabMode of Payment` mop ON pmc.payment_mode = mop.name
		WHERE pmc.is_active = 1 AND mop.enabled = 1
		ORDER BY pmc.display_order ASC, pmc.payment_mode ASC
	""", as_dict=True)
	return payment_modes


@frappe.whitelist()
def get_pos_runtime_config(company: str = "", pos_profile: str = ""):
	"""Return runtime POS defaults and selector options for the custom POS UI."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	resolved_company = company or _get_default_company()
	return get_pos_profile_settings(resolved_company, pos_profile or None)


# ============ DASHBOARD APIs ============

@frappe.whitelist()
def get_dashboard_stats(days: int = 7):
	"""Get summary statistics for dashboard KPI cards."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from datetime import datetime, timedelta
	
	today = datetime.now().date()
	start_date = today - timedelta(days=int(days))
	month_start = today.replace(day=1)
	
	# Count orders by status
	status_counts = frappe.db.sql("""
		SELECT status, COUNT(*) as count
		FROM `tabDW Repair Order`
		GROUP BY status
	""", as_dict=True)
	
	status_map = {row['status']: row['count'] for row in status_counts}
	
	# Total orders
	total_orders = sum(status_map.values())
	
	# Orders in period
	orders_in_period = frappe.db.count("DW Repair Order", {
		"received_date": [">=", start_date]
	})
	
	# Completed in period (status = Repaired or Delivered)
	completed_in_period = frappe.db.count("DW Repair Order", {
		"status": ["in", ["Repaired", "Delivered"]],
		"modified": [">=", start_date]
	})
	
	# Revenue this month (from linked Sales Invoices)
	revenue_this_month = frappe.db.sql("""
		SELECT COALESCE(SUM(si.grand_total), 0) as total
		FROM `tabDW Repair Order` ro
		INNER JOIN `tabSales Invoice` si ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
		AND si.posting_date >= %s
	""", (month_start,))[0][0] or 0
	
	# Average repair days (for completed orders)
	avg_repair_days = frappe.db.sql("""
		SELECT AVG(DATEDIFF(COALESCE(delivery_date, CURDATE()), received_date)) as avg_days
		FROM `tabDW Repair Order`
		WHERE status IN ('Repaired', 'Delivered')
		AND received_date IS NOT NULL
	""")[0][0] or 0
	
	return {
		"total_orders": total_orders,
		"pending": status_map.get("Pending", 0),
		"in_progress": status_map.get("In Progress", 0),
		"awaiting_parts": status_map.get("Awaiting Parts", 0),
		"repaired": status_map.get("Repaired", 0),
		"delivered": status_map.get("Delivered", 0),
		"orders_in_period": orders_in_period,
		"completed_in_period": completed_in_period,
		"revenue_this_month": float(revenue_this_month),
		"avg_repair_days": round(float(avg_repair_days), 1),
		"period_days": int(days)
	}


@frappe.whitelist()
def get_orders_trend(days: int = 7):
	"""Get daily order counts for the last N days."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from datetime import datetime, timedelta
	
	today = datetime.now().date()
	start_date = today - timedelta(days=int(days) - 1)
	
	# Get received orders per day
	received = frappe.db.sql("""
		SELECT received_date as date, COUNT(*) as count
		FROM `tabDW Repair Order`
		WHERE received_date >= %s
		GROUP BY received_date
		ORDER BY received_date
	""", (start_date,), as_dict=True)
	
	# Get completed orders per day (based on delivery_date or modified when status changed)
	completed = frappe.db.sql("""
		SELECT DATE(COALESCE(delivery_date, modified)) as date, COUNT(*) as count
		FROM `tabDW Repair Order`
		WHERE status IN ('Repaired', 'Delivered')
		AND DATE(COALESCE(delivery_date, modified)) >= %s
		GROUP BY DATE(COALESCE(delivery_date, modified))
		ORDER BY date
	""", (start_date,), as_dict=True)
	
	# Build date-indexed maps
	received_map = {str(row['date']): row['count'] for row in received}
	completed_map = {str(row['date']): row['count'] for row in completed}
	
	# Generate full date range
	result = []
	for i in range(int(days)):
		date = start_date + timedelta(days=i)
		date_str = str(date)
		result.append({
			"date": date_str,
			"label": date.strftime("%a"),  # Day name abbreviation
			"received": received_map.get(date_str, 0),
			"completed": completed_map.get(date_str, 0)
		})
	
	return result


@frappe.whitelist()
def get_outstanding_invoices(days_overdue: int = 0):
	"""Return submitted Sales Invoices with outstanding (unpaid) amounts.

	Args:
		days_overdue: Only include invoices at least this many days old (0 = all outstanding).
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	rows = frappe.db.sql(
		"""
		SELECT
			si.name,
			si.customer,
			c.customer_name,
			c.mobile_no,
			si.grand_total,
			si.outstanding_amount,
			si.posting_date,
			DATEDIFF(CURDATE(), si.posting_date) AS days_outstanding,
			ro.name AS repair_order
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
		  AND si.outstanding_amount > 0
		  AND DATEDIFF(CURDATE(), si.posting_date) >= %s
		ORDER BY si.posting_date ASC
		""",
		(int(days_overdue),),
		as_dict=True,
	)
	return rows


@frappe.whitelist()
def get_technician_stats():
	"""Get performance stats per technician."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	# Get task counts grouped by technician and status
	stats = frappe.db.sql("""
		SELECT 
			t.technician,
			tech.technician_name,
			COUNT(*) as total_tasks,
			SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed,
			SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
			SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END) as pending
		FROM `tabDW Repair Task` t
		LEFT JOIN `tabDW Technician` tech ON t.technician = tech.name
		WHERE t.technician IS NOT NULL AND t.technician != ''
		GROUP BY t.technician, tech.technician_name
		ORDER BY completed DESC
	""", as_dict=True)
	
	return stats


@frappe.whitelist()
def get_top_issues(limit: int = 10):
	"""Get most common repair issues."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	issues = frappe.db.sql("""
		SELECT 
			COALESCE(it.issue_name, ri.issue) as issue_name,
			COUNT(*) as count
		FROM `tabDW Repair Item Issue` ri
		LEFT JOIN `tabDW Issue Template` it ON ri.issue = it.name
		GROUP BY ri.issue, it.issue_name
		ORDER BY count DESC
		LIMIT %s
	""", (int(limit),), as_dict=True)
	
	# Calculate percentages
	total = sum(i['count'] for i in issues)
	for issue in issues:
		issue['percentage'] = round((issue['count'] / total * 100) if total > 0 else 0, 1)
	
	return issues


@frappe.whitelist()
def get_aged_pending_orders(limit: int = 5):
	"""Get oldest pending repair orders."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	orders = frappe.db.sql("""
		SELECT 
			name, customer, received_date, status,
			DATEDIFF(CURDATE(), received_date) as days_pending
		FROM `tabDW Repair Order`
		WHERE status = 'Pending'
		ORDER BY received_date ASC
		LIMIT %s
	""", (int(limit),), as_dict=True)
	
	# Add customer name for display
	for o in orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]
		
	return orders


# ==================== POS APIs ====================


def _get_default_company():
	"""Return the user's default company or the first available company."""
	company = frappe.defaults.get_user_default("Company")
	if company:
		return company

	companies = frappe.get_all("Company", fields=["name"], limit_page_length=1)
	if companies:
		return companies[0].get("name")

	frappe.throw("No Company is configured for POS invoicing")



def _get_currency_precision(company: str) -> int:
	"""Return the currency precision for the company."""
	precision = frappe.get_system_settings("currency_precision")
	if precision is not None:
		try:
			return int(precision)
		except (TypeError, ValueError):
			pass

	try:
		currency = frappe.db.get_value("Company", company, "default_currency")
		if currency:
			fraction_units = int(frappe.db.get_value("Currency", currency, "fraction_units") or 100)
			if fraction_units > 1:
				import math
				return int(round(math.log10(fraction_units)))
			return 0
	except Exception:
		pass

	return 2



def _get_allowed_pos_payment_modes():
	"""Return all active POS payment modes configured for the app."""
	rows = frappe.db.sql("""
		SELECT pmc.payment_mode
		FROM `tabDW Payment Mode Config` pmc
		INNER JOIN `tabMode of Payment` mop ON pmc.payment_mode = mop.name
		WHERE pmc.is_active = 1 AND mop.enabled = 1
	""", as_dict=True)
	return {row["payment_mode"] for row in rows}



def _get_payment_account_for_mode(payment_mode: str, company: str):
	"""Resolve the default account for a payment mode within the company."""
	payment_account = None
	try:
		mode_of_payment = frappe.get_doc("Mode of Payment", payment_mode)
		for account in mode_of_payment.accounts:
			if account.company == company and account.default_account:
				payment_account = account.default_account
				break
	except Exception:
		payment_account = None

	if payment_account:
		return payment_account

	fallback_account = frappe.db.get_value(
		"Account",
		{"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0},
		"name"
	)
	if fallback_account and payment_mode.lower() == "cash":
		return fallback_account

	frappe.throw(f"No default account is configured for payment mode {payment_mode} in company {company}")



def _parse_pos_payments(payments_json=None, payment_mode: str = "Cash"):
	"""Normalize split-payment input from the client while preserving row order."""
	if payments_json:
		raw_payments = json.loads(payments_json) if isinstance(payments_json, str) else payments_json
		if not isinstance(raw_payments, list) or not raw_payments:
			frappe.throw("Payments must be provided as a non-empty list")
	else:
		fallback_mode = (payment_mode or "Cash").strip() or "Cash"
		return [{"mode_of_payment": fallback_mode, "amount": None}]

	allowed_modes = _get_allowed_pos_payment_modes()
	normalized_payments = []

	for row in raw_payments:
		mode = str((row or {}).get("mode_of_payment") or (row or {}).get("payment_mode") or "").strip()
		amount = frappe.utils.flt((row or {}).get("amount") or 0)

		if not mode:
			frappe.throw("Each payment row must include a payment mode")
		if allowed_modes and mode not in allowed_modes:
			frappe.throw(f"Payment mode {mode} is not enabled for POS")
		if amount <= 0:
			frappe.throw(f"Payment amount for {mode} must be greater than zero")

		normalized_payments.append({
			"mode_of_payment": mode,
			"amount": amount,
		})

	return normalized_payments


def _parse_pos_options(options_json=None):
	"""Normalize POS option payload sent by the React frontend."""
	if not options_json:
		return {}
	return json.loads(options_json) if isinstance(options_json, str) else options_json



def _set_invoice_payments(invoice, payments, precision: int):
	"""Replace the invoice payment rows with validated split payments."""
	if not payments:
		frappe.throw("At least one payment method is required")

	invoice.set("payments", [])
	grand_total = frappe.utils.flt(invoice.grand_total, precision)
	tolerance = (0.5 / (10 ** precision)) if precision > 0 else 0
	total_allocated = 0

	for row in payments:
		mode = row.get("mode_of_payment")
		amount = row.get("amount")
		if amount in (None, ""):
			if len(payments) == 1:
				amount = grand_total
			else:
				frappe.throw("Each split payment row requires an amount")

		amount = frappe.utils.flt(amount, precision)
		if amount <= 0:
			frappe.throw(f"Payment amount for {mode} must be greater than zero")

		total_allocated += amount
		invoice.append("payments", {
			"mode_of_payment": mode,
			"account": _get_payment_account_for_mode(mode, invoice.company),
			"amount": amount,
		})

	total_allocated = frappe.utils.flt(total_allocated, precision)
	if abs(total_allocated - grand_total) > tolerance:
		frappe.throw(
			f"Allocated payments must equal the invoice total. Allocated: {total_allocated}, Total: {grand_total}"
		)


def _validate_pos_pms_item_mix(items) -> bool:
	"""Ensure POS carts do not mix PMS items with standard-VAT items."""
	from watch_doctor.pms import validate_pms_item_mix

	item_codes = [item.get("item_code") for item in (items or []) if item.get("item_code")]
	pms_item_codes, _non_pms_item_codes = validate_pms_item_mix(item_codes)
	return bool(pms_item_codes)


@frappe.whitelist()
def get_pos_items(search: str = "", limit: int = 100, in_stock_only: int = 1):
	"""Get items for POS with stock and pricing info. Only returns enabled items with stock."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	filters = {"is_stock_item": 1, "disabled": 0}
	
	# Get items from Bin that have stock
	if int(in_stock_only):
		items_with_stock = frappe.db.sql("""
			SELECT DISTINCT b.item_code, SUM(b.actual_qty) as stock_qty
			FROM `tabBin` b
			INNER JOIN `tabItem` i ON b.item_code = i.name
			WHERE i.disabled = 0 AND i.is_stock_item = 1
			GROUP BY b.item_code
			HAVING SUM(b.actual_qty) > 0
		""", as_dict=True)
		
		item_codes = [i['item_code'] for i in items_with_stock]
		stock_map = {i['item_code']: i['stock_qty'] for i in items_with_stock}
		
		if not item_codes:
			return []
		
		if search:
			items = frappe.get_all(
				"Item",
				filters={"name": ["in", item_codes]},
				or_filters=[
					["item_name", "like", f"%{search}%"],
					["item_code", "like", f"%{search}%"]
				],
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		else:
			items = frappe.get_all(
				"Item",
				filters={"name": ["in", item_codes]},
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		
		for item in items:
			item['stock_qty'] = stock_map.get(item['name'], 0)
	else:
		if search:
			items = frappe.get_all(
				"Item",
				filters=filters,
				or_filters=[
					["item_name", "like", f"%{search}%"],
					["item_code", "like", f"%{search}%"]
				],
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		else:
			items = frappe.get_all(
				"Item",
				filters=filters,
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		
		for item in items:
			stock = frappe.db.sql("""
				SELECT SUM(actual_qty) as qty
				FROM `tabBin`
				WHERE item_code = %s
			""", (item['name'],), as_dict=True)
			item['stock_qty'] = stock[0]['qty'] if stock and stock[0]['qty'] else 0
	
	# Enrich with PMS info for items in the configured PMS group
	from watch_doctor.pms import _get_pms_item_groups
	pms_groups = _get_pms_item_groups()
	for item in items:
		item['is_pms'] = 1 if item.get('item_group') in pms_groups else 0

	return items


@frappe.whitelist()
def get_pos_customers(search: str = "", limit: int = 20):
	"""Get customers for POS selection."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if search:
		customers = frappe.get_all(
			"Customer",
			or_filters=[
				["customer_name", "like", f"%{search}%"],
				["name", "like", f"%{search}%"]
			],
			fields=["name", "customer_name"],
			limit_page_length=int(limit),
			order_by="customer_name asc"
		)
	else:
		customers = frappe.get_all(
			"Customer",
			fields=["name", "customer_name"],
			limit_page_length=int(limit),
			order_by="modified desc"
		)
	
	return customers


@frappe.whitelist()
def get_customer_repair_history(customer: str, limit: int = 20):
	"""Return a customer's prior repair orders, newest first."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	return frappe.db.sql(
		"""
		SELECT o.name, o.status, o.received_date, o.delivery_date,
		       o.invoiced_amount, COUNT(i.name) AS watch_count
		FROM `tabDW Repair Order` o
		LEFT JOIN `tabDW Repair Item` i ON i.parent = o.name
		WHERE o.customer = %s
		GROUP BY o.name
		ORDER BY o.received_date DESC
		LIMIT %s
		""",
		(customer, int(limit)),
		as_dict=True,
	)


@frappe.whitelist()
def get_repair_history_detail(name: str):
	"""Return items and tasks for a repair order with resolved display names."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	items = frappe.db.sql(
		"""
		SELECT ri.name, ri.idx, ri.watch_brand, ri.watch_model,
		       COALESCE(wm.model_name, ri.watch_model) AS watch_model_name,
		       ri.serial_number, ri.status
		FROM `tabDW Repair Item` ri
		LEFT JOIN `tabDW Watch Model` wm ON wm.name = ri.watch_model
		WHERE ri.parent = %s
		ORDER BY ri.idx
		""",
		(name,),
		as_dict=True,
	)

	tasks = frappe.db.sql(
		"""
		SELECT rt.repair_item_key, rt.service,
		       COALESCE(tt.task_name, rt.service) AS service_name,
		       rt.status
		FROM `tabDW Repair Task` rt
		LEFT JOIN `tabDW Task Template` tt ON tt.name = rt.service
		WHERE rt.parent = %s
		ORDER BY rt.idx
		""",
		(name,),
		as_dict=True,
	)

	return {"items": items, "all_tasks": tasks}


@frappe.whitelist()
def create_pos_customer(customer_name: str = "", customer_id: str = "", mobile_no: str = "", email_id: str = ""):
	"""Create a new Customer from POS quick-create form."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	customer_name = " ".join((customer_name or "").split())
	customer_id = (customer_id or "").strip()
	mobile_no = (mobile_no or "").strip()
	email_id = (email_id or "").strip()

	if not customer_name:
		frappe.throw("Customer name is required")

	if email_id and not frappe.utils.validate_email_address(email_id, throw=False):
		frappe.throw("Please enter a valid email address")

	if mobile_no:
		existing = frappe.db.get_value(
			"Customer", {"mobile_no": mobile_no}, ["name", "customer_name"], as_dict=True
		)
		if existing:
			frappe.throw(
				f"A customer with mobile {mobile_no} already exists: "
				f"{existing.customer_name} ({existing.name}). "
				"Search for the existing customer instead of creating a duplicate.",
				title="Duplicate Mobile Number",
			)

	customer_doc = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Individual",
		"customer_group": "Individual",
		"territory": "All Territories",
		"mobile_no": mobile_no,
		"email_id": email_id,
	})

	if customer_id:
		meta = frappe.get_meta("Customer")
		for fieldname in (
			"customer_pos_id",
			"customer_id",
			"custom_customer_id",
			"id_number",
			"custom_id_number",
			"identification_number",
			"custom_identification_number",
			"identification_document_number",
			"custom_identification_document_number",
			"civil_id",
			"national_id",
		):
			if meta.has_field(fieldname):
				customer_doc.set(fieldname, customer_id)
				break

	customer_doc.insert(ignore_permissions=True)
	frappe.db.commit()

	return {
		"name": customer_doc.name,
		"customer_name": customer_doc.customer_name,
		"mobile_no": customer_doc.mobile_no,
		"email_id": customer_doc.email_id,
	}


@frappe.whitelist()
def create_pos_invoice(
	customer: str = "",
	items_json: str = "[]",
	payment_mode: str = "Cash",
	discount_percent: float = 0,
	payments_json=None,
	options_json=None,
):
	"""Create a POS Sales Invoice with immediate single or split payment."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	payments = _parse_pos_payments(payments_json, payment_mode)
	options = _parse_pos_options(options_json)
	discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0
	
	if not items or len(items) == 0:
		frappe.throw("At least one item is required")

	has_pms_items = _validate_pos_pms_item_mix(items)
	from watch_doctor.pms import get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	standard_sales_taxes_template = get_standard_sales_taxes_template()
	
	company = options.get("company") or _get_default_company()
	precision = _get_currency_precision(company)
	
	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": frappe.utils.today(),
		"is_pos": 1,
		"update_stock": 1,
		"additional_discount_percentage": discount_percent,
		"items": []
	})
	invoice.flags.ignore_permissions = True
	
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})

	profile_settings = apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=customer,
		pos_profile=options.get("pos_profile") or "",
		sales_person=options.get("sales_person") or "",
		commission_rate=options.get("commission_rate") or 0,
		receipt_format=options.get("receipt_format") or "",
		naming_series=options.get("naming_series") or "",
	)

	# PMS invoices must NOT have standard Sales Taxes applied —
	# the PMS VAT is calculated via margin and posted as GL entries on submit.
	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before creating POS invoices.")
	
	invoice.insert(ignore_permissions=True)
	_set_invoice_payments(invoice, payments, precision)
	invoice.save(ignore_permissions=True)
	invoice.submit()
	
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer,
		"has_pms_items": has_pms_items,
		"pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
		"auto_print": profile_settings.get("auto_print") or 0,
		"print_format": invoice.get("dw_pos_receipt_format") or "",
		"print_url": build_pos_print_url(invoice, profile_settings),
	}


@frappe.whitelist()
def save_pos_draft(customer: str = "", items_json: str = "[]", options_json=None):
	"""Save POS cart as draft Sales Invoice (not submitted)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	options = _parse_pos_options(options_json)
	
	if not items or len(items) == 0:
		frappe.throw("At least one item is required")

	has_pms_items = _validate_pos_pms_item_mix(items)
	from watch_doctor.pms import get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	standard_sales_taxes_template = get_standard_sales_taxes_template()
	
	# Get company from settings or first company
	company = options.get("company") or _get_default_company()
	
	# Create draft Sales Invoice (is_pos but not submitted)
	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": frappe.utils.today(),
		"is_pos": 1,
		"update_stock": 1,
		"items": []
	})
	invoice.flags.ignore_permissions = True
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})

	apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=customer,
		pos_profile=options.get("pos_profile") or "",
		sales_person=options.get("sales_person") or "",
		commission_rate=options.get("commission_rate") or 0,
		receipt_format=options.get("receipt_format") or "",
		naming_series=options.get("naming_series") or "",
	)

	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before saving POS drafts.")
	
	invoice.insert(ignore_permissions=True)
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer
	}


@frappe.whitelist()
def get_pos_drafts(limit: int = 20):
	"""Get draft POS invoices (held orders)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	drafts = frappe.get_all(
		"Sales Invoice",
		filters={
			"is_pos": 1,
			"docstatus": 0  # Draft
		},
		fields=["name", "customer", "customer_name", "grand_total", "creation", "modified"],
		limit_page_length=int(limit),
		order_by="modified desc"
	)
	
	# Get item count for each draft
	for draft in drafts:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": draft["name"]},
			fields=["COUNT(*) as count"]
		)
		draft["item_count"] = items[0]["count"] if items else 0
	
	return drafts


@frappe.whitelist()
def load_pos_draft(invoice_name: str):
	"""Load a draft invoice to continue in POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	items = []
	for item in invoice.items:
		items.append({
			"item_code": item.item_code,
			"item_name": item.item_name,
			"qty": item.qty,
			"rate": item.rate
		})
	
	return {
		"invoice_name": invoice.name,
		"customer": invoice.customer,
		"customer_name": invoice.customer_name,
		"items": items,
		"grand_total": invoice.grand_total,
		"pos_profile": invoice.get("dw_pos_profile") or "",
		"sales_person": invoice.get("dw_pos_sales_person") or "",
		"commission_rate": invoice.get("dw_pos_commission_rate") or 0,
		"receipt_format": invoice.get("dw_pos_receipt_format") or "",
		"naming_series": invoice.naming_series or "",
	}


@frappe.whitelist()
def delete_pos_draft(invoice_name: str):
	"""Delete a draft POS invoice."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Can only delete draft invoices")
	
	frappe.delete_doc("Sales Invoice", invoice_name)
	frappe.db.commit()
	
	return {"success": True}


@frappe.whitelist()
def submit_pos_draft(invoice_name: str, payment_mode: str = "Cash", discount_percent: float = 0, payments_json=None, options_json=None):
	"""Submit a draft POS invoice with single or split payment."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	invoice.flags.ignore_permissions = True
	payments = _parse_pos_payments(payments_json, payment_mode)
	options = _parse_pos_options(options_json)
	discount_percent = frappe.utils.flt(discount_percent) if discount_percent else 0
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	invoice.additional_discount_percentage = discount_percent

	# Clear standard taxes for PMS invoices (if any PMS item present)
	from watch_doctor.pms import validate_pms_item_mix, get_standard_sales_taxes_template, require_pms_runtime_configuration
	require_pms_runtime_configuration()
	pms_item_codes, _non_pms_item_codes = validate_pms_item_mix(
		[item.item_code for item in invoice.items if item.item_code]
	)
	has_pms_items = bool(pms_item_codes)
	profile_settings = apply_pos_profile(
		invoice,
		has_pms_items=has_pms_items,
		customer=invoice.customer,
		pos_profile=options.get("pos_profile") or invoice.get("dw_pos_profile") or "",
		sales_person=options.get("sales_person") or invoice.get("dw_pos_sales_person") or "",
		commission_rate=options.get("commission_rate") or invoice.get("dw_pos_commission_rate") or 0,
		receipt_format=options.get("receipt_format") or invoice.get("dw_pos_receipt_format") or "",
		naming_series=options.get("naming_series") or invoice.naming_series or "",
	)
	standard_sales_taxes_template = get_standard_sales_taxes_template()
	if has_pms_items:
		invoice.taxes_and_charges = ""
		invoice.set("taxes", [])
	elif standard_sales_taxes_template:
		invoice.taxes_and_charges = standard_sales_taxes_template
	else:
		frappe.throw("Standard Sales Taxes Template must be configured in DW PMS Settings before submitting POS drafts.")

	invoice.save(ignore_permissions=True)
	precision = _get_currency_precision(invoice.company)
	_set_invoice_payments(invoice, payments, precision)
	invoice.save(ignore_permissions=True)
	invoice.submit()
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer,
		"has_pms_items": has_pms_items,
		"pms_total_vat": invoice.get("dw_pms_total_vat") or 0,
		"auto_print": profile_settings.get("auto_print") or 0,
		"print_format": invoice.get("dw_pos_receipt_format") or "",
		"print_url": build_pos_print_url(invoice, profile_settings),
	}




# ==================== Daily Report API ====================

@frappe.whitelist()
def get_daily_report(report_date=None):
	"""Get a comprehensive daily report for repair works and POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	import datetime
	is_executive = "executive" in get_dw_roles()
	if not report_date:
		report_date = datetime.date.today().isoformat()

	# ---- REPAIR SECTION ----

	# Orders received on report_date
	received_orders = frappe.db.sql("""
		SELECT name, customer, status, priority, received_date,
			promised_delivery_date, invoiced_amount
		FROM `tabDW Repair Order`
		WHERE received_date = %s
		ORDER BY creation ASC
	""", (report_date,), as_dict=True)
	for o in received_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Orders completed on report_date (status=Completed, modified on that date)
	completed_orders = frappe.db.sql("""
		SELECT name, customer, status, received_date, invoiced_amount,
			DATE(modified) as completed_date
		FROM `tabDW Repair Order`
		WHERE status = 'Completed' AND DATE(modified) = %s
		ORDER BY modified DESC
	""", (report_date,), as_dict=True)
	for o in completed_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Pending / In Progress counts (current snapshot)
	pending_count = frappe.db.count("DW Repair Order", {"status": "Pending"})
	inprogress_count = frappe.db.count("DW Repair Order", {"status": "In Progress"})

	# Repair revenue: submitted Sales Invoices posted on report_date linked to a repair order
	repair_revenue_rows = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.customer
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date = %s
	""", (report_date,), as_dict=True)
	repair_revenue = sum(r["grand_total"] for r in repair_revenue_rows)
	repair_invoice_count = len(repair_revenue_rows)

	# Repair invoice payment mode breakdown
	repair_payment_breakdown = []
	if repair_revenue_rows:
		ri_names = [r["name"] for r in repair_revenue_rows]
		ri_placeholders = ", ".join(["%s"] * len(ri_names))
		repair_payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({ri_placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(ri_names), as_dict=True
		)

	# Tasks completed per technician on report_date
	technician_tasks = frappe.db.sql("""
		SELECT
			t.technician,
			tech.technician_name,
			COUNT(*) as tasks_completed
		FROM `tabDW Repair Task` t
		LEFT JOIN `tabDW Technician` tech ON t.technician = tech.name
		WHERE t.status = 'Completed' AND DATE(t.modified) = %s
			AND t.technician IS NOT NULL AND t.technician != ''
		GROUP BY t.technician, tech.technician_name
		ORDER BY tasks_completed DESC
	""", (report_date,), as_dict=True)

	# Top issues from orders received on report_date
	top_issues = frappe.db.sql("""
		SELECT
			COALESCE(it.issue_name, ri.issue) as issue_name,
			COUNT(*) as count
		FROM `tabDW Repair Item Issue` ri
		INNER JOIN `tabDW Repair Order` ro ON ri.parent = ro.name
		LEFT JOIN `tabDW Issue Template` it ON ri.issue = it.name
		WHERE ro.received_date = %s
		GROUP BY ri.issue, it.issue_name
		ORDER BY count DESC
		LIMIT 10
	""", (report_date,), as_dict=True)

	# Parts used in orders received on report_date
	parts_used = frappe.db.sql("""
		SELECT
			rp.part,
			COALESCE(rp.item_name, i.item_name, rp.part) as item_name,
			SUM(rp.quantity) as total_qty,
			SUM(rp.quantity * COALESCE(rp.rate, rp.auto_rate, 0)) as total_amount
		FROM `tabDW Repair Part Used` rp
		INNER JOIN `tabDW Repair Order` ro ON rp.parent = ro.name
		LEFT JOIN `tabItem` i ON rp.part = i.name
		WHERE ro.received_date = %s
		GROUP BY rp.part, item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- FINANCIAL / EXPENSES SECTION ----

	# ---- FINANCIAL / EXPENSES SECTION ----

	expense_entries = []

	# 1) Payment Entry expenses — outgoing payments on ALL modes
	pe_rows = frappe.db.sql(
		"""SELECT
			pe.name,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			pe.paid_to AS debit_account
		FROM `tabPayment Entry` pe
		WHERE pe.payment_type = 'Pay'
			AND pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.creation ASC""",
		(report_date,),
		as_dict=True
	)
	expense_entries.extend(pe_rows)

	def _mode_breakdown_dicts(rows):
		m = {}
		for r in rows:
			mode = r.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(r.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	# 2) Journal Entry debits — credit on ANY mode-of-payment account = cash out
	default_company = frappe.defaults.get_defaults().get("company")
	mode_account_rows = frappe.db.sql(
		"""SELECT mopa.default_account, mop.name AS mode_of_payment
		FROM `tabMode of Payment Account` mopa
		INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
		WHERE (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
		(default_company or "",),
		as_dict=True
	)
	account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}
	payment_accounts = list(account_to_mode.keys())

	je_detail_rows = []
	je_receipt_rows = []  # JE debits on cash/bank = cash received via journal entry
	if payment_accounts:
		pa_placeholders = ", ".join(["%s"] * len(payment_accounts))

		# JE credits on cash/bank accounts = cash paid out.
		# A credit is only a genuine EXPENSE to the extent its offsetting DEBIT lines
		# hit non-cash accounts. When the debit side is another cash/bank account the
		# JE is a pure internal transfer (e.g. EOD float: Dr HO CASH / Cr AUB) and must
		# NOT be counted as an expense. This mirrors the debit→income logic below, which
		# already splits internal corrections from external receipts.
		je_credit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.credit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name
				   AND jea2.debit_in_account_currency > 0
				 LIMIT 1) AS debit_account,
				(SELECT COALESCE(SUM(jea3.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name
				   AND jea3.debit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_placeholders})
				) AS external_debit_amount,
				(SELECT COALESCE(SUM(jea4.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name
				   AND jea4.debit_in_account_currency > 0
				   AND jea4.account IN ({pa_placeholders})
				) AS internal_debit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date = %s
				AND jea.account IN ({pa_placeholders})
				AND jea.credit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [report_date] + payment_accounts),
			as_dict=True
		)
		for row in je_credit_rows:
			mode      = account_to_mode.get(row["account"], row["account"])
			ext_dr    = float(row.get("external_debit_amount") or 0)
			int_dr    = float(row.get("internal_debit_amount") or 0)
			total_dr  = ext_dr + int_dr
			# Fraction of this credit that funds a genuine (non-cash) expense account
			ext_fraction = (ext_dr / total_dr) if total_dr > 0 else 0.0
			amount       = float(row["amount"] or 0)
			expense_amt  = amount * ext_fraction
			# Pure internal transfers (ext_fraction == 0) contribute no expense
			if expense_amt > 0:
				je_detail_rows.append({
					"name": row["name"],
					"mode_of_payment": mode,
					"against_account": row.get("debit_account") or "",
					"amount": expense_amt,
					"remarks": row.get("remarks") or "",
				})
		# Extend with je_detail_rows (has resolved mode_of_payment) NOT the raw SQL result
		# (which only has `account`), otherwise expense_breakdown maps them all to "Other".
		expense_entries.extend(je_detail_rows)

		# JE debits on cash/bank accounts — three categories:
		#
		# 1. PURE CORRECTION (inter-account transfer): ALL credit lines are also cash/bank
		#    accounts (e.g. Dr Cash, Cr AFS Card to fix a wrong payment mode).
		#    Not new income; just redistributes cash across modes.
		#
		# 2. PURE EXTERNAL RECEIPT: ALL credit lines are non-cash accounts (e.g. Dr Cash,
		#    Cr Accounts Payable for a supplier refund). Genuine new cash inflow.
		#
		# 3. MIXED JE: some credit lines are cash/bank (correction portion) and some are
		#    non-cash (external portion). e.g. Dr Cash 100, Cr Card 50, Cr Creditors 50.
		#    Only the proportional external fraction counts as income.
		#
		# We fetch the SUM of external credits and internal credits per JE so we can
		# compute the exact income fraction for each debit line.
		je_debit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.debit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name
				   AND jea2.credit_in_account_currency > 0
				 LIMIT 1) AS credit_account,
				(SELECT COALESCE(SUM(jea3.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name
				   AND jea3.credit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_placeholders})
				) AS external_credit_amount,
				(SELECT COALESCE(SUM(jea4.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name
				   AND jea4.credit_in_account_currency > 0
				   AND jea4.account IN ({pa_placeholders})
				) AS internal_credit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date = %s
				AND jea.account IN ({pa_placeholders})
				AND jea.debit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [report_date] + payment_accounts),
			as_dict=True
		)
		for row in je_debit_rows:
			mode     = account_to_mode.get(row["account"], row["account"])
			ext_cr   = float(row.get("external_credit_amount") or 0)
			int_cr   = float(row.get("internal_credit_amount") or 0)
			total_cr = ext_cr + int_cr
			# Fraction of this debit that is genuinely new income (non-correction)
			ext_fraction    = (ext_cr / total_cr) if total_cr > 0 else 0.0
			amount          = float(row["amount"] or 0)
			external_amount = amount * ext_fraction
			je_receipt_rows.append({
				"name": row["name"],
				"mode_of_payment": mode,
				"against_account": row.get("credit_account") or "",
				"amount": amount,
				"external_amount": external_amount,
				"is_correction": (ext_fraction == 0.0),
				"remarks": row.get("remarks") or "",
			})

	je_count = len(je_detail_rows)
	je_total = sum(r["amount"] for r in je_detail_rows)
	je_by_mode = _mode_breakdown_dicts(je_detail_rows)
	# Sum the proportional external_amount — handles pure corrections (0), pure externals
	# (full amount), and mixed JEs (fractional) correctly.
	je_receipt_total = sum(r.get("external_amount", 0) for r in je_receipt_rows)
	# Build je_receipt_by_mode from the proportional external amounts
	_je_ext_mode: dict = {}
	for _r in je_receipt_rows:
		_ext = _r.get("external_amount", 0)
		if _ext <= 0:
			continue
		_m = _r["mode_of_payment"]
		if _m not in _je_ext_mode:
			_je_ext_mode[_m] = {"mode_of_payment": _m, "total": 0.0, "count": 0}
		_je_ext_mode[_m]["total"] += _ext
		_je_ext_mode[_m]["count"] += 1
	je_receipt_by_mode = sorted(_je_ext_mode.values(), key=lambda x: x["total"], reverse=True)
	# All JE debits (including corrections) for per-mode cash flow table
	je_all_debits_by_mode = _mode_breakdown_dicts(je_receipt_rows)

	# Paid-at-invoice Purchase Invoices (is_paid=1): cash purchases settled directly
	# without a separate Payment Entry — must be fetched here so they're included in
	# expense_breakdown (→ Cash Flow by Payment Mode) and paid_purchases_by_mode.
	paid_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total,
			COALESCE(pi.supplier_name, '') AS supplier_name,
			COALESCE(pi.cash_bank_account, '') AS cash_bank_account
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s AND pi.is_paid = 1
		ORDER BY pi.grand_total DESC
	""", (report_date,), as_dict=True)
	total_paid_purchases = sum(float(inv["grand_total"] or 0) for inv in paid_purchase_invoices)

	def _account_to_payment_mode(acct):
		"""Resolve a GL cash/bank account name to its payment mode label.
		Falls back to the account name itself if no mapping exists."""
		return account_to_mode.get(acct) or acct or "Cash"

	# Group paid invoices by payment mode (not raw account name)
	paid_purchases_mode_map = {}
	for inv in paid_purchase_invoices:
		mode = _account_to_payment_mode(inv.get("cash_bank_account") or "")
		if mode not in paid_purchases_mode_map:
			paid_purchases_mode_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		paid_purchases_mode_map[mode]["total"] += float(inv.get("grand_total") or 0)
		paid_purchases_mode_map[mode]["count"] += 1
	paid_purchases_by_mode = sorted(paid_purchases_mode_map.values(), key=lambda x: x["total"], reverse=True)

	# Aggregate by payment mode — include paid purchase invoice outflows
	mode_expense_map = {}
	for e in expense_entries:
		mode = e.get("mode_of_payment", "Other")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(e.get("amount") or 0)
		mode_expense_map[mode]["count"] += 1
	for inv in paid_purchase_invoices:
		mode = _account_to_payment_mode(inv.get("cash_bank_account") or "")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(inv.get("grand_total") or 0)
		mode_expense_map[mode]["count"] += 1

	expense_breakdown = sorted(mode_expense_map.values(), key=lambda x: x["total"], reverse=True)
	total_expenses = sum(b["total"] for b in expense_breakdown)

	# ---- PAYMENT ENTRIES OVERVIEW ----
	# All submitted Payment Entries for the day — Receive (collections) and Pay (disbursements)
	pe_all = frappe.db.sql("""
		SELECT
			pe.name,
			pe.payment_type,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			COALESCE(pe.party_name, '') AS party_name,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			COALESCE(pe.reference_no, '') AS reference_no
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.payment_type DESC, pe.creation ASC
	""", (report_date,), as_dict=True)

	pe_receive = [p for p in pe_all if p["payment_type"] == "Receive"]
	pe_pay_all = [p for p in pe_all if p["payment_type"] == "Pay"]

	total_pe_received = sum(float(p["amount"] or 0) for p in pe_receive)
	total_pe_paid = sum(float(p["amount"] or 0) for p in pe_pay_all)
	net_pe_cash = total_pe_received - total_pe_paid

	def _mode_breakdown(entries):
		m = {}
		for p in entries:
			mode = p.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(p.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	pe_receive_by_mode = _mode_breakdown(pe_receive)
	pe_pay_by_mode = _mode_breakdown(pe_pay_all)

	# Split outgoing PEs: Purchases (Supplier) vs Operating (everything else)
	pe_purchases = [p for p in pe_pay_all if p.get("party_type") == "Supplier"]
	pe_operating = [p for p in pe_pay_all if p.get("party_type") != "Supplier"]
	total_pe_purchases = sum(float(p["amount"] or 0) for p in pe_purchases)
	total_pe_operating = sum(float(p["amount"] or 0) for p in pe_operating)
	pe_purchases_by_mode = _mode_breakdown(pe_purchases)
	pe_operating_by_mode = _mode_breakdown(pe_operating)

	# ---- CUSTOMER COLLECTIONS (PE Receive against credit Sales Invoices) ----
	pe_customer_collections = []
	for p in pe_receive:
		if p.get("party_type") == "Customer":
			# Check if this PE references a Sales Invoice
			refs = frappe.db.sql("""
				SELECT reference_doctype, reference_name, allocated_amount
				FROM `tabPayment Entry Reference`
				WHERE parent = %s AND reference_doctype = 'Sales Invoice'
			""", (p["name"],), as_dict=True)
			if refs:
				for ref in refs:
					pe_customer_collections.append({
						"pe_name": p["name"],
						"customer": p.get("party") or "",
						"customer_name": p.get("party_name") or p.get("party") or "",
						"invoice": ref["reference_name"],
						"amount": float(ref["allocated_amount"] or 0),
						"mode_of_payment": p.get("mode_of_payment") or "",
					})
			else:
				# No explicit invoice references (on-account/customer collection).
				# Count this as collection so income stream reflects actual cash received.
				pe_customer_collections.append({
					"pe_name": p["name"],
					"customer": p.get("party") or "",
					"customer_name": p.get("party_name") or p.get("party") or "",
					"invoice": "",
					"amount": float(p.get("amount") or 0),
					"mode_of_payment": p.get("mode_of_payment") or "",
				})
	total_customer_collections = sum(c["amount"] for c in pe_customer_collections)

	# PE Receives from non-Customer parties (owner deposits, employee advance returns,
	# supplier refunds received via PE, etc.) — genuine cash in, but not "collections".
	pe_other_receipts  = [p for p in pe_receive if p.get("party_type") != "Customer"]
	total_other_receipts = sum(float(p.get("amount") or 0) for p in pe_other_receipts)

	# ---- CREDIT INVOICES FOR THE DAY ----
	# Credit Sales Invoices: submitted today, outstanding > 0 (not fully paid)
	credit_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.customer, si.grand_total, si.outstanding_amount,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.posting_date = %s
			AND si.outstanding_amount > 0
		ORDER BY si.outstanding_amount DESC
	""", (report_date,), as_dict=True)
	total_credit_sales = sum(float(inv["outstanding_amount"] or 0) for inv in credit_sales_invoices)

	# Credit Purchase Invoices: submitted today, outstanding > 0
	credit_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.outstanding_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s
			AND pi.outstanding_amount > 0
		ORDER BY pi.outstanding_amount DESC
	""", (report_date,), as_dict=True)
	total_credit_purchases = sum(float(inv["outstanding_amount"] or 0) for inv in credit_purchase_invoices)

	# ---- GL-BASED CASH POSITION (ground truth — same source as the "Day Report") ----
	# Query all leaf cash/bank accounts for the company, then sum their GL movements.
	# This captures every voucher type (PE, JE, PI, SI, POS) without reconstruction bugs.
	cash_bank_accounts = frappe.db.sql("""
		SELECT name FROM `tabAccount`
		WHERE account_type IN ('Cash', 'Bank')
		  AND is_group = 0
		  AND company = %s
	""", (default_company,), pluck="name")

	gl_total_cash_in  = 0.0
	gl_total_cash_out = 0.0
	gl_account_summary = []

	if cash_bank_accounts:
		cb_ph = ", ".join(["%s"] * len(cash_bank_accounts))
		gl_rows = frappe.db.sql(
			f"""SELECT
				gle.account,
				SUM(gle.debit)  AS total_debit,
				SUM(gle.credit) AS total_credit
			FROM `tabGL Entry` gle
			WHERE gle.posting_date = %s
			  AND gle.docstatus = 1
			  AND gle.is_cancelled = 0
			  AND gle.account IN ({cb_ph})
			GROUP BY gle.account
			ORDER BY (SUM(gle.debit) + SUM(gle.credit)) DESC""",
			tuple([report_date] + list(cash_bank_accounts)),
			as_dict=True,
		)
		for row in gl_rows:
			d = float(row.get("total_debit")  or 0)
			c = float(row.get("total_credit") or 0)
			gl_total_cash_in  += d
			gl_total_cash_out += c
			gl_account_summary.append({
				"account":      row["account"],
				"total_debit":  d,
				"total_credit": c,
				"net":          d - c,
			})

	# Aggregate per-account GL into a per-mode summary.
	# This covers ALL voucher types — PE Internal Transfer, SI returns, JE corrections,
	# anything — without any document-level reconstruction gaps.
	_gl_mode_map: dict = {}
	for _row in gl_account_summary:
		_mode = account_to_mode.get(_row["account"]) or _row["account"]
		if _mode not in _gl_mode_map:
			_gl_mode_map[_mode] = {"mode_of_payment": _mode, "total_debit": 0.0, "total_credit": 0.0, "net": 0.0}
		_gl_mode_map[_mode]["total_debit"]  += _row["total_debit"]
		_gl_mode_map[_mode]["total_credit"] += _row["total_credit"]
		_gl_mode_map[_mode]["net"]          += _row["net"]
	gl_mode_summary = sorted(
		_gl_mode_map.values(),
		key=lambda x: abs(x["total_debit"] + x["total_credit"]),
		reverse=True,
	)

	# ---- INTERNAL TRANSFERS (cash ↔ cash) ----
	# Vouchers that only move money between the shop's own cash/bank accounts are
	# neither income nor expense (e.g. the EOD float: Dr HO CASH / Cr AUB, or the till
	# being topped up from head-office cash). They show up in the raw GL totals on both
	# sides and inflate them. We identify these so the KPI cards and the per-mode table
	# reflect EXTERNAL cash flow only, while still surfacing the transfers for audit.
	cash_bank_set = set(cash_bank_accounts)
	transfer_mode_in:  dict = {}   # mode -> cash that entered it via a transfer
	transfer_mode_out: dict = {}   # mode -> cash that left it via a transfer
	internal_transfers = []
	gl_transfer_total = 0.0
	if cash_bank_set:
		# JEs whose EVERY posting line hits a cash/bank account = pure internal transfer
		_je_lines = frappe.db.sql(
			"""SELECT jea.parent AS je, jea.account,
				jea.debit_in_account_currency  AS dr,
				jea.credit_in_account_currency AS cr
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1 AND je.posting_date = %s""",
			(report_date,), as_dict=True
		)
		_by_je: dict = {}
		for _l in _je_lines:
			_by_je.setdefault(_l["je"], []).append(_l)
		for _je, _lines in _by_je.items():
			if not _lines or not all(l["account"] in cash_bank_set for l in _lines):
				continue
			for _l in _lines:
				_mode = account_to_mode.get(_l["account"], _l["account"])
				_cr = float(_l["cr"] or 0)
				_dr = float(_l["dr"] or 0)
				if _cr > 0:
					transfer_mode_out[_mode] = transfer_mode_out.get(_mode, 0.0) + _cr
					gl_transfer_total += _cr
				if _dr > 0:
					transfer_mode_in[_mode] = transfer_mode_in.get(_mode, 0.0) + _dr
			_outs = [l for l in _lines if float(l["cr"] or 0) > 0]
			_ins  = [l for l in _lines if float(l["dr"] or 0) > 0]
			internal_transfers.append({
				"voucher": _je,
				"from": ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _outs),
				"to":   ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _ins),
				"amount": sum(float(l["cr"] or 0) for l in _outs),
			})
		# Payment Entries explicitly typed as Internal Transfer between two cash/bank accts
		_pe_xfers = frappe.db.sql(
			"""SELECT name, paid_from, paid_to, paid_amount
			FROM `tabPayment Entry`
			WHERE docstatus = 1 AND posting_date = %s AND payment_type = 'Internal Transfer'""",
			(report_date,), as_dict=True
		)
		for _t in _pe_xfers:
			if _t["paid_from"] in cash_bank_set and _t["paid_to"] in cash_bank_set:
				_om = account_to_mode.get(_t["paid_from"], _t["paid_from"])
				_im = account_to_mode.get(_t["paid_to"], _t["paid_to"])
				_amt = float(_t["paid_amount"] or 0)
				transfer_mode_out[_om] = transfer_mode_out.get(_om, 0.0) + _amt
				transfer_mode_in[_im]  = transfer_mode_in.get(_im, 0.0) + _amt
				gl_transfer_total += _amt
				internal_transfers.append({"voucher": _t["name"], "from": _om, "to": _im, "amount": _amt})

	# External (non-transfer) cash flow — what the KPI cards should show
	gl_external_cash_in  = gl_total_cash_in  - gl_transfer_total
	gl_external_cash_out = gl_total_cash_out - gl_transfer_total

	# Strip internal transfers out of the per-mode table so its gross totals stop
	# inflating; drop any mode that becomes entirely a transfer (nothing external left).
	_net_mode_summary = []
	for _m in gl_mode_summary:
		_md = _m["mode_of_payment"]
		_d = _m["total_debit"]  - transfer_mode_in.get(_md, 0.0)
		_c = _m["total_credit"] - transfer_mode_out.get(_md, 0.0)
		_d = _d if _d > 0.0001 else 0.0
		_c = _c if _c > 0.0001 else 0.0
		if _d == 0.0 and _c == 0.0:
			continue
		_net_mode_summary.append({
			"mode_of_payment": _md,
			"total_debit": _d,
			"total_credit": _c,
			"net": _d - _c,
		})
	gl_mode_summary = _net_mode_summary

	# Purchased items summary (for purchase-focused daily view)
	items_purchased = frappe.db.sql("""
		SELECT
			pii.item_code,
			pii.item_name,
			SUM(pii.qty) AS total_qty,
			CASE WHEN SUM(pii.qty) = 0 THEN 0 ELSE SUM(pii.amount) / SUM(pii.qty) END AS rate,
			SUM(pii.amount) AS total_amount
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pi.docstatus = 1
			AND pi.posting_date = %s
		GROUP BY pii.item_code, pii.item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- POS / SALES OVERVIEW SECTION ----

	# Fetch all submitted Sales Invoices for the date
	# We exclude invoices that are explicitly linked to a Repair Order (already counted above)
	# This ensures Repair + Sales = Total Revenue
	all_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.outstanding_amount, si.is_pos, si.is_return, si.owner, si.customer,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 
			AND si.posting_date = %s
			AND ro.name IS NULL
	""", (report_date,), as_dict=True)

	total_retail_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 1 and inv["is_return"] == 0)
	total_b2b_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 0 and inv["is_return"] == 0)
	total_returns = sum(abs(inv["grand_total"]) for inv in all_sales_invoices if inv["is_return"] == 1)
	net_sales = (total_retail_sales + total_b2b_sales) - total_returns
	
	transaction_count = len([inv for inv in all_sales_invoices if inv["is_return"] == 0])
	sales_inv_names = [inv["name"] for inv in all_sales_invoices]

	# Payment method breakdown for all general sales
	payment_breakdown = []
	sales_payment_modes = {}
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total, COUNT(DISTINCT parent) as txn_count "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_rows = frappe.db.sql(
			f"SELECT parent, GROUP_CONCAT(DISTINCT mode_of_payment ORDER BY mode_of_payment SEPARATOR ', ') AS payment_modes "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY parent",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_modes = {r["parent"]: (r.get("payment_modes") or "") for r in sales_payment_rows}

	# Items sold & Category Breakdown
	items_sold = []
	category_breakdown = []
	item_profit_summary = []
	item_group_profit_summary = []
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		# Detailed items
		items_sold = frappe.db.sql(
			f"SELECT item_code, item_name, SUM(qty) as total_qty, "
			f"CASE WHEN SUM(qty) = 0 THEN 0 ELSE SUM(amount) / SUM(qty) END as rate, "
			f"SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"AND IFNULL(dw_is_internal_line, 0) = 0 "
			f"GROUP BY item_code, item_name ORDER BY total_qty DESC",
			tuple(sales_inv_names), as_dict=True
		)
		# Categorical summary
		category_breakdown = frappe.db.sql(
			f"SELECT item_group, SUM(qty) as total_qty, SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"AND IFNULL(dw_is_internal_line, 0) = 0 "
			f"GROUP BY item_group ORDER BY total_amount DESC",
			tuple(sales_inv_names), as_dict=True
		)

	# Item-wise profit summary should include ALL submitted Sales Invoices for the day
	# (both standalone sales and repair-linked invoices).
	profit_invoice_names = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": report_date},
		pluck="name",
	)
	if profit_invoice_names:
		profit_placeholders = ", ".join(["%s"] * len(profit_invoice_names))
		has_last_purchase_rate = frappe.db.has_column("Item", "last_purchase_rate")
		last_purchase_component = ", NULLIF(i.last_purchase_rate, 0)" if has_last_purchase_rate else ""
		cogs_rate_expr = (
			"CASE WHEN i.is_stock_item = 1 "
			f"THEN COALESCE(NULLIF(sii.incoming_rate, 0), NULLIF(i.valuation_rate, 0){last_purchase_component}, 0) "
			"ELSE 0 END"
		)
		item_group_profit_summary = frappe.db.sql(
			f"""
			SELECT
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				SUM(sii.base_net_amount) AS sales_amount,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			  AND IFNULL(sii.dw_is_internal_line, 0) = 0
			GROUP BY COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

		item_profit_summary = frappe.db.sql(
			f"""
			SELECT
				sii.item_code,
				COALESCE(sii.item_name, sii.item_code) AS item_name,
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.base_net_amount) / SUM(sii.qty) END AS selling_rate,
				SUM(sii.base_net_amount) AS sales_amount,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.qty * {cogs_rate_expr}) / SUM(sii.qty) END AS cogs_rate,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			  AND IFNULL(sii.dw_is_internal_line, 0) = 0
			GROUP BY sii.item_code, sii.item_name, COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

	# Cashier / Staff Breakdown
	cashier_breakdown = []
	if all_sales_invoices:
		cashier_map = {}
		for inv in all_sales_invoices:
			owner = inv["owner"]
			if owner not in cashier_map:
				cashier_map[owner] = {"owner": owner, "total": 0.0, "count": 0}
			if inv["is_return"] == 0:
				cashier_map[owner]["total"] += float(inv["grand_total"])
				cashier_map[owner]["count"] += 1
			else:
				cashier_map[owner]["total"] -= float(abs(inv["grand_total"]))
		cashier_breakdown = sorted(cashier_map.values(), key=lambda x: x["total"], reverse=True)

	# Detailed sales and purchase entries for executive drill-down tables
	sales_entries = []
	for inv in all_sales_invoices:
		amount = float(inv.get("grand_total") or 0)
		outstanding = float(inv.get("outstanding_amount") or 0)
		if inv.get("is_return") == 1:
			payment_status = "Returned"
		elif outstanding <= 0:
			payment_status = "Paid"
		elif outstanding < amount:
			payment_status = "Partially Paid"
		else:
			payment_status = "Unpaid"

		sales_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("customer_name") or inv.get("customer") or "",
			"amount": amount,
			"payment_status": payment_status,
			"payment_mode": sales_payment_modes.get(inv.get("name"), "Credit" if outstanding > 0 else "N/A"),
			"source": "Sales Invoice",
		})

	purchase_entries = []
	for p in pe_purchases:
		purchase_entries.append({
			"id": p.get("name"),
			"party_name": p.get("party_name") or p.get("party") or "",
			"amount": float(p.get("amount") or 0),
			"payment_status": "Paid",
			"payment_mode": p.get("mode_of_payment") or "",
			"source": "Payment Entry",
		})

	for inv in credit_purchase_invoices:
		outstanding = float(inv.get("outstanding_amount") or 0)
		grand_total = float(inv.get("grand_total") or 0)
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": outstanding,
			"payment_status": "Partially Paid" if (grand_total > 0 and outstanding < grand_total) else "Unpaid",
			"payment_mode": "Credit",
			"source": "Purchase Invoice",
		})

	for inv in paid_purchase_invoices:
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": float(inv.get("grand_total") or 0),
			"payment_status": "Paid",
			"payment_mode": inv.get("cash_bank_account") or "Cash",
			"source": "Purchase Invoice",
		})

	# ---- PMS VAT SECTION ----
	# Collect PMS (Profit Margin Scheme) VAT data for the report date
	pms_vat_rows = frappe.db.sql("""
		SELECT
			si.name AS invoice,
			si.customer_name,
			sii.item_code,
			sii.item_name,
			sii.amount AS selling_price,
			sii.dw_pms_purchase_cost AS purchase_cost,
			sii.dw_pms_margin AS margin,
			sii.dw_pms_vat AS vat_amount
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
		WHERE si.docstatus = 1
		  AND si.dw_has_pms_items = 1
		  AND sii.dw_is_pms_item = 1
		  AND si.posting_date = %s
		ORDER BY si.name
	""", (report_date,), as_dict=True)
	pms_total_vat = sum(float(r.get("vat_amount") or 0) for r in pms_vat_rows)
	pms_total_sales = sum(float(r.get("selling_price") or 0) for r in pms_vat_rows)

	return {
		"date": report_date,
		"repair": {
			"received_count": len(received_orders),
			"received_orders": received_orders,
			"completed_count": len(completed_orders),
			"completed_orders": completed_orders,
			"pending_count": pending_count,
			"inprogress_count": inprogress_count,
			"revenue": repair_revenue,
			"invoice_count": repair_invoice_count,
			"technician_tasks": technician_tasks,
			"top_issues": top_issues,
			"parts_used": parts_used,
		},
		"pos": {
			"total_sales": total_retail_sales + total_b2b_sales,
			"total_retail_sales": total_retail_sales,
			"total_b2b_sales": total_b2b_sales,
			"total_returns": total_returns,
			"net_sales": net_sales,
			"transaction_count": transaction_count,
			"payment_breakdown": payment_breakdown,
			"items_sold": items_sold,
			"category_breakdown": category_breakdown,
			"cashier_breakdown": cashier_breakdown,
		},
		"pms": {
			"total_vat": pms_total_vat,
			"total_sales": pms_total_sales,
			"item_count": len(pms_vat_rows),
			"rows": pms_vat_rows if is_executive else [],
		},
		"financial": {
			"total_expenses": total_expenses,
			"expense_breakdown": expense_breakdown,
			"expense_entries": expense_entries,
			"repair_payment_breakdown": repair_payment_breakdown,
			# Payment Entries overview (Receive + Pay)
			"pe_entries": pe_all,
			"pe_receive": pe_receive,
			"pe_pay": pe_pay_all,
			"total_pe_received": total_pe_received,
			"total_pe_paid": total_pe_paid,
			"net_pe_cash": net_pe_cash,
			"pe_receive_by_mode": pe_receive_by_mode,
			"pe_pay_by_mode": pe_pay_by_mode,
			# Purchase vs Operating split
			"pe_purchases": pe_purchases,
			"pe_operating": pe_operating,
			"total_pe_purchases": total_pe_purchases,
			"total_pe_operating": total_pe_operating,
			"pe_purchases_by_mode": pe_purchases_by_mode,
			"pe_operating_by_mode": pe_operating_by_mode,
			# Journal Entry detail
			"je_entries": je_detail_rows,
			"je_count": je_count,
			"je_total": je_total,
			"je_by_mode": je_by_mode,
			# JE debits on cash/bank = cash received via JE
			# je_receipt_total / je_receipt_by_mode: external only (supplier refunds etc.) → adds to income
			# je_all_debits_by_mode: all JE debits including mode-corrections → used for per-mode table
			"je_receipts": je_receipt_rows,
			"je_receipt_total": je_receipt_total,
			"je_receipt_by_mode": je_receipt_by_mode,
			"je_all_debits_by_mode": je_all_debits_by_mode,
			# Customer collections against credit invoices
			"pe_customer_collections": pe_customer_collections,
			"total_customer_collections": total_customer_collections,
			# Non-Customer PE Receives (owner deposits, supplier refunds, etc.)
			"pe_other_receipts":    pe_other_receipts,
			"total_other_receipts": total_other_receipts,
			# Credit invoices
			"credit_sales_invoices": credit_sales_invoices,
			"total_credit_sales": total_credit_sales,
			"credit_purchase_invoices": credit_purchase_invoices,
			"total_credit_purchases": total_credit_purchases,
			"paid_purchase_invoices": paid_purchase_invoices,
			"total_paid_purchases": total_paid_purchases,
			"paid_purchases_by_mode": paid_purchases_by_mode,
			"items_purchased": items_purchased,
			"item_group_profit_summary": item_group_profit_summary if is_executive else [],
			"item_profit_summary": item_profit_summary if is_executive else [],
			"sales_entries": sales_entries,
			"purchase_entries": purchase_entries,
			# GL ground-truth cash position (matches "Day Report")
			"gl_total_cash_in":   gl_total_cash_in,
			"gl_total_cash_out":  gl_total_cash_out,
			"gl_net_cash":        gl_total_cash_in - gl_total_cash_out,
			"gl_account_summary": gl_account_summary,
			# External cash flow = GL totals minus internal (cash↔cash) transfers.
			# These drive the KPI cards so they reflect real income/expense, not float moves.
			"gl_external_cash_in":  gl_external_cash_in,
			"gl_external_cash_out": gl_external_cash_out,
			"gl_external_net_cash": gl_external_cash_in - gl_external_cash_out,
			"gl_transfer_total":    gl_transfer_total,
			"internal_transfers":   internal_transfers,
			# GL aggregated by payment mode — used for S5 per-mode table (covers all voucher types)
			"gl_mode_summary":    gl_mode_summary,
		}
	}
