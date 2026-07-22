"""Shared helpers for the list-valued repair-item fields stored as JSON in
Small Text columns (diagnosis_summary, movement_type, movement_caliber,
recommended_work, pre_existing_condition, ...).

Single home for logic that used to be duplicated independently in
watch_doctor/api/orders.py, the DW Repair Order controller, and
watch_doctor/whatsapp/service.py (API_PY_AUDIT.md item 6, phase 1).
"""

import json


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


def split_legacy_movement_information(values):
	"""Split legacy free-text movement_information into movement_type/caliber.

	Every entry must land in one of the two buckets — anything that isn't a
	recognized movement type name falls through to movement_caliber rather
	than being discarded, so no legacy text is ever silently dropped.
	"""
	movement_type = []
	movement_caliber = []

	for entry in normalize_string_list(values):
		if entry.lower() in MOVEMENT_TYPE_VALUES:
			movement_type.append(entry)
		else:
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
