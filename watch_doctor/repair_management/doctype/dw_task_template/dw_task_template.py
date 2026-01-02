# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWTaskTemplate(Document):
	"""DW Task Template - Master doctype for managing task templates."""
	
	def validate(self):
		"""Validate task template details before saving."""
		# Add any custom validation logic here
		pass
