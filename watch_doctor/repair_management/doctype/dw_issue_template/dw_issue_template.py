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
