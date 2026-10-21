"""PMS invoice validation, with the PMS lookups stubbed out (no database rows needed)."""

import unittest
from unittest.mock import patch

from watch_doctor import pms


class _DummyItem:
	def __init__(self, item_code: str, amount: float = 0.0, warehouse: str | None = None):
		self.item_code = item_code
		self.amount = amount
		self.warehouse = warehouse

	def set(self, fieldname, value):
		setattr(self, fieldname, value)

	def get(self, fieldname, default=None):
		return getattr(self, fieldname, default)


class _DummyDoc:
	def __init__(self, items):
		self.items = items
		self.set_warehouse = None
		self.taxes_and_charges = "TAX-TEMPLATE"
		self.taxes = [object()]

	def set(self, fieldname, value):
		setattr(self, fieldname, value)

	def get(self, fieldname, default=None):
		return getattr(self, fieldname, default)


class PmsInvoiceValidateTests(unittest.TestCase):
	def test_standard_invoice_validate_skips_pms_configuration(self):
		doc = _DummyDoc([_DummyItem("STD-001", amount=100.0)])

		def _unexpected_require():
			raise AssertionError("PMS configuration should not be required for standard invoices")

		with patch.object(pms, "validate_pms_item_mix", lambda item_codes: ([], item_codes)), \
			patch.object(pms, "_is_pms_item", lambda item_code: False), \
			patch.object(pms, "require_pms_runtime_configuration", _unexpected_require):
			pms.si_validate(doc)

		self.assertEqual(doc.dw_has_pms_items, 0)
		self.assertEqual(doc.dw_pms_total_vat, 0)
		self.assertEqual(doc.dw_pms_disclaimer, "")
		self.assertEqual(doc.taxes_and_charges, "TAX-TEMPLATE")
		self.assertEqual(len(doc.taxes), 1)

	def test_pms_invoice_validate_still_requires_configuration(self):
		doc = _DummyDoc([_DummyItem("PMS-001", amount=100.0)])

		def _missing():
			raise RuntimeError("missing PMS configuration")

		with patch.object(pms, "validate_pms_item_mix", lambda item_codes: (item_codes, [])), \
			patch.object(pms, "_is_pms_item", lambda item_code: True), \
			patch.object(pms, "require_pms_runtime_configuration", _missing):
			with self.assertRaisesRegex(RuntimeError, "missing PMS configuration"):
				pms.si_validate(doc)
