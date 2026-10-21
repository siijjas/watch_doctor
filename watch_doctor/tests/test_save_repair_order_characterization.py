"""Golden-master characterization tests for the save_repair_order pipeline.

API_PY_AUDIT.md item #6 moves the business logic currently living in
watch_doctor.api.orders.save_repair_order / update_repair_item_diagnosis into
DWRepairOrder.validate() so Desk and SPA saves converge on one code path.
These tests pin TODAY's behavior (exercised through the API layer, exactly as
the SPA calls it) so that refactor can be verified to preserve it. The `_act`
helpers are the only place that should change when the pipeline moves behind
doc.save() directly (Phase 3) — assertions should not need to change.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from watch_doctor.api.orders import save_repair_order, update_repair_item_diagnosis
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	create_sales_invoice,
	finalize_invoice,
)
from watch_doctor.tests import fixtures as fx


def _loads(value):
	if not value:
		return []
	try:
		parsed = json.loads(value)
		return parsed if isinstance(parsed, list) else [parsed]
	except Exception:
		return [value]


def _payload_from_doc(doc):
	"""Rebuild a save_repair_order-shaped nested payload from a saved doc.

	Mirrors what the SPA does: load the order, keep editing, resubmit the
	full nested shape. Used by tests that characterize resave behavior.
	"""
	tasks_by_item, parts_by_item, issues_by_item = {}, {}, {}
	for t in doc.all_tasks or []:
		tasks_by_item.setdefault(str(t.repair_item_key), []).append({
			"name": t.name,
			"service": t.service,
			"technician": t.technician,
			"notes": t.notes,
			"status": t.status,
			"rate": t.rate,
			"auto_rate": t.auto_rate,
			"price_manually_set": t.price_manually_set,
			"is_manual": t.is_manual,
		})
	for p in doc.all_parts or []:
		parts_by_item.setdefault(str(p.repair_item_key), []).append({
			"name": p.name,
			"part": p.part,
			"quantity": p.quantity,
			"uom": p.uom,
			"task": p.task,
			"rate": p.rate,
		})
	for iss in doc.all_issues or []:
		issues_by_item.setdefault(str(iss.repair_item_key), []).append({
			"name": iss.name,
			"issue": iss.issue,
			"is_other": iss.is_other,
			"other_description": iss.other_description,
		})

	items = []
	for item in doc.items:
		key = str(item.idx)
		items.append({
			"name": item.name,
			"watch_brand": item.watch_brand,
			"watch_model": item.watch_model,
			"technician": item.technician,
			"status": item.status,
			"diagnosis_status": item.diagnosis_status,
			"diagnosis_summary": _loads(item.diagnosis_summary),
			"movement_type": _loads(item.movement_type),
			"movement_caliber": _loads(item.movement_caliber),
			"recommended_work": _loads(item.recommended_work),
			"pre_existing_condition": _loads(item.pre_existing_condition),
			"tasks": tasks_by_item.get(key, []),
			"parts_used": parts_by_item.get(key, []),
			"issues": issues_by_item.get(key, []),
		})

	return {
		"doctype": "DW Repair Order",
		"name": doc.name,
		"customer": doc.customer,
		"received_date": str(doc.received_date),
		"promised_delivery_date": str(doc.promised_delivery_date),
		"priority": doc.priority,
		"reference_number": doc.reference_number,
		"items": items,
	}


class SaveRepairOrderCharacterizationTests(FrappeTestCase):
	def setUp(self):
		self.customer = fx.make_customer()
		self.brand, self.model = fx.make_brand_model()

	def _base_payload(self, technician=None, **item_overrides):
		received = nowdate()
		item = {
			"watch_brand": self.brand,
			"watch_model": self.model,
			"technician": technician,
			"tasks": [],
			"parts_used": [],
			"issues": [],
		}
		item.update(item_overrides)
		return {
			"doctype": "DW Repair Order",
			"customer": self.customer,
			"received_date": str(received),
			"promised_delivery_date": str(add_days(received, 7)),
			"priority": "Normal",
			"items": [item],
		}

	def _act(self, payload, as_user=None):
		"""The save action under test. Only this method's body should change
		in Phase 3 when the pipeline moves behind doc.save() directly."""
		if as_user:
			with self.set_user(as_user):
				result = save_repair_order(payload)
		else:
			result = save_repair_order(payload)
		return frappe.get_doc("DW Repair Order", result["name"])

	# 1. New order creation -------------------------------------------------
	def test_create_new_order_minimal(self):
		doc = self._act(self._base_payload())
		self.assertEqual(doc.status, "Pending")
		self.assertEqual(len(doc.items), 1)
		self.assertEqual(doc.items[0].status, "Pending")
		self.assertEqual(doc.items[0].diagnosis_status, "Pending Diagnosis")

	# 2. Technician assignment moves item to Under Diagnosis ----------------
	def test_technician_assignment_moves_item_to_under_diagnosis(self):
		tech_name, _ = fx.make_technician()
		doc = self._act(self._base_payload(technician=tech_name))
		self.assertEqual(doc.items[0].status, "Under Diagnosis")

	# 3. Diagnosis content moves item to Diagnosed ---------------------------
	def test_diagnosis_content_moves_item_to_diagnosed(self):
		tech_name, _ = fx.make_technician()
		doc = self._act(self._base_payload(
			technician=tech_name,
			recommended_work=["Full service"],
		))
		self.assertEqual(doc.items[0].status, "Diagnosed")
		self.assertEqual(doc.items[0].diagnosis_status, "Diagnosed")

	# 4. recommended_work triggers auto task + implicit template creation ---
	def test_recommended_work_creates_auto_task_and_new_task_template(self):
		work_name = f"Brand New Service {fx.unique_suffix()}"
		self.assertFalse(frappe.db.exists("DW Task Template", work_name))
		doc = self._act(self._base_payload(recommended_work=[work_name]))

		self.assertEqual(len(doc.all_tasks), 1)
		auto_task = doc.all_tasks[0]
		self.assertEqual(int(auto_task.is_manual or 0), 0)

		created_template = frappe.db.sql(
			"select name from `tabDW Task Template` where lower(task_name) = lower(%s)",
			(work_name,),
		)
		self.assertTrue(created_template, "Expected an implicitly-created DW Task Template")
		self.assertEqual(auto_task.service, created_template[0][0])

	# 5. issue with suggested_task triggers auto task, no new template ------
	def test_issue_with_suggested_task_creates_auto_task_without_creating_template(self):
		task_name, task_label = fx.make_task_template()
		issue_name = fx.make_issue_template(suggested_task=task_name)
		existing_template_count = frappe.db.count("DW Task Template")

		doc = self._act(self._base_payload(issues=[{"issue": issue_name}]))

		self.assertEqual(len(doc.all_tasks), 1)
		self.assertEqual(doc.all_tasks[0].service, task_name)
		self.assertEqual(frappe.db.count("DW Task Template"), existing_template_count)

	# 6. Manual task survives resave without duplication ---------------------
	def test_manual_task_preserved_across_resave_without_duplication(self):
		task_name, _ = fx.make_task_template()
		doc = self._act(self._base_payload(tasks=[
			{"service": task_name, "is_manual": 1, "status": "Pending"},
		]))
		self.assertEqual(len(doc.all_tasks), 1)

		payload = _payload_from_doc(doc)
		payload["priority"] = "Urgent"
		doc2 = self._act(payload)

		manual_tasks = [t for t in doc2.all_tasks if int(t.is_manual or 0) == 1]
		self.assertEqual(len(manual_tasks), 1)
		self.assertEqual(manual_tasks[0].service, task_name)
		self.assertEqual(doc2.priority, "Urgent")

	# 7. All tasks completed rolls item + order up ---------------------------
	def test_all_tasks_completed_rolls_up_to_item_completed_and_order_repaired(self):
		task_name, _ = fx.make_task_template()
		doc = self._act(self._base_payload(tasks=[
			{"service": task_name, "is_manual": 1, "status": "Completed"},
		]))
		self.assertEqual(doc.items[0].status, "Completed")
		self.assertEqual(doc.status, "Repaired")

	# 8. Manual item-status overrides preserved across content-free resave ---
	# Setting diagnosis_status alone (with no diagnosis content) does NOT
	# preserve it -- resolve_diagnosis_status resets to "Pending Diagnosis"
	# whenever has_diagnosis_content is False, regardless of the incoming
	# value. The manual override only sticks when the *item status* itself
	# is set directly (mirrors the SPA's "mark as X" actions), which
	# resolve_repair_item_status returns verbatim before diagnosis fields
	# are considered; diagnosis_status is then back-derived from it.
	def test_diagnosis_manual_override_preserved_across_resave(self):
		cases = [
			("Not Repairable", "Not Repairable"),
			("Declined", "Declined"),
			("Create Estimate", "Awaiting Approval"),
			("Quoted", "Quoted"),
		]
		for item_status, expected_diagnosis_status in cases:
			with self.subTest(item_status=item_status):
				doc = self._act(self._base_payload(status=item_status))
				self.assertEqual(doc.items[0].status, item_status)
				self.assertEqual(doc.items[0].diagnosis_status, expected_diagnosis_status)

				payload = _payload_from_doc(doc)
				payload["priority"] = "Urgent"
				doc2 = self._act(payload)
				self.assertEqual(doc2.items[0].status, item_status)
				self.assertEqual(doc2.items[0].diagnosis_status, expected_diagnosis_status)

	# 9. Optimistic lock conflict throws -------------------------------------
	def test_optimistic_lock_conflict_throws(self):
		doc = self._act(self._base_payload())
		stale_modified = str(frappe.db.get_value("DW Repair Order", doc.name, "modified"))

		# Simulate another session saving a newer version in the meantime.
		frappe.db.set_value("DW Repair Order", doc.name, "reference_number", "bumped-by-other-session", update_modified=True)

		payload = _payload_from_doc(doc)
		payload["modified"] = stale_modified
		payload["priority"] = "Urgent"

		with self.assertRaises(frappe.ValidationError):
			self._act(payload)

	# 10. Technician blocked from an order they're not assigned to -----------
	def test_technician_cannot_save_unassigned_order(self):
		tech_a, _ = fx.make_technician()
		_, tech_b_email = fx.make_technician(create_user=True)

		doc = self._act(self._base_payload(technician=tech_a))

		payload = _payload_from_doc(doc)
		with self.assertRaises(frappe.PermissionError):
			self._act(payload, as_user=tech_b_email)

	# 11. Technician blocked from diagnosing an item not assigned to them ----
	def test_technician_can_only_diagnose_own_item_via_update_repair_item_diagnosis(self):
		tech_a, tech_a_email = fx.make_technician(create_user=True)
		tech_b, _ = fx.make_technician()

		payload = self._base_payload()
		payload["items"] = [
			{"watch_brand": self.brand, "watch_model": self.model, "technician": tech_a,
			 "tasks": [], "parts_used": [], "issues": []},
			{"watch_brand": self.brand, "watch_model": self.model, "technician": tech_b,
			 "tasks": [], "parts_used": [], "issues": []},
		]
		doc = self._act(payload)
		other_item = doc.items[1]
		self.assertEqual(other_item.technician, tech_b)

		with self.set_user(tech_a_email):
			with self.assertRaises(frappe.PermissionError):
				update_repair_item_diagnosis(
					other_item.name,
					json.dumps({"diagnosis_summary": ["Trying to diagnose someone else's watch"]}),
				)

	# 12. Promised date before received date throws --------------------------
	def test_promised_date_before_received_date_throws(self):
		payload = self._base_payload()
		payload["received_date"] = nowdate()
		payload["promised_delivery_date"] = str(add_days(nowdate(), -3))
		with self.assertRaises(frappe.ValidationError):
			self._act(payload)

	# 13. Zero items throws ---------------------------------------------------
	def test_zero_items_throws(self):
		payload = self._base_payload()
		payload["items"] = []
		with self.assertRaises(frappe.ValidationError):
			self._act(payload)

	# 14. Legacy movement_information splits into type + caliber -------------
	def test_legacy_movement_information_splits_into_type_and_caliber(self):
		doc = self._act(self._base_payload(
			movement_information=["Automatic Movement", "ETA 2824-2"],
		))
		item = doc.items[0]
		self.assertEqual(_loads(item.movement_type), ["Automatic Movement"])
		self.assertEqual(_loads(item.movement_caliber), ["ETA 2824-2"])
		self.assertEqual(
			set(_loads(item.movement_information)),
			{"Automatic Movement", "ETA 2824-2"},
		)

	# 15. "Other" issue resolves to the Other template ------------------------
	def test_other_issue_resolves_to_other_template(self):
		doc = self._act(self._base_payload(
			issues=[{"is_other": 1, "other_description": "Custom crack on the case"}],
		))
		self.assertEqual(len(doc.all_issues), 1)
		issue_row = doc.all_issues[0]
		self.assertEqual(int(issue_row.is_other or 0), 1)
		self.assertTrue(frappe.db.exists("DW Issue Template", issue_row.issue))
		issue_label = frappe.db.get_value("DW Issue Template", issue_row.issue, "issue_name")
		self.assertEqual(issue_label, "Other")

	# 16. JSON list-field round trip ------------------------------------------
	def test_json_list_field_round_trip(self):
		summary = ["Crystal is scratched", "Crown misaligned"]
		doc = self._act(self._base_payload(diagnosis_summary=summary))
		self.assertEqual(_loads(doc.items[0].diagnosis_summary), summary)

		payload = _payload_from_doc(doc)
		payload["priority"] = "Urgent"
		doc2 = self._act(payload)
		self.assertEqual(_loads(doc2.items[0].diagnosis_summary), summary)

	# 17. update_repair_item_diagnosis end-to-end flow ------------------------
	def test_update_repair_item_diagnosis_basic_flow(self):
		doc = self._act(self._base_payload())
		item = doc.items[0]

		work_name = f"Crystal Replacement {fx.unique_suffix()}"
		response = update_repair_item_diagnosis(
			item.name,
			json.dumps({
				"diagnosis_summary": ["Needs new crystal"],
				"recommended_work": [work_name],
			}),
		)

		self.assertEqual(response["diagnosis_status"], "Diagnosed")
		self.assertEqual(response["diagnosis_summary"], ["Needs new crystal"])
		self.assertEqual(response["recommended_work"], [work_name])

		doc.reload()
		self.assertEqual(len(doc.all_tasks), 1)
		self.assertEqual(doc.items[0].status, "Diagnosed")

	# 18. finalize_invoice partial delivery doesn't disturb resolved items ---
	def test_finalize_invoice_partial_delivery_does_not_disturb_resolved_items(self):
		task_name, _ = fx.make_task_template()
		payload = self._base_payload()
		payload["items"] = [
			{  # Item A: returned to customer without repair.
				"watch_brand": self.brand, "watch_model": self.model,
				"status": "Not Repairable",
				"tasks": [], "parts_used": [], "issues": [],
			},
			{  # Item B: fully repaired, billable.
				"watch_brand": self.brand, "watch_model": self.model,
				"tasks": [{"service": task_name, "is_manual": 1, "status": "Completed"}],
				"parts_used": [], "issues": [],
			},
		]
		doc = self._act(payload)
		item_a, item_b = doc.items[0], doc.items[1]
		self.assertEqual(item_a.status, "Not Repairable")
		self.assertEqual(item_b.status, "Completed")

		invoice_info = create_sales_invoice(
			doc.name, source_type="order", item_indices=json.dumps([item_b.name]),
		)
		finalize_invoice(
			doc.name, invoice_info["invoice_name"],
			discount=0, payment_mode="Cash", mark_as_delivered=True,
		)

		doc.reload()
		refreshed_a = next(i for i in doc.items if i.name == item_a.name)
		refreshed_b = next(i for i in doc.items if i.name == item_b.name)
		# Item A must stay Not Repairable, not get swept into Delivered.
		self.assertEqual(refreshed_a.status, "Not Repairable")
		self.assertEqual(refreshed_b.status, "Delivered")
		# Both items resolved (one returned unrepaired, one delivered) -> order closes out.
		self.assertIn(doc.status, ("Repaired", "Delivered"))
