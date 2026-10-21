"""Tests for DWRepairOrder._run_save_pipeline() (API_PY_AUDIT.md item 6, phases 2-3).

These exercise the consolidated controller method directly, in isolation,
against two input shapes:

  * "Desk-style": a doc built the way a Desk user would edit it directly
    (flat all_tasks/all_parts, plain-text/list field values, no transient
    flags set). This is the shape that got ZERO auto-sync before this
    refactor -- DWRepairOrder.validate() never called
    sync_item_tasks_with_auto_sources.

  * "SPA-style": a doc where item.flags.pending_tasks/pending_parts_used/
    pending_issues carry the SPA's nested per-item payload shape, the way
    watch_doctor.api.orders.save_repair_order injects it (phase 3).

The method is now wired into validate() (phase 3), so a plain .insert()/
.save() already runs it; these tests call it directly anyway to keep the
method's own correctness isolated from the full save() cycle, and to prove
both input shapes converge to the same end state -- the actual convergence
this whole item is for.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from watch_doctor.tests import fixtures as fx


class RunSavePipelineControllerTests(FrappeTestCase):
	def setUp(self):
		self.customer = fx.make_customer()
		self.brand, self.model = fx.make_brand_model()

	def _new_order(self, received_date=None):
		from frappe.utils import add_days, nowdate

		received = received_date or nowdate()
		doc = frappe.get_doc({
			"doctype": "DW Repair Order",
			"customer": self.customer,
			"received_date": str(received),
			"promised_delivery_date": str(add_days(received, 7)),
			"priority": "Normal",
		})
		return doc

	# --- Desk-style: no flags, direct field edits -----------------------
	def test_desk_style_recommended_work_now_gets_auto_task_sync(self):
		"""The actual point of item #6: a Desk user typing recommended_work
		directly (free text, not JSON -- Small Text field, no widget) now
		gets the same auto-task-creation the SPA always got."""
		doc = self._new_order()
		item = doc.append("items", {
			"watch_brand": self.brand,
			"watch_model": self.model,
			"recommended_work": "Crystal Replacement",  # plain string, as a Desk user would type
		})
		doc.insert(ignore_permissions=True)
		# insert() already ran the pipeline via validate() (phase 3); calling
		# it again directly is redundant but harmless (idempotent) and keeps
		# this test exercising the method in isolation as originally written.
		doc._run_save_pipeline()
		doc.save(ignore_permissions=True)
		doc.reload()

		self.assertEqual(len(doc.all_tasks), 1)
		self.assertEqual(doc.all_tasks[0].service and frappe.db.get_value(
			"DW Task Template", doc.all_tasks[0].service, "task_name"), "Crystal Replacement")
		self.assertEqual(doc.items[0].status, "Diagnosed")

	def test_desk_style_all_tasks_completed_rolls_up(self):
		task_name, _ = fx.make_task_template()
		doc = self._new_order()
		doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		doc.insert(ignore_permissions=True)
		doc.append("all_tasks", {
			"repair_item_key": str(doc.items[0].idx),
			"service": task_name,
			"is_manual": 1,
			"status": "Completed",
		})

		doc._run_save_pipeline()
		doc.save(ignore_permissions=True)
		doc.reload()

		self.assertEqual(doc.items[0].status, "Completed")
		self.assertEqual(doc.status, "Repaired")

	# --- SPA-style: nested payload injected via item.flags ----------------
	def test_spa_style_flattens_pending_tasks_and_issues(self):
		issue_name = fx.make_issue_template()
		doc = self._new_order()
		item = doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		doc.insert(ignore_permissions=True)
		item = doc.items[0]

		item.flags.pending_tasks = []
		item.flags.pending_parts_used = []
		item.flags.pending_issues = [{"issue": issue_name, "is_other": 0}]

		doc._run_save_pipeline()
		doc.save(ignore_permissions=True)
		doc.reload()

		self.assertEqual(len(doc.all_issues), 1)
		self.assertEqual(doc.all_issues[0].issue, issue_name)
		# DW Repair Item also has its own `issues` table field, but a plain
		# doc.save() never actually persists a table field nested two levels
		# deep (Document.get_all_children() only walks one level from the
		# root) -- confirmed as a PRE-EXISTING gap in the unmodified
		# save_repair_order too, not something this refactor changes. Pinned
		# here so a future fix notices if this ever starts silently working
		# (or stays broken) differently than today.
		self.assertEqual(len(doc.items[0].issues), 0)

	def test_spa_style_other_issue_resolves_to_other_template(self):
		doc = self._new_order()
		doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		doc.insert(ignore_permissions=True)
		item = doc.items[0]

		item.flags.pending_tasks = []
		item.flags.pending_parts_used = []
		item.flags.pending_issues = [{"is_other": 1, "other_description": "Custom crack"}]

		doc._run_save_pipeline()
		doc.save(ignore_permissions=True)
		doc.reload()

		self.assertEqual(len(doc.all_issues), 1)
		issue_label = frappe.db.get_value("DW Issue Template", doc.all_issues[0].issue, "issue_name")
		self.assertEqual(issue_label, "Other")

	def test_spa_style_full_replace_drops_tasks_missing_from_payload(self):
		"""A resave with pending_tasks=[] must clear out non-manual tasks the
		SPA no longer includes -- matches the pre-refactor "doc_dict['all_tasks']
		unconditionally overwritten" behavior, not an additive merge."""
		task_name, _ = fx.make_task_template()
		doc = self._new_order()
		doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		doc.insert(ignore_permissions=True)
		item = doc.items[0]
		item.flags.pending_tasks = [{"service": task_name, "status": "Pending", "is_manual": 0}]
		item.flags.pending_parts_used = []
		item.flags.pending_issues = []
		doc._run_save_pipeline()
		doc.save(ignore_permissions=True)
		doc.reload()
		self.assertEqual(len(doc.all_tasks), 0, "non-manual task with no recommended_work/issue source is dropped by auto-sync, as before")

	# --- Equivalence: Desk-style and SPA-style converge --------------------
	def test_desk_and_spa_style_converge_to_same_end_state_for_recommended_work(self):
		work_name = f"Gasket Replacement {fx.unique_suffix()}"

		desk_doc = self._new_order()
		desk_doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		desk_doc.insert(ignore_permissions=True)
		# Set post-insert (not at append/insert time): _run_save_pipeline isn't
		# wired into validate() until phase 3, so a raw list value would fail
		# Frappe's own field-type check on a plain .insert() in the meantime.
		desk_doc.items[0].recommended_work = [work_name]
		desk_doc._run_save_pipeline()
		desk_doc.save(ignore_permissions=True)
		desk_doc.reload()

		spa_doc = self._new_order()
		spa_doc.append("items", {"watch_brand": self.brand, "watch_model": self.model})
		spa_doc.insert(ignore_permissions=True)
		spa_item = spa_doc.items[0]
		spa_item.recommended_work = [work_name]
		spa_item.flags.pending_tasks = []
		spa_item.flags.pending_parts_used = []
		spa_item.flags.pending_issues = []
		spa_doc._run_save_pipeline()
		spa_doc.save(ignore_permissions=True)
		spa_doc.reload()

		self.assertEqual(desk_doc.items[0].status, spa_doc.items[0].status)
		self.assertEqual(desk_doc.items[0].diagnosis_status, spa_doc.items[0].diagnosis_status)
		self.assertEqual(desk_doc.status, spa_doc.status)
		self.assertEqual(len(desk_doc.all_tasks), len(spa_doc.all_tasks))
		self.assertEqual(desk_doc.all_tasks[0].service, spa_doc.all_tasks[0].service)
