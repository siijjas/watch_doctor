"""Seed default movement type templates."""

import frappe


DEFAULT_MOVEMENT_TYPE_TEMPLATES = [
	("Quartz movement", "Watch uses a quartz movement."),
	("Automatic movement", "Watch uses an automatic self-winding movement."),
	("Manual-wind movement", "Watch uses a manual-wind movement."),
	("Chronograph movement", "Watch contains a chronograph complication."),
	("GMT movement", "Watch contains a GMT or dual-time movement."),
	("Day-date movement", "Watch contains both day and date indication."),
	("Moonphase movement", "Watch contains a moonphase complication."),
	("Co-axial movement", "Watch uses a co-axial escapement design."),
	("Solar movement", "Watch uses a solar-powered quartz movement."),
	("Kinetic movement", "Watch uses a kinetic or autoquartz charging system."),
	("Eco-Drive movement", "Watch uses Citizen Eco-Drive light-powered technology."),
	("Mecha-quartz movement", "Watch uses a hybrid mecha-quartz chronograph movement."),
	("Vintage movement", "Movement is from an older or vintage production period."),
	("Swiss movement", "Movement is identified as Swiss manufacture."),
	("Japanese movement", "Movement is identified as Japanese manufacture."),
]


def execute():
	"""Create default movement type templates when missing."""
	for movement_type, description in DEFAULT_MOVEMENT_TYPE_TEMPLATES:
		if frappe.db.exists("DW Movement Type Template", {"movement_type": movement_type}):
			continue

		frappe.get_doc({
			"doctype": "DW Movement Type Template",
			"movement_type": movement_type,
			"description": description,
			"is_active": 1,
		}).insert(ignore_permissions=True)

	frappe.db.commit()