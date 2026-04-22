from frappe.model.document import Document


class DWMovementCaliberTemplate(Document):
	def validate(self):
		if self.caliber_code:
			self.caliber_code = self.caliber_code.strip()
		if self.description:
			self.description = self.description.strip()