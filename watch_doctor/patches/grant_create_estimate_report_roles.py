import frappe


REPORT_NAME = "DW Create Estimate Queue"
REQUIRED_ROLES = {"System Manager", "DW Executive", "DW Data Entry"}


def execute():
	if not frappe.db.exists("Report", REPORT_NAME):
		return

	report = frappe.get_doc("Report", REPORT_NAME)
	existing_roles = {row.role for row in (report.roles or []) if row.role}
	missing_roles = REQUIRED_ROLES - existing_roles
	if not missing_roles:
		return

	for role in sorted(missing_roles):
		report.append("roles", {"role": role})

	report.save(ignore_permissions=True)
	frappe.db.commit()
