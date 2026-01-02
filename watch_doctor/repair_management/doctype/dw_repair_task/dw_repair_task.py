# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWRepairTask(Document):
	"""DW Repair Task - Child table for repair tasks within a repair item."""
	
	def validate(self):
		"""Validate and set pricing fields."""
		# Fetch auto_rate from task template if service is set
		if self.service and not self.auto_rate:
			task_template = frappe.get_cached_value("DW Task Template", self.service, "default_rate")
			if task_template:
				self.auto_rate = task_template
		
		# Set audit flag if manual rate is provided
		if self.rate:
			self.price_manually_set = 1
		else:
			self.price_manually_set = 0
