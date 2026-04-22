import frappe


REPORT_NAME = "DW Create Estimate Queue"
WORKSPACE_NAME = "Repair Management"


def execute():
	ensure_report_exists()
	if not frappe.db.exists("Report", REPORT_NAME):
		return

	if not frappe.db.exists("Workspace", WORKSPACE_NAME):
		return

	workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
	exists = any(
		shortcut.type == "Report" and shortcut.link_to == REPORT_NAME
		for shortcut in (workspace.shortcuts or [])
	)
	if exists:
		return

	workspace.append(
		"shortcuts",
		{
			"label": "Create Estimate Queue",
			"link_to": REPORT_NAME,
			"type": "Report",
		},
	)
	workspace.save(ignore_permissions=True)
	frappe.db.commit()


def ensure_report_exists():
	"""Load report definition if migrate runs this patch before report sync."""
	if frappe.db.exists("Report", REPORT_NAME):
		return

	try:
		frappe.reload_doc("repair_management", "report", "dw_create_estimate_queue")
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Failed loading DW Create Estimate Queue report")
