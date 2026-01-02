# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWTechnician(Document):
	"""DW Technician - Master doctype for managing technicians."""
	
	def validate(self):
		"""Validate technician details before saving."""
		# Add any custom validation logic here
		pass
