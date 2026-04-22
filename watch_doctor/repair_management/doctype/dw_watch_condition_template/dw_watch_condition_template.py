# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DWWatchConditionTemplate(Document):
	"""DW Watch Condition Template - Master doctype for intake condition presets."""

	def validate(self):
		"""Normalize template values before save."""
		if self.condition_name:
			self.condition_name = self.condition_name.strip()
		if self.description:
			self.description = self.description.strip()
