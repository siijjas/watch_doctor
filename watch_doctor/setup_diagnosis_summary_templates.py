"""Seed default diagnosis summary templates."""

import frappe


DEFAULT_DIAGNOSIS_SUMMARY_TEMPLATES = [
	("Circuit Damage", "Circuit damage found."),
	("Movement Damage", "Movement damage found."),
	("Hour Wheel Damage", "Hour wheel damage found."),
	("Minute Wheel Damage", "Minute wheel damage found."),
	("Lever Damage", "Lever damage found."),
	("Main Spring Damage", "Main spring damage found."),
	("Automatic Rotor Damage", "Automatic rotor damage found."),
	("Escape Wheel Damage", "Escape wheel damage found."),
	("Third Wheel Damage", "Third wheel damage found."),
	("Fourth Wheel Damage", "Fourth wheel damage found."),
	("Balance Staff Damage", "Balance staff damage found."),
	("Balance Pivot Damage", "Balance pivot damage found."),
	("Pallet Fork Damage", "Pallet fork damage found."),
	("Barrel Arbor Damage", "Barrel arbor damage found."),
	("Cannon Pinion Damage", "Cannon pinion damage found."),
	("Setting Lever Damage", "Setting lever damage found."),
	("Stem Damage", "Stem damage found."),
	("Crown Wheel Damage", "Crown wheel damage found."),
	("Ratchet Wheel Damage", "Ratchet wheel damage found."),
	("Keyless Works Damage", "Keyless works damage found."),
	("Gear Train Damage", "Gear train damage found."),
	("Calendar Mechanism Damage", "Calendar mechanism damage found."),
	("Chronograph Module Damage", "Chronograph module damage found."),
	("Battery Contact Damage", "Battery contact damage found."),
	("Coil Damage", "Coil damage found."),
	("Step Motor Damage", "Step motor damage found."),
	("Dial Train Damage", "Dial train damage found."),
]


def execute():
	"""Seed default diagnosis summary templates without overwriting user-managed records."""
	for summary_name, description in DEFAULT_DIAGNOSIS_SUMMARY_TEMPLATES:
		if frappe.db.exists("DW Diagnosis Summary Template", {"summary_name": summary_name}):
			continue

		frappe.get_doc({
			"doctype": "DW Diagnosis Summary Template",
			"summary_name": summary_name,
			"description": description,
			"is_active": 1,
		}).insert(ignore_permissions=True)

	frappe.db.commit()
