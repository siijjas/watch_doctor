# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWIssueTemplate(Document):
	"""DW Issue Template - Master doctype for common watch issues."""
	
	def validate(self):
		"""Validate issue template details before saving."""
		# Ensure issue name is trimmed
		if self.issue_name:
			self.issue_name = self.issue_name.strip()

		if not self.display_order:
			max_order = frappe.db.sql(
				"select max(display_order) from `tabDW Issue Template` where name != %s",
				(self.name or ""),
			)[0][0]
			self.display_order = (max_order or 0) + 1
