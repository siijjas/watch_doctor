"""Centralized settings and helpers for Sales Invoice workflows."""

from __future__ import annotations

import frappe


WORKFLOW_REPAIR_SERVICE = "repair_service"
WORKFLOW_POS_STANDARD = "pos_standard"
WORKFLOW_POS_PMS = "pos_pms"

DEFAULT_INVOICE_SETTINGS = {
	"repair_service_naming_series": "",
	"repair_service_print_format": "Standard",
	"pos_standard_naming_series": "",
	"pos_standard_print_format": "DW POS Retail Receipt",
	"pos_pms_naming_series": "",
	"pos_pms_print_format": "DW PMS Tax Invoice",
	"ro_label_print_format": "DW RO Bag Label",
}


def clear_invoice_settings_cache():
	"""Clear request-local invoice settings cache."""
	for attr in ("dw_invoice_settings", "dw_sales_invoice_series_options"):
		if hasattr(frappe.local, attr):
			delattr(frappe.local, attr)


def _parse_multiline_options(value: str | None) -> list[str]:
	return [row.strip() for row in (value or "").splitlines() if row.strip()]


def get_sales_invoice_naming_series_options() -> list[str]:
	"""Return available naming series options from Sales Invoice metadata."""
	cached = getattr(frappe.local, "dw_sales_invoice_series_options", None)
	if cached is not None:
		return cached

	field = frappe.get_meta("Sales Invoice").get_field("naming_series")
	options = _parse_multiline_options(getattr(field, "options", "") if field else "")
	frappe.local.dw_sales_invoice_series_options = options
	return options


def get_sales_invoice_print_format_options() -> list[str]:
	"""Return active Sales Invoice print formats."""
	return frappe.get_all(
		"Print Format",
		filters={"doc_type": "Sales Invoice", "disabled": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=200,
	)


def get_repair_order_print_format_options() -> list[str]:
	"""Return active Repair Order print formats."""
	return frappe.get_all(
		"Print Format",
		filters={"doc_type": "DW Repair Order", "disabled": 0},
		pluck="name",
		order_by="name asc",
		limit_page_length=200,
	)


def get_ro_label_print_format() -> str:
	"""Return the configured repair order label print format."""
	config = get_invoice_workflow_settings()
	return config.get("ro_label_print_format") or "DW RO Bag Label"


def get_invoice_workflow_settings() -> dict:
	"""Return centralized workflow settings with safe defaults."""
	cached = getattr(frappe.local, "dw_invoice_settings", None)
	if cached is not None:
		return cached

	config = dict(DEFAULT_INVOICE_SETTINGS)

	try:
		if frappe.db.exists("DocType", "DW Invoice Settings"):
			meta = frappe.get_meta("DW Invoice Settings")
			for fieldname in DEFAULT_INVOICE_SETTINGS:
				if not meta.get_field(fieldname):
					continue
				config[fieldname] = frappe.db.get_single_value("DW Invoice Settings", fieldname) or config[fieldname]
	except Exception:
		pass

	frappe.local.dw_invoice_settings = config
	return config


def get_invoice_workflow_options() -> dict:
	"""Return frontend option lists for centralized invoice workflow settings."""
	return {
		"naming_series": get_sales_invoice_naming_series_options(),
		"print_formats": get_sales_invoice_print_format_options(),
		"repair_order_print_formats": get_repair_order_print_format_options(),
	}


def get_workflow_settings(workflow_type: str) -> dict:
	"""Return naming series and print format for a given invoice workflow."""
	config = get_invoice_workflow_settings()
	field_prefix_map = {
		WORKFLOW_REPAIR_SERVICE: "repair_service",
		WORKFLOW_POS_STANDARD: "pos_standard",
		WORKFLOW_POS_PMS: "pos_pms",
	}
	prefix = field_prefix_map.get(workflow_type)
	if not prefix:
		frappe.throw(f"Unsupported invoice workflow: {workflow_type}")

	return {
		"workflow_type": workflow_type,
		"naming_series": config.get(f"{prefix}_naming_series") or "",
		"print_format": config.get(f"{prefix}_print_format") or "",
	}


def validate_invoice_workflow_settings(config: dict):
	"""Validate centralized workflow settings before save."""
	available_series = set(get_sales_invoice_naming_series_options())
	active_print_formats = set(get_sales_invoice_print_format_options())
	active_ro_formats = set(get_repair_order_print_format_options())

	for fieldname in (
		"repair_service_naming_series",
		"pos_standard_naming_series",
		"pos_pms_naming_series",
	):
		value = (config.get(fieldname) or "").strip()
		if value and available_series and value not in available_series:
			frappe.throw(f"Naming series {value} is not available on Sales Invoice")

	for fieldname in (
		"repair_service_print_format",
		"pos_standard_print_format",
		"pos_pms_print_format",
	):
		value = (config.get(fieldname) or "").strip()
		if value == "Standard":
			continue
		if value and value not in active_print_formats:
			frappe.throw(f"Print Format {value} is not an active Sales Invoice print format")

	# Validate repair order label print format
	ro_format = (config.get("ro_label_print_format") or "").strip()
	if ro_format and ro_format not in active_ro_formats:
		frappe.throw(f"Print Format {ro_format} is not an active DW Repair Order print format")


def get_pos_invoice_workflow(has_pms_items: bool) -> str:
	"""Resolve the POS workflow variant from line-item composition."""
	return WORKFLOW_POS_PMS if has_pms_items else WORKFLOW_POS_STANDARD


def apply_workflow_naming_series(invoice, workflow_type: str) -> dict:
	"""Apply workflow naming series to a Sales Invoice document."""
	settings = get_workflow_settings(workflow_type)
	if settings.get("naming_series"):
		invoice.naming_series = settings["naming_series"]
	return settings


def apply_pos_workflow_settings(invoice, has_pms_items: bool) -> dict:
	"""Apply centralized POS workflow print format and naming series."""
	workflow_type = get_pos_invoice_workflow(has_pms_items)
	settings = get_workflow_settings(workflow_type)
	invoice.dw_pos_receipt_format = settings.get("print_format") or ""
	if settings.get("naming_series"):
		invoice.naming_series = settings["naming_series"]
	return settings


def detect_sales_invoice_workflow(invoice_or_name) -> str:
	"""Detect which centralized workflow a Sales Invoice belongs to."""
	invoice = invoice_or_name
	if isinstance(invoice_or_name, str):
		invoice = frappe.get_doc("Sales Invoice", invoice_or_name)

	if frappe.db.exists("DW Repair Order", {"sales_invoice": invoice.name}):
		return WORKFLOW_REPAIR_SERVICE

	if int(invoice.get("dw_has_pms_items") or 0) == 1:
		return WORKFLOW_POS_PMS

	return WORKFLOW_POS_STANDARD


def get_sales_invoice_print_context(invoice_or_name) -> dict:
	"""Return workflow-aware print metadata for a Sales Invoice."""
	workflow_type = detect_sales_invoice_workflow(invoice_or_name)
	settings = get_workflow_settings(workflow_type)
	return {
		"workflow_type": workflow_type,
		"print_format": settings.get("print_format") or "Standard",
	}