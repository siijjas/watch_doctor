# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class DWRecommendedWorkTemplate(Document):
	def validate(self):
		if self.work_name:
			self.work_name = self.work_name.strip()

	def after_insert(self):
		self._ensure_linked_task_template()

	def on_update(self):
		self._ensure_linked_task_template()

	def _ensure_linked_task_template(self):
		work_name = str(self.work_name or "").strip()
		if not work_name:
			return

		if frappe.db.exists("DW Task Template", {"task_name": work_name}):
			return

		task_doc = frappe.get_doc({
			"doctype": "DW Task Template",
			"task_name": work_name,
			"description": (self.description or "").strip() or None,
		})
		try:
			task_doc.insert(ignore_permissions=True)
		except Exception:
			# If another process created it simultaneously, continue without failing.
			if not frappe.db.exists("DW Task Template", {"task_name": work_name}):
				raise
