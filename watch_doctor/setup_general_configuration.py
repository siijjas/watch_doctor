"""Idempotent setup for centralized general configuration."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from watch_doctor.general_configuration import (
	CONFIG_FIELDS,
	DOCTYPE_NAME,
	FIELD_DEFINITIONS,
	get_default_general_configuration,
)


def execute():
	"""Ensure the general configuration singleton exists with current fields."""
	_ensure_general_configuration()
	_ensure_general_configuration_fields()
	_ensure_default_values()
	frappe.db.commit()
	frappe.clear_cache()


def _ensure_general_configuration():
	if frappe.db.exists("DocType", DOCTYPE_NAME):
		return

	doc = frappe.get_doc({
		"doctype": "DocType",
		"name": DOCTYPE_NAME,
		"module": "Repair Management",
		"custom": 1,
		"issingle": 1,
		"editable_grid": 0,
		"track_changes": 0,
		"fields": FIELD_DEFINITIONS,
		"permissions": [
			{"role": "System Manager", "read": 1, "write": 1, "create": 1},
			{"role": "DW Executive", "read": 1, "write": 1},
		],
	})
	doc.flags.ignore_permissions = True
	doc.insert()


def _ensure_general_configuration_fields():
	if not frappe.db.exists("DocType", DOCTYPE_NAME):
		return

	meta = frappe.get_meta(DOCTYPE_NAME)
	missing_fields = [field for field in FIELD_DEFINITIONS if not meta.get_field(field["fieldname"])]
	if not missing_fields:
		return

	create_custom_fields({DOCTYPE_NAME: missing_fields}, update=True)


def _ensure_default_values():
	if not frappe.db.exists("DocType", DOCTYPE_NAME):
		return

	defaults = get_default_general_configuration()
	for fieldname in CONFIG_FIELDS:
		current_value = frappe.db.get_single_value(DOCTYPE_NAME, fieldname)
		if current_value in (None, "") and defaults.get(fieldname):
			frappe.db.set_single_value(DOCTYPE_NAME, fieldname, defaults[fieldname])