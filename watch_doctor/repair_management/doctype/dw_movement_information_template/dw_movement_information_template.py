from frappe.model.document import Document


class DWMovementInformationTemplate(Document):
	def validate(self):
		if self.movement_info:
			self.movement_info = self.movement_info.strip()
		if self.description:
			self.description = self.description.strip()