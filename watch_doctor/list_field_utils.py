"""Shared helpers for the list-valued repair-item fields stored as JSON in
Small Text columns (diagnosis_summary, movement_type, movement_caliber,
recommended_work, pre_existing_condition, ...).

Single home for logic that used to be duplicated independently in
watch_doctor/api/orders.py, the DW Repair Order controller, and
watch_doctor/whatsapp/service.py (API_PY_AUDIT.md item 6, phase 1).
"""

import json

import frappe


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
