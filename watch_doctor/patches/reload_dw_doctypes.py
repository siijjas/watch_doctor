import frappe


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
	]:
		try:
			frappe.reload_doc("watch_doctor", "doctype", dt)
		except Exception as exc:  # pragma: no cover - best-effort reload
			frappe.log_error(frappe.get_traceback(), f"Failed to reload {dt}: {exc}")

	# Import / refresh the bag-label print format bundled with the app
	try:
		frappe.reload_doc("Repair Management", "print_format", "dw_ro_bag_label")
	except Exception as exc:  # pragma: no cover - best-effort reload
		frappe.log_error(frappe.get_traceback(), f"Failed to reload dw_ro_bag_label print format: {exc}")
