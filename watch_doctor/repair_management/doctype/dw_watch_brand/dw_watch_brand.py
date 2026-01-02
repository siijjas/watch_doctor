# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWWatchBrand(Document):
	"""DW Watch Brand - Master doctype for watch brands."""
	
	def validate(self):
		"""Validate watch brand details before saving."""
		# Ensure brand name is title case for consistency
		if self.brand_name:
			self.brand_name = self.brand_name.strip()
