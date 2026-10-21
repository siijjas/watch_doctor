# Copyright (c) 2025, Frappe Technologies and Contributors
# See license.txt

# import frappe
from frappe.tests.utils import FrappeTestCase

# Building ERPNext's _Test records for Mode of Payment (accounts, company, cost
# centers) fails on a copy of the shop's site, and nothing here needs them.
test_ignore = ["Mode of Payment"]


class TestDWPaymentModeConfig(FrappeTestCase):
	pass
