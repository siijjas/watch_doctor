import frappe


PRINT_FORMAT_SEEDS = [
	("DW RO Bag Label", "dw_ro_bag_label"),
	("DW POS Retail Receipt", "dw_pos_retail_receipt"),
	("DW PMS Tax Invoice", "dw_pms_tax_invoice"),
]


def execute():
	"""Reload DW doctypes to ensure they exist after migrate."""
	# Ensure module record exists
	if not frappe.db.exists("Module Def", "Repair Management"):
		frappe.get_doc({"doctype": "Module Def", "module_name": "Repair Management"}).insert(
			ignore_permissions=True
		)

	for dt in [
		"dw_technician",
		"dw_repair_order",
		"dw_repair_item",
		"dw_repair_task",
		"dw_repair_part_used",
		"dw_task_template",
		"dw_watch_condition_template",
		"dw_diagnosis_summary_template",
		"dw_movement_information_template",
		"dw_movement_type_template",
		"dw_movement_caliber_template",
		"dw_movement_note_template",
	]:
		try:
			frappe.reload_doc("watch_doctor", "doctype", dt)
		except Exception as exc:  # pragma: no cover - best-effort reload
			frappe.log_error(frappe.get_traceback(), f"Failed to reload {dt}: {exc}")

	# Seed bundled print formats only if they do not exist yet.
	# Once created, keep Desk as the source of truth so admins can customize them.
	for print_format_name, print_format_slug in PRINT_FORMAT_SEEDS:
		if frappe.db.exists("Print Format", print_format_name):
			continue

		try:
			frappe.reload_doc("Repair Management", "print_format", print_format_slug)
		except Exception as exc:  # pragma: no cover - best-effort reload
			frappe.log_error(
				frappe.get_traceback(),
				f"Failed to seed {print_format_slug} print format: {exc}",
			)
