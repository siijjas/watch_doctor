# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWWatchModel(Document):
	"""DW Watch Model - Master doctype for watch models linked to brands."""
	
	def validate(self):
		"""Validate watch model details before saving."""
		# Ensure model name is trimmed
		if self.model_name:
			self.model_name = self.model_name.strip()
		
		# Check for duplicate brand + model combination
		if self.brand and self.model_name:
			existing = frappe.db.exists(
				"DW Watch Model",
				{
					"brand": self.brand,
					"model_name": self.model_name,
					"name": ["!=", self.name]
				}
			)
			if existing:
				frappe.throw(f"Model '{self.model_name}' already exists for brand '{self.brand}'")
