# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class DWRecommendedWorkTemplate(Document):
	def validate(self):
		if self.work_name:
			self.work_name = self.work_name.strip()
