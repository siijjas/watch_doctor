# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWRepairItem(Document):
	"""DW Repair Item - Child table for individual watches in a repair order."""
	
	def validate(self):
		"""Auto-populate issue_description from selected issues."""
		if self.issues:
			issue_list = []
			for issue_row in self.issues:
				if issue_row.is_other and issue_row.other_description:
					issue_list.append(f"Other: {issue_row.other_description}")
				elif issue_row.issue:
					issue_name = frappe.db.get_value("DW Issue Template", issue_row.issue, "issue_name")
					if issue_name:
						issue_list.append(issue_name)
			
			self.issue_description = ", ".join(issue_list) if issue_list else ""
