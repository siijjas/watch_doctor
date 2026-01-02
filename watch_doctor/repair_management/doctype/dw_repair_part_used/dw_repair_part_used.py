# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWRepairPartUsed(Document):
	"""DW Repair Part Used - Child table for parts used in repairs."""
	
	def validate(self):
		"""Validate and calculate pricing fields."""
		# Fetch auto_rate from item master if part is set
		if self.part and not self.auto_rate:
			item_rate = frappe.get_cached_value("Item", self.part, "standard_rate")
			if item_rate:
				self.auto_rate = item_rate
		
		# Determine effective rate (manual or auto)
		effective_rate = self.rate if self.rate else (self.auto_rate or 0)
		
		# Calculate amount
		self.amount = (self.quantity or 0) * effective_rate
		
		# Set audit flag if manual rate is provided
		if self.rate:
			self.price_manually_set = 1
		else:
			self.price_manually_set = 0
