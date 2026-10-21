"""Invoice workflow settings tolerate a DW Invoice Settings doctype that lacks some fields."""

import unittest
from unittest.mock import patch

import frappe

from watch_doctor import invoice_settings


class _Meta:
	def __init__(self, fields):
		self._fields = set(fields)

	def get_field(self, fieldname):
		return fieldname if fieldname in self._fields else None


class InvoiceWorkflowSettingsTests(unittest.TestCase):
	def setUp(self):
		# The settings are cached per request on frappe.local.
		frappe.local.dw_invoice_settings = None

	tearDown = setUp

	def test_get_invoice_workflow_settings_skips_missing_fields(self):
		meta = _Meta({
			"repair_service_naming_series",
			"repair_service_print_format",
			"pos_standard_naming_series",
			"pos_standard_print_format",
			"pos_pms_naming_series",
			"pos_pms_print_format",
		})
		requested_fields = []

		def _get_single_value(doctype, fieldname):
			requested_fields.append(fieldname)
			return ""

		with patch.object(frappe.db, "exists", lambda doctype, name: True), \
			patch.object(frappe, "get_meta", lambda doctype: meta), \
			patch.object(frappe.db, "get_single_value", _get_single_value):
			config = invoice_settings.get_invoice_workflow_settings()

		self.assertEqual(config["ro_label_print_format"], "DW RO Bag Label")
		self.assertNotIn("ro_label_print_format", requested_fields)
