"""Regression tests for the security audit's High and Medium findings.

1. Print formats escape every value they print (Frappe's Jinja has no autoescape).
2. Invoicing: finalize_invoice is internal, create_sales_invoice is Executive-only,
   and an invoice can only be finalised against the order it was built for.
3. Repair order saves cannot set billing fields, mark watches collected, take
   child rows from another order, or store non-local photo URLs.
4. Technicians cannot list other orders' child rows.
5. The till: draft endpoints only touch held till sales, carts cannot go
   negative, commission is the owner's call, cost stays with the owner, and a
   refund never exceeds the money actually taken.
6. Smaller gaps: capped inputs, staff-only config, no unpaid close of a
   worked-on watch, invoice notes, technician photo edits, till retries.
"""

import glob
import json
import re
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from watch_doctor.api.dashboard import get_orders_trend
from watch_doctor.api.jobs import collect_watches
from watch_doctor.api.pos import (
	build_pos_invoice,
	create_pos_return,
	delete_pos_draft,
	get_pos_invoice_return_items,
	load_pos_draft,
	submit_pos_draft,
)
from watch_doctor.api.settings import get_app_config
from watch_doctor.api.till import till_charge, till_hold, till_preview
from watch_doctor.api.orders import save_repair_order, update_repair_item_photos
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	build_sales_invoice,
	close_repair_order_without_invoice,
	create_sales_invoice,
	finalize_invoice,
	set_invoice_note,
)
from watch_doctor.pms import _is_pms_item, get_pms_info
from watch_doctor.pos_enhancements import resolve_commission_rate
from watch_doctor.tests import fixtures as fx

# Outputs allowed to stay raw: app-built SVG, and Text Editor HTML the app
# escapes on write (Frappe sanitises Desk edits).
RAW_OUTPUTS = ('order_qr_svg(', 'doc.terms')


class PrintFormatEscapingTests(FrappeTestCase):
	def test_every_print_format_output_is_escaped(self):
		base = frappe.get_app_path("watch_doctor", "repair_management", "print_format")
		for path in glob.glob(f"{base}/*/*.json"):
			html = json.load(open(path))["html"]
			for expr in re.findall(r"\{\{-?\s*(.*?)\s*-?\}\}", html, re.S):
				if expr.startswith(RAW_OUTPUTS):
					continue
				self.assertRegex(expr, r"\|\s*e$", f"{path}: unescaped {{{{ {expr} }}}}")


class RepairOrderSecurityTests(FrappeTestCase):
	def setUp(self):
		# finalize_invoice commits; keep everything inside the test transaction.
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)

		self.customer = fx.make_customer()
		self.brand, self.model = fx.make_brand_model()
		self.task, _ = fx.make_task_template()
		self.desk_user = fx.make_user("DW Data Entry")

	def _order(self, completed=True, watches=1):
		items = [{
			"watch_brand": self.brand,
			"watch_model": self.model,
			"tasks": [{"service": self.task, "is_manual": 1, "status": "Completed" if completed else "Pending"}],
			"parts_used": [], "issues": [],
		} for _ in range(watches)]
		result = save_repair_order({
			"doctype": "DW Repair Order",
			"customer": self.customer,
			"received_date": nowdate(),
			"promised_delivery_date": add_days(nowdate(), 7),
			"priority": "Normal",
			"items": items,
		})
		return frappe.get_doc("DW Repair Order", result["name"])

	def _resave_as_desk(self, doc, **changes):
		payload = doc.as_dict(convert_dates_to_str=True)
		payload.update(changes)
		with self.set_user(self.desk_user):
			save_repair_order(json.dumps(payload, default=str))
		return frappe.get_doc("DW Repair Order", doc.name)

	# --- invoicing -----------------------------------------------------------

	def test_finalize_invoice_is_not_callable_over_http(self):
		self.assertNotIn(finalize_invoice, frappe.whitelisted)

	def test_create_sales_invoice_is_executive_only(self):
		order = self._order()
		with self.set_user(self.desk_user):
			self.assertRaises(frappe.PermissionError, create_sales_invoice, order.name, source_type="order")

	def test_finalize_rejects_an_invoice_built_for_another_order(self):
		order_a, order_b = self._order(), self._order()
		draft_b = build_sales_invoice(order_b.name, source_type="order")
		self.assertRaises(
			frappe.PermissionError, finalize_invoice, order_a.name, draft_b["invoice_name"], payment_mode="Cash",
		)

	def test_finalize_rejects_a_submitted_invoice(self):
		order = self._order(watches=2)
		draft = build_sales_invoice(order.name, source_type="order", item_indices=[order.items[0].name])
		finalize_invoice(order.name, draft["invoice_name"], payment_mode="Cash")
		self.assertRaises(frappe.ValidationError, finalize_invoice, order.name, draft["invoice_name"], payment_mode="Cash")

	def test_finalize_rejects_a_discount_above_the_total(self):
		order = self._order()
		draft = build_sales_invoice(order.name, source_type="order")
		self.assertRaises(
			frappe.ValidationError, finalize_invoice, order.name, draft["invoice_name"],
			discount=draft["invoice_amount"] + 1, payment_mode="Cash",
		)

	def test_advance_amount_must_fit_the_total(self):
		order = self._order()
		self.assertRaises(frappe.ValidationError, build_sales_invoice, order.name, "order", "advance", -5)
		self.assertRaises(frappe.ValidationError, build_sales_invoice, order.name, "order", "advance", 10**9)

	def test_front_desk_can_still_collect(self):
		order = self._order()
		with self.set_user(self.desk_user):
			result = collect_watches(order.name, [order.items[0].name], payment_mode="Cash")
		self.assertTrue(result["invoice_name"])
		self.assertEqual(frappe.db.get_value("DW Repair Item", order.items[0].name, "status"), "Delivered")
		self.assertEqual(frappe.db.get_value("DW Repair Order", order.name, "sales_invoice"), result["invoice_name"])

	# --- repair order saves --------------------------------------------------

	def test_desk_payload_cannot_set_billing_fields(self):
		order = self._order()
		saved = self._resave_as_desk(order, paid_amount=999, balance_amount=0, invoiced_amount=999, quotation_amount=5)
		self.assertEqual(saved.paid_amount, 0)
		self.assertEqual(saved.invoiced_amount, 0)
		self.assertEqual(saved.quotation_amount, 0)

	def test_desk_payload_cannot_mark_a_watch_collected(self):
		order = self._order()
		payload = order.as_dict(convert_dates_to_str=True)
		payload["items"][0]["status"] = "Delivered"
		with self.set_user(self.desk_user):
			self.assertRaises(frappe.PermissionError, save_repair_order, json.dumps(payload, default=str))

	def test_payload_cannot_take_a_row_from_another_order(self):
		order_a, order_b = self._order(), self._order()
		payload = order_a.as_dict(convert_dates_to_str=True)
		foreign = order_b.items[0].as_dict(convert_dates_to_str=True)
		payload["items"].append(foreign)
		self.assertRaises(frappe.PermissionError, save_repair_order, json.dumps(payload, default=str))
		self.assertEqual(frappe.db.get_value("DW Repair Item", foreign["name"], "parent"), order_b.name)

	def test_front_desk_cannot_close_a_worked_on_watch_unpaid(self):
		order = self._order()  # its one task is Completed
		frappe.db.set_value("DW Repair Item", order.items[0].name, "status", "Declined")
		with self.set_user(self.desk_user):
			self.assertRaises(frappe.PermissionError, close_repair_order_without_invoice, order.name)
		self.assertEqual(frappe.db.get_value("DW Repair Order", order.name, "docstatus"), 0)

	def test_front_desk_can_still_close_an_untouched_declined_watch(self):
		order = self._order(completed=False)
		frappe.db.set_value("DW Repair Item", order.items[0].name, "status", "Declined")
		with self.set_user(self.desk_user):
			close_repair_order_without_invoice(order.name)
		self.assertEqual(frappe.db.get_value("DW Repair Order", order.name, "docstatus"), 1)

	def test_front_desk_can_note_a_repair_order_invoice(self):
		order = self._order()
		with self.set_user(self.desk_user):
			invoice = collect_watches(order.name, [order.items[0].name], payment_mode="Cash")["invoice_name"]
			self.assertEqual(set_invoice_note(invoice, "Thanks")["note"], "Thanks")

	def test_technician_edits_photos_only_on_their_watch(self):
		tech, tech_user = fx.make_technician(create_user=True)
		order = self._order(completed=False, watches=2)
		frappe.db.set_value("DW Repair Item", order.items[0].name, "technician", tech)
		with self.set_user(tech_user):
			update_repair_item_photos(order.items[0].name, {"photos": [{"image": "/files/mine.jpg"}]})
			self.assertRaises(
				frappe.PermissionError, update_repair_item_photos, order.items[1].name, {"photos": []},
			)

	def test_photo_must_be_a_local_file(self):
		order = self._order(completed=False)
		item = order.items[0].name
		for bad in ("https://example.com/a.png", '/files/a.png" onerror="alert(1)', "javascript:alert(1)"):
			self.assertRaises(
				frappe.ValidationError, update_repair_item_photos, item, {"photos": [{"image": bad}]},
			)
		result = update_repair_item_photos(item, {"photos": [{"image": "/private/files/watch.jpg"}]})
		self.assertEqual(result["photos"][0]["image"], "/private/files/watch.jpg")


class ChildTablePermissionTests(FrappeTestCase):
	def test_technician_lists_only_their_orders_rows(self):
		customer = fx.make_customer()
		brand, model = fx.make_brand_model()
		tech, tech_user = fx.make_technician(create_user=True)

		def order(technician):
			return save_repair_order({
				"doctype": "DW Repair Order", "customer": customer, "received_date": nowdate(),
				"promised_delivery_date": add_days(nowdate(), 7), "priority": "Normal",
				"items": [{"watch_brand": brand, "watch_model": model, "technician": technician,
					"tasks": [], "parts_used": [], "issues": []}],
			})["name"]

		mine, other = order(tech), order(None)
		with self.set_user(tech_user):
			rows = frappe.client.get_list(
				"DW Repair Item", fields=["parent"], parent="DW Repair Order", limit_page_length=0,
			)
		parents = {r["parent"] for r in rows}
		self.assertIn(mine, parents)
		self.assertNotIn(other, parents)


class TillSecurityTests(FrappeTestCase):
	def setUp(self):
		commit = patch.object(frappe.db, "commit")
		commit.start()
		self.addCleanup(commit.stop)
		self.desk_user = fx.make_user("DW Data Entry")
		self.customer = fx.make_customer()
		codes = frappe.db.sql_list("""
			SELECT b.item_code FROM `tabBin` b INNER JOIN `tabItem` i ON i.name = b.item_code
			WHERE i.disabled = 0 AND i.is_stock_item = 1
			GROUP BY b.item_code HAVING SUM(b.actual_qty) > 10
			ORDER BY SUM(b.actual_qty) DESC LIMIT 20
		""")
		self.item = next((c for c in codes if not _is_pms_item(c)), None)
		if not self.item:
			self.skipTest("needs an in-stock standard item")

	def _cart(self, qty=2, rate=10):
		return json.dumps([{"item_code": self.item, "qty": qty, "rate": rate}])

	def _sell(self, credit=False):
		with self.set_user(self.desk_user):
			return till_charge(
				customer=self.customer, items_json=self._cart(), payment_mode="Cash", is_credit_sale=1 if credit else 0,
			)["invoice_name"]

	def _return_one(self, invoice, refund=0):
		with self.set_user(self.desk_user):
			row = get_pos_invoice_return_items(invoice)["items"][0]["row_name"]
			payments = json.dumps([{"mode_of_payment": "Cash", "amount": refund}] if refund else [])
			return create_pos_return(invoice, json.dumps([{"row_name": row, "qty": 1}]), payments)

	def test_cart_lines_and_discounts_cannot_go_negative(self):
		for items, kwargs in (
			([{"item_code": self.item, "qty": -1, "rate": 10}], {}),
			([{"item_code": self.item, "qty": 1, "rate": -10}], {}),
			([{"item_code": self.item, "qty": 1, "rate": 10}], {"discount_amount": 11}),
			([{"item_code": self.item, "qty": 1, "rate": 10}], {"discount_percent": 101}),
		):
			self.assertRaises(frappe.ValidationError, build_pos_invoice, self.customer, items, {}, **kwargs)

	def test_draft_endpoints_refuse_a_repair_invoice(self):
		brand, model = fx.make_brand_model()
		task, _ = fx.make_task_template()
		order = save_repair_order({
			"doctype": "DW Repair Order", "customer": self.customer, "received_date": nowdate(),
			"promised_delivery_date": add_days(nowdate(), 7), "priority": "Normal",
			"items": [{"watch_brand": brand, "watch_model": model, "parts_used": [], "issues": [],
				"tasks": [{"service": task, "is_manual": 1, "status": "Completed"}]}],
		})["name"]
		draft = build_sales_invoice(order, source_type="order")["invoice_name"]
		with self.set_user(self.desk_user):
			for call in (load_pos_draft, delete_pos_draft, submit_pos_draft):
				self.assertRaises(frappe.ValidationError, call, draft)
		self.assertEqual(frappe.db.get_value("Sales Invoice", draft, "docstatus"), 0)

	def test_only_an_executive_sets_the_commission(self):
		profile = {"default_commission_rate": 0}
		with self.set_user(self.desk_user):
			self.assertEqual(resolve_commission_rate("", 0, profile), 0)
			self.assertRaises(frappe.PermissionError, resolve_commission_rate, "", 50, profile)
		self.assertEqual(resolve_commission_rate("", 50, profile), 50)
		self.assertRaises(frappe.ValidationError, resolve_commission_rate, "", 150, profile)

	def test_cost_figures_stay_with_the_owner(self):
		with self.set_user(self.desk_user):
			self.assertRaises(frappe.PermissionError, get_pms_info, self.item)
			lines = till_preview(self.customer, self._cart())["lines"]
		self.assertTrue(lines)
		self.assertIsNone(lines[0]["cost"])
		self.assertIsNone(lines[0]["margin"])

	def test_refund_after_a_credit_note_on_an_unpaid_sale_is_refused(self):
		invoice = self._sell(credit=True)
		self._return_one(invoice)  # credit note only: reduces what is owed
		self.assertRaises(frappe.ValidationError, self._return_one, invoice, refund=10)

	def test_cash_sale_refunds_up_to_what_was_paid(self):
		invoice = self._sell()
		self._return_one(invoice, refund=10)
		self._return_one(invoice, refund=10)

	def test_a_retried_charge_is_not_charged_twice(self):
		ref = fx.unique_suffix(12)
		with self.set_user(self.desk_user):
			first = till_charge(customer=self.customer, items_json=self._cart(), payment_mode="Cash", client_ref=ref)
			again = till_charge(customer=self.customer, items_json=self._cart(), payment_mode="Cash", client_ref=ref)
		self.assertEqual(again["invoice_name"], first["invoice_name"])
		self.assertEqual(again["replayed"], 1)

	def test_held_sale_note_is_owner_only(self):
		with self.set_user(self.desk_user):
			held = till_hold(customer=self.customer, items_json=self._cart())["held_name"]
			self.assertRaises(frappe.PermissionError, set_invoice_note, held, "x")


class SmallGapTests(FrappeTestCase):
	def test_trend_days_are_capped(self):
		self.assertLessEqual(len(get_orders_trend(10**9)), 366)

	def test_app_config_is_for_staff_only(self):
		email = f"portal.{fx.unique_suffix()}@example.com"
		frappe.get_doc({
			"doctype": "User", "email": email, "first_name": "Portal", "user_type": "Website User", "send_welcome_email": 0,
		}).insert(ignore_permissions=True)
		with self.set_user(email):
			self.assertRaises(frappe.PermissionError, get_app_config)
		with self.set_user(fx.make_user("DW Data Entry")):
			self.assertIn("currency_code", get_app_config())
