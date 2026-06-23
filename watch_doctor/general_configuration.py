"""Runtime accessors for app-level general configuration."""

from __future__ import annotations

import frappe


DOCTYPE_NAME = "DW General Configuration"
DEFAULT_RECEIPT_SUBTITLE = "Watch & Jewellery Repair Service"

FIELD_DEFINITIONS = [
	{
		"fieldname": "company_section",
		"fieldtype": "Section Break",
		"label": "Company Identity",
	},
	{
		"fieldname": "company_name",
		"fieldtype": "Data",
		"label": "Company Name",
	},
	{
		"fieldname": "company_phone",
		"fieldtype": "Data",
		"label": "Phone Number",
	},
	{
		"fieldname": "company_email",
		"fieldtype": "Data",
		"label": "Email",
	},
	{
		"fieldname": "company_website",
		"fieldtype": "Data",
		"label": "Website",
	},
	{
		"fieldname": "company_address",
		"fieldtype": "Small Text",
		"label": "Address",
	},
	{
		"fieldname": "regulatory_section",
		"fieldtype": "Section Break",
		"label": "Regulatory Details",
	},
	{
		"fieldname": "cr_number",
		"fieldtype": "Data",
		"label": "CR Number",
	},
	{
		"fieldname": "vat_registration_number",
		"fieldtype": "Data",
		"label": "VAT Registration Number",
	},
	{
		"fieldname": "print_section",
		"fieldtype": "Section Break",
		"label": "Print Format Defaults",
	},
	{
		"fieldname": "repair_receipt_subtitle",
		"fieldtype": "Data",
		"label": "Repair Receipt Subtitle",
		"description": "Shown below the title on repair order drop-off receipts.",
	},
	{
		"fieldname": "whatsapp_section",
		"fieldtype": "Section Break",
		"label": "WhatsApp",
	},
	{
		"fieldname": "whatsapp_default_country_code",
		"fieldtype": "Data",
		"label": "Default Country Code",
		"description": "Digits only, e.g. 973 for Bahrain. Prepended to local mobile numbers when sending WhatsApp messages.",
	},
]

CONFIG_FIELDS = [
	"company_name",
	"company_phone",
	"company_email",
	"company_website",
	"company_address",
	"cr_number",
	"vat_registration_number",
	"repair_receipt_subtitle",
	"whatsapp_default_country_code",
]


def _safe_company_value(company_name: str | None, fieldname: str) -> str:
	if not company_name:
		return ""
	try:
		meta = frappe.get_meta("Company")
		if not meta.get_field(fieldname):
			return ""
		return frappe.db.get_value("Company", company_name, fieldname) or ""
	except Exception:
		return ""


def get_default_general_configuration() -> dict[str, str]:
	default_company = frappe.db.get_single_value("Global Defaults", "default_company")
	company_name = _safe_company_value(default_company, "company_name") or default_company or "Watch Doctor"
	company_address = _safe_company_value(default_company, "company_address") or _safe_company_value(default_company, "address")
	vat_registration_number = _safe_company_value(default_company, "tax_id")
	company_phone = _safe_company_value(default_company, "phone_no")
	company_email = _safe_company_value(default_company, "email")
	company_website = _safe_company_value(default_company, "website")

	return {
		"company_name": company_name,
		"company_phone": company_phone,
		"company_email": company_email,
		"company_website": company_website,
		"company_address": company_address,
		"cr_number": "",
		"vat_registration_number": vat_registration_number,
		"repair_receipt_subtitle": DEFAULT_RECEIPT_SUBTITLE,
	}


def get_general_configuration() -> dict[str, str]:
	defaults = get_default_general_configuration()
	if not frappe.db.exists("DocType", DOCTYPE_NAME):
		return defaults

	config = defaults.copy()
	for fieldname in CONFIG_FIELDS:
		value = frappe.db.get_single_value(DOCTYPE_NAME, fieldname)
		if value not in (None, ""):
			config[fieldname] = value

	if not config.get("repair_receipt_subtitle"):
		config["repair_receipt_subtitle"] = DEFAULT_RECEIPT_SUBTITLE

	return config


def set_general_configuration(config: dict[str, str]) -> dict[str, str]:
	for fieldname in CONFIG_FIELDS:
		frappe.db.set_single_value(DOCTYPE_NAME, fieldname, (config.get(fieldname) or "").strip())
	frappe.db.commit()
	frappe.clear_cache()
	return get_general_configuration()