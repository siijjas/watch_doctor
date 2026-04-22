from frappe.model.document import Document


class DWDiagnosisSummaryTemplate(Document):
	def validate(self):
		if self.summary_name:
			self.summary_name = self.summary_name.strip()
		if self.description:
			self.description = self.description.strip()