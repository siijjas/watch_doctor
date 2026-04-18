"""Supported POS enhancements for the custom Watch Doctor POS flow."""

from urllib.parse import quote

import frappe
from frappe.utils import cint, flt

from watch_doctor.invoice_settings import (
	WORKFLOW_POS_STANDARD,
	apply_pos_workflow_settings,
	get_workflow_settings,
)
from watch_doctor.pms import get_pms_runtime_configuration


def _parse_multiline_options(value) -> list[str]:
	return [row.strip() for row in (value or "").splitlines() if row.strip()]


def _get_sales_invoice_naming_series_options() -> list[str]:
	field = frappe.get_meta("Sales Invoice").get_field("naming_series")
	if not field or not getattr(field, "options", None):
		return []
	return _parse_multiline_options(field.options)


def get_default_pos_profile(company: str, selected_profile: str | None = None) -> str:
	if selected_profile and frappe.db.exists("POS Profile", selected_profile):
		return selected_profile

	user_default = frappe.defaults.get_user_default("POS Profile")
	if user_default and frappe.db.exists("POS Profile", {"name": user_default, "company": company}):
		return user_default

	profiles = frappe.get_all(
		"POS Profile",
		filters={"company": company},
		fields=["name"],
		order_by="modified desc",
		limit_page_length=1,
	)
	return profiles[0].name if profiles else ""


def get_pos_profile_settings(company: str, selected_profile: str | None = None) -> dict:
	available_naming_series = _get_sales_invoice_naming_series_options()
	standard_workflow_settings = get_workflow_settings(WORKFLOW_POS_STANDARD)
	profile_name = get_default_pos_profile(company, selected_profile)
	profile_settings = {
		"pos_profile": profile_name,
		"default_customer": "",
		"default_customer_name": "",
		"default_receipt_format": standard_workflow_settings.get("print_format") or "",
		"auto_print": 0,
		"default_sales_person": "",
		"default_commission_rate": 0.0,
		"allowed_naming_series": [standard_workflow_settings.get("naming_series")] if standard_workflow_settings.get("naming_series") else [],
		"available_naming_series": available_naming_series,
		"print_formats": [],
		"sales_persons": [],
	}

	print_formats = frappe.get_all(
		"Print Format",
		filters={"doc_type": "Sales Invoice", "disabled": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=200,
	)
	sales_persons = frappe.get_all(
		"Sales Person",
		filters={"is_group": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=200,
	)
	profile_settings["print_formats"] = print_formats
	profile_settings["sales_persons"] = sales_persons

	if not profile_name:
		return profile_settings

	profile = frappe.get_cached_doc("POS Profile", profile_name)
	profile_settings["default_customer"] = profile.get("dw_default_customer") or ""
	if profile_settings["default_customer"]:
		profile_settings["default_customer_name"] = (
			frappe.get_cached_value("Customer", profile_settings["default_customer"], "customer_name")
			or profile_settings["default_customer"]
		)
	profile_settings["auto_print"] = cint(profile.get("dw_enable_auto_print"))
	profile_settings["default_sales_person"] = profile.get("dw_default_sales_person") or ""
	profile_settings["default_commission_rate"] = flt(profile.get("dw_default_commission_rate"))

	return profile_settings


def validate_series_selection(requested_series: str, profile_settings: dict) -> str:
	allowed_series = profile_settings.get("allowed_naming_series") or []
	if requested_series:
		if allowed_series and requested_series not in allowed_series:
			frappe.throw(f"Naming series {requested_series} is not allowed for the selected POS Profile.")
		return requested_series
	return allowed_series[0] if allowed_series else ""


def resolve_receipt_format(selected_format: str, has_pms_items: bool, profile_settings: dict) -> str:
	resolved = selected_format or profile_settings.get("default_receipt_format") or "DW POS Retail Receipt"
	if resolved and not frappe.db.exists("Print Format", {"name": resolved, "doc_type": "Sales Invoice", "disabled": 0}):
		frappe.throw(f"Print Format {resolved} is not an active Sales Invoice print format.")
	return resolved


def apply_pos_profile(invoice, *, has_pms_items: bool, customer: str = "", pos_profile: str = "", sales_person: str = "", commission_rate: float = 0, receipt_format: str = "", naming_series: str = "") -> dict:
	profile_settings = get_pos_profile_settings(invoice.company, pos_profile)
	resolved_customer = customer or profile_settings.get("default_customer") or ""
	if not resolved_customer:
		frappe.throw("Customer is required or a default customer must be configured on the POS Profile.")

	invoice.customer = resolved_customer
	invoice.dw_pos_profile = profile_settings.get("pos_profile") or ""
	invoice.dw_pos_sales_person = sales_person or profile_settings.get("default_sales_person") or ""
	invoice.dw_pos_commission_rate = flt(commission_rate or profile_settings.get("default_commission_rate") or 0)
	workflow_settings = apply_pos_workflow_settings(invoice, has_pms_items)
	profile_settings["default_receipt_format"] = workflow_settings.get("print_format") or ""
	profile_settings["allowed_naming_series"] = [workflow_settings.get("naming_series")] if workflow_settings.get("naming_series") else []

	if invoice.dw_pos_sales_person:
		invoice.set("sales_team", [])
		invoice.append("sales_team", {
			"sales_person": invoice.dw_pos_sales_person,
			"allocated_percentage": 100,
			"commission_rate": invoice.dw_pos_commission_rate,
		})

	return profile_settings


def build_pos_print_url(invoice, profile_settings: dict) -> str:
	print_format = invoice.get("dw_pos_receipt_format") or resolve_receipt_format("", cint(invoice.get("dw_has_pms_items")) == 1, profile_settings)
	if not print_format:
		return ""
	return "/printview?doctype=Sales%20Invoice&name={name}&format={fmt}&no_letterhead=1".format(
		name=quote(invoice.name),
		fmt=quote(print_format),
	)