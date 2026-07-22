# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWWatchConditionTemplate(Document):
	"""DW Watch Condition Template - Master doctype for intake condition presets."""

	def validate(self):
		"""Normalize template values before save."""
		if self.condition_name:
			self.condition_name = self.condition_name.strip()
		if self.description:
			self.description = self.description.strip()

		if not self.display_order:
			max_order = frappe.db.sql(
				"select max(display_order) from `tabDW Watch Condition Template` where name != %s",
				(self.name or ""),
			)[0][0]
			self.display_order = (max_order or 0) + 1
