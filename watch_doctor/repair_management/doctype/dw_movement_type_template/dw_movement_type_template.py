from frappe.model.document import Document


class DWMovementTypeTemplate(Document):
	def validate(self):
		if self.movement_type:
			self.movement_type = self.movement_type.strip()
		if self.description:
			self.description = self.description.strip()