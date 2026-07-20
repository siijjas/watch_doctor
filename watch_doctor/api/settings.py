"""Settings/app-config endpoints split from watch_doctor/api.py (API_PY_AUDIT.md item 5).

App/user info, print formats, invoice workflow, general configuration, PMS configuration.
"""

import json

import frappe
from frappe import _  # noqa: F401

from watch_doctor.invoice_settings import (
    clear_invoice_settings_cache,
    get_invoice_workflow_options,
    get_invoice_workflow_settings,
    get_sales_invoice_print_context,
    validate_invoice_workflow_settings,
)
from watch_doctor.general_configuration import get_general_configuration, set_general_configuration
from watch_doctor.permissions import (
    require_roles,
    get_dw_roles,
    get_current_technician_identifiers,
    ROLE_EXECUTIVE,
    ROLE_DATA_ENTRY,
)
from watch_doctor.api.pos import _get_default_company


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

	clear_invoice_settings_cache()
	frappe.clear_cache()
	_log_settings_change("Invoice Workflow", config)
	return {"success": True, "config": get_invoice_workflow_settings()}


@frappe.whitelist()
def get_sales_invoice_print_context_api(invoice_name: str):
	"""Return workflow-aware print format metadata for a Sales Invoice."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
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
	frappe.db.set_default("dw_logo_url", logo_url, "watch_doctor")
	return {"success": True}


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
