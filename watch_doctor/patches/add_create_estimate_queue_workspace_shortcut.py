import frappe


REPORT_NAME = "DW Create Estimate Queue"
WORKSPACE_NAME = "Repair Management"


def execute():
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
