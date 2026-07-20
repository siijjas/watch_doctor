# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, getdate

from watch_doctor.invoice_settings import (
	WORKFLOW_REPAIR_SERVICE,
	apply_workflow_naming_series,
	get_workflow_settings,
)
from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles
from watch_doctor.inventory_helpers import validate_parts_stock_availability
from watch_doctor.list_field_utils import (
	combine_movement_information,
	normalize_string_list,
	split_legacy_movement_information,
)


WATCH_STATUS_PENDING = "Pending"
WATCH_STATUS_UNDER_DIAGNOSIS = "Under Diagnosis"
WATCH_STATUS_DIAGNOSED = "Diagnosed"
WATCH_STATUS_APPROVAL_FOR_ESTIMATE = "Create Estimate"
WATCH_STATUS_QUOTED = "Quoted"
WATCH_STATUS_IN_REPAIR = "In Repair"
WATCH_STATUS_COMPLETED = "Completed"
WATCH_STATUS_DELIVERED = "Delivered"
WATCH_STATUS_NOT_REPAIRABLE = "Not Repairable"
WATCH_STATUS_DECLINED = "Declined"

LEGACY_WATCH_STATUS_MAP = {
	"Awaiting Approval": WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	"Approval for Estimate": WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	"Awaiting Parts": WATCH_STATUS_IN_REPAIR,
	"On Hold": WATCH_STATUS_UNDER_DIAGNOSIS,
	"Pending Diagnosis": WATCH_STATUS_UNDER_DIAGNOSIS,
	"Repaired": WATCH_STATUS_COMPLETED,
}

FINAL_ITEM_STATUSES = {
	WATCH_STATUS_COMPLETED,
	WATCH_STATUS_DELIVERED,
	WATCH_STATUS_NOT_REPAIRABLE,
	WATCH_STATUS_DECLINED,
}

MANUAL_ITEM_STATUSES = {
	WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	WATCH_STATUS_QUOTED,
	WATCH_STATUS_IN_REPAIR,
	WATCH_STATUS_COMPLETED,
	WATCH_STATUS_DELIVERED,
	WATCH_STATUS_NOT_REPAIRABLE,
	WATCH_STATUS_DECLINED,
}

DIAGNOSIS_TO_WATCH_STATUS = {
	"Pending Diagnosis": WATCH_STATUS_UNDER_DIAGNOSIS,
	"Diagnosed": WATCH_STATUS_DIAGNOSED,
	"Awaiting Approval": WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	"Quoted": WATCH_STATUS_QUOTED,
	"Not Repairable": WATCH_STATUS_NOT_REPAIRABLE,
	"Declined": WATCH_STATUS_DECLINED,
}

WATCH_TO_DIAGNOSIS_STATUS = {
	WATCH_STATUS_PENDING: "Pending Diagnosis",
	WATCH_STATUS_UNDER_DIAGNOSIS: "Pending Diagnosis",
	WATCH_STATUS_DIAGNOSED: "Diagnosed",
	WATCH_STATUS_APPROVAL_FOR_ESTIMATE: "Awaiting Approval",
	WATCH_STATUS_QUOTED: "Quoted",
	WATCH_STATUS_NOT_REPAIRABLE: "Not Repairable",
	WATCH_STATUS_DECLINED: "Declined",
}


def normalize_repair_item_status(status):
	status = str(status or "").strip()
	if not status:
		return WATCH_STATUS_PENDING
	return LEGACY_WATCH_STATUS_MAP.get(status, status)


def normalize_diagnosis_status(status):
	status = str(status or "").strip()
	if not status:
		return ""
	return WATCH_TO_DIAGNOSIS_STATUS.get(status, status)


def has_repair_item_diagnosis_content(item):
	return any([
		normalize_string_list(getattr(item, "diagnosis_summary", None)),
		normalize_string_list(getattr(item, "movement_type", None)),
		normalize_string_list(getattr(item, "movement_caliber", None)),
		normalize_string_list(getattr(item, "recommended_work", None)),
	])


def resolve_repair_item_status(current_status=None, diagnosis_status=None, technician=None, recommended_work=None, task_statuses=None):
	status = normalize_repair_item_status(current_status)
	diagnosis_status = normalize_diagnosis_status(diagnosis_status)
	task_statuses = [str(task_status).strip() for task_status in (task_statuses or []) if str(task_status).strip()]
	has_recommended_work = bool(normalize_string_list(recommended_work))
	has_technician = bool(str(technician or "").strip())

	if status == WATCH_STATUS_DELIVERED:
		return WATCH_STATUS_DELIVERED

	if task_statuses:
		if all(task_status == "Completed" for task_status in task_statuses):
			return WATCH_STATUS_COMPLETED
		if any(task_status in {"In Progress", "Completed"} for task_status in task_statuses):
			return WATCH_STATUS_IN_REPAIR

	if status in FINAL_ITEM_STATUSES:
		return status

	diagnosis_mapped_status = DIAGNOSIS_TO_WATCH_STATUS.get(diagnosis_status)

	# Hard-stop diagnoses (Not Repairable, Declined) always override, even manual statuses.
	if diagnosis_mapped_status in {WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED}:
		return diagnosis_mapped_status

	# If the caller explicitly set a manual status (e.g. "Quoted" after "Create Estimate"),
	# respect that choice rather than letting the still-stale diagnosis_status revert it.
	if status in MANUAL_ITEM_STATUSES:
		return status

	# Diagnosis-driven transitions for Quoted / Create Estimate when no manual override was set.
	if diagnosis_mapped_status in {WATCH_STATUS_QUOTED, WATCH_STATUS_APPROVAL_FOR_ESTIMATE}:
		return diagnosis_mapped_status

	if diagnosis_mapped_status == WATCH_STATUS_DIAGNOSED or has_recommended_work:
		return WATCH_STATUS_DIAGNOSED

	if has_technician:
		return WATCH_STATUS_UNDER_DIAGNOSIS

	return WATCH_STATUS_PENDING


def resolve_repair_item_diagnosis_status(item_status, current_diagnosis_status=None, has_diagnosis_content=False):
	item_status = normalize_repair_item_status(item_status)
	current_diagnosis_status = normalize_diagnosis_status(current_diagnosis_status)

	if item_status in WATCH_TO_DIAGNOSIS_STATUS:
		return WATCH_TO_DIAGNOSIS_STATUS[item_status]

	if item_status in {WATCH_STATUS_IN_REPAIR, WATCH_STATUS_COMPLETED, WATCH_STATUS_DELIVERED}:
		if current_diagnosis_status in {"Quoted", "Awaiting Approval", "Not Repairable", "Declined"}:
			return current_diagnosis_status
		return "Diagnosed" if has_diagnosis_content else "Pending Diagnosis"

	return "Diagnosed" if has_diagnosis_content else "Pending Diagnosis"


# ---------------------------------------------------------------------------
# Save-pipeline helpers (API_PY_AUDIT.md item 6, phase 2).
#
# Moved here from watch_doctor/api/orders.py so DWRepairOrder._run_save_pipeline
# can call them directly; orders.py imports them back for its own (still
# unchanged, pending phase 3/4) use.
# ---------------------------------------------------------------------------

DIAGNOSIS_MANUAL_STATUSES = {"Not Repairable", "Awaiting Approval", "Quoted", "Declined"}
VALID_DIAGNOSIS_STATUSES = {"Pending Diagnosis", "Diagnosed", "Not Repairable", "Awaiting Approval", "Quoted", "Declined"}


def has_diagnosis_content(diagnosis_summary=None, movement_type=None, movement_caliber=None, recommended_work=None):
	return any([
		normalize_string_list(diagnosis_summary),
		normalize_string_list(movement_type),
		normalize_string_list(movement_caliber),
		normalize_string_list(recommended_work),
	])


def resolve_diagnosis_status(current_status, diagnosis_summary=None, movement_type=None, movement_caliber=None, recommended_work=None):
	if not has_diagnosis_content(diagnosis_summary, movement_type, movement_caliber, recommended_work):
		return "Pending Diagnosis"

	status = str(current_status or "").strip()
	if status in DIAGNOSIS_MANUAL_STATUSES:
		return status

	return "Diagnosed"


def resolve_task_template_name(task_value, create_missing=False, description=None):
	task_value = str(task_value or "").strip()
	if not task_value:
		return None

	if frappe.db.exists("DW Task Template", task_value):
		return task_value

	match = frappe.db.sql(
		"""
		select name
		from `tabDW Task Template`
		where lower(task_name) = lower(%s)
		limit 1
		""",
		(task_value,),
		as_dict=True,
	)
	if match:
		return match[0].name

	if create_missing:
		try:
			task_doc = frappe.get_doc({
				"doctype": "DW Task Template",
				"task_name": task_value,
				"description": (description or "").strip() or None,
			})
			task_doc.insert(ignore_permissions=True)
			return task_doc.name
		except Exception:
			# Handle duplicate creation races by re-resolving after insert failure.
			retry_match = frappe.db.sql(
				"""
				select name
				from `tabDW Task Template`
				where lower(task_name) = lower(%s)
				limit 1
				""",
				(task_value,),
				as_dict=True,
			)
			if retry_match:
				return retry_match[0].name

	return None


def get_auto_task_services_for_item(item):
	recommended_work = normalize_string_list(item.get("recommended_work"))
	resolved_services = []
	seen = set()
	recommended_descriptions = {}

	if recommended_work:
		normalized_recommended = [value.lower() for value in recommended_work]
		description_rows = frappe.db.sql(
			"""
			select work_name, description
			from `tabDW Recommended Work Template`
			where lower(work_name) in ({placeholders})
			""".format(placeholders=", ".join(["%s"] * len(recommended_work))),
			tuple(normalized_recommended),
			as_dict=True,
		)
		recommended_descriptions = {
			str((row.get("work_name") or "")).strip().lower(): row.get("description")
			for row in description_rows
		}

	if recommended_work:
		candidates = recommended_work
	else:
		candidates = []
		for issue in item.get("issues") or []:
			issue_name = issue.get("issue") if hasattr(issue, "get") else None
			if not issue_name:
				continue
			suggested_task = frappe.db.get_value("DW Issue Template", issue_name, "suggested_task")
			if suggested_task:
				candidates.append(suggested_task)

	for candidate in candidates:
		candidate_value = str(candidate or "").strip()
		if not candidate_value:
			continue
		service_name = resolve_task_template_name(
			candidate_value,
			create_missing=bool(recommended_work),
			description=recommended_descriptions.get(candidate_value.lower()),
		)
		if not service_name or service_name in seen:
			continue
		seen.add(service_name)
		resolved_services.append(service_name)

	return resolved_services


def sync_item_tasks_with_auto_sources(order_doc, item):
	service_names = get_auto_task_services_for_item(item)
	technician = str(item.get("technician") or "").strip()
	item_key = str(item.idx)

	existing_tasks_by_service = {}
	manual_tasks_for_item = []
	for task in (order_doc.all_tasks or []):
		if str(task.repair_item_key) != item_key:
			continue
		if int(task.is_manual or 0):
			manual_tasks_for_item.append(task)
			continue
		service_name = str(task.service or "").strip()
		if service_name and service_name not in existing_tasks_by_service:
			existing_tasks_by_service[service_name] = task

	remaining_tasks = [task for task in (order_doc.all_tasks or []) if str(task.repair_item_key) != item_key]
	order_doc.set("all_tasks", [])
	for task in remaining_tasks:
		order_doc.append("all_tasks", {
			"repair_item_key": task.repair_item_key,
			"service": task.service,
			"technician": task.technician,
			"notes": task.notes,
			"status": task.status,
			"rate": task.rate,
			"auto_rate": task.auto_rate,
			"price_manually_set": task.price_manually_set,
			"is_manual": int(task.is_manual or 0),
		})

	# Re-add manual tasks first (they are always preserved unchanged)
	for task in manual_tasks_for_item:
		order_doc.append("all_tasks", {
			"repair_item_key": item_key,
			"service": task.service,
			"technician": task.technician,
			"notes": task.notes,
			"status": task.status,
			"rate": task.rate,
			"auto_rate": task.auto_rate,
			"price_manually_set": task.price_manually_set,
			"is_manual": 1,
		})

	for service_name in service_names:
		existing_task = existing_tasks_by_service.get(service_name)
		order_doc.append("all_tasks", {
			"repair_item_key": item_key,
			"service": service_name,
			"technician": technician or (existing_task.technician if existing_task else ""),
			"notes": existing_task.notes if existing_task else "",
			"status": (existing_task.status if existing_task else "Pending") or "Pending",
			"rate": existing_task.rate if existing_task else None,
			"auto_rate": existing_task.auto_rate if existing_task else None,
			"price_manually_set": existing_task.price_manually_set if existing_task else 0,
			"is_manual": 0,
		})

	return service_names


def ensure_other_issue_template():
	"""Return a valid DW Issue Template name for the generic Other issue."""
	if frappe.db.exists("DW Issue Template", "Other"):
		return "Other"
	existing_other = frappe.db.sql(
		"""
		select name
		from `tabDW Issue Template`
		where lower(issue_name) = 'other'
		limit 1
		""",
		as_dict=True,
	)
	if existing_other:
		return existing_other[0].name
	other_doc = frappe.get_doc({
		"doctype": "DW Issue Template",
		"issue_name": "Other",
		"description": "Generic issue placeholder for custom complaints",
		"is_active": 1,
	})
	other_doc.insert(ignore_permissions=True)
	return other_doc.name


def resolve_issue_template_name(raw_issue):
	"""Resolve an issue label or name into a valid DW Issue Template name."""
	if not raw_issue:
		return None
	issue_value = str(raw_issue).strip()
	if not issue_value:
		return None
	if frappe.db.exists("DW Issue Template", issue_value):
		return issue_value
	by_issue_name = frappe.db.sql(
		"""
		select name
		from `tabDW Issue Template`
		where lower(issue_name) = lower(%s)
		limit 1
		""",
		(issue_value,),
		as_dict=True,
	)
	if by_issue_name:
		return by_issue_name[0].name
	return None


class DWRepairOrder(Document):
	"""DW Repair Order - Main doctype for managing watch repair orders."""
	DEFAULT_NAMING_SERIES = "YY.MM.####"

	def before_naming(self):
		"""Use ERPNext naming_series and auto-initialize monthly counter safely."""
		if not self.naming_series:
			self.naming_series = self.DEFAULT_NAMING_SERIES

		if self.naming_series != self.DEFAULT_NAMING_SERIES:
			return

		prefix = getdate().strftime("%y%m")
		if frappe.db.exists("Series", prefix):
			return

		max_existing = frappe.db.sql(
			"""
			select max(cast(right(name, 4) as unsigned))
			from `tabDW Repair Order`
			where name regexp %s
			""",
			(rf"^{prefix}[0-9]{{4}}$",),
		)[0][0] or 0

		if max_existing <= 0:
			return

		try:
			frappe.db.sql("insert into `tabSeries` (`name`, `current`) values (%s, %s)", (prefix, max_existing))
		except Exception:
			# Another transaction may create it concurrently; safe to continue.
			pass
	
	# Define valid status transitions
	VALID_TRANSITIONS = {
		"Pending": ["In Progress", "Create Estimate", "Repaired"],
		"In Progress": ["Create Estimate", "Repaired", "Pending"],
		"Create Estimate": ["In Progress", "Repaired", "Pending"],
		"Repaired": ["In Progress", "Create Estimate", "Delivered"],
		"Delivered": ["Repaired"]  # Allow undoing delivery if needed (with care)
	}
	
	def validate(self):
		"""Validate the repair order before saving."""
		if not self.items:
			frappe.throw(_("A repair order must contain at least one watch."))

		# Ensure a non-guessable token exists for future customer-portal use
		if not self.public_token:
			self.public_token = frappe.generate_hash(length=16)

		if not self.promised_delivery_date and self.received_date:
			self.promised_delivery_date = add_days(self.received_date, 7)

		if self.received_date and self.promised_delivery_date:
			if getdate(self.promised_delivery_date) < getdate(self.received_date):
				frappe.throw(_("Promised delivery date cannot be before the received date."))
		
		# Get the status from database (before any changes)
		db_status = None
		if not self.is_new():
			db_status = frappe.db.get_value("DW Repair Order", self.name, "status")
		
		# Store current status before auto-updates
		status_before_auto_update = self.status

		# Single consolidated business-logic pass: item field normalization,
		# SPA nested-payload flattening (no-op for Desk edits), task
		# auto-sync, item/diagnosis status resolution, order status rollup.
		# See API_PY_AUDIT.md item 6.
		self._run_save_pipeline()

		# Determine if we should validate:
		# - Skip if new document
		# - Skip if status was changed by auto-update (status_before != status_after)
		# - Only validate if user manually changed status (status_before != db_status AND status didn't change during auto-update)
		if not self.is_new():
			status_changed_by_auto = (self.status != status_before_auto_update)
			status_manually_changed = (db_status and status_before_auto_update != db_status)
			
			# Only validate if user manually changed it AND auto-update didn't override it
			if status_manually_changed and not status_changed_by_auto:
				self.validate_status_transition()
	
	def before_submit(self):
		"""Validate before submitting the order."""
		# Check all items are resolved: either repaired (Completed/Delivered) or
		# returned to the customer without repair (Not Repairable/Declined).
		resolved_statuses = [
			WATCH_STATUS_COMPLETED,
			WATCH_STATUS_DELIVERED,
			WATCH_STATUS_NOT_REPAIRABLE,
			WATCH_STATUS_DECLINED,
		]
		for item in self.items:
			if normalize_repair_item_status(item.status) not in resolved_statuses:
				frappe.throw(
					_("Cannot submit: Item '{0}' is still in '{1}' status. All items must be Completed, Delivered, Not Repairable, or Declined.").format(
						f"{item.watch_brand} {item.watch_model}", item.status
					)
				)

		# An invoice is only required if at least one watch was actually repaired/billable.
		# Watches returned without repair (Not Repairable/Declined) never need an invoice.
		has_billable_item = any(
			normalize_repair_item_status(item.status) in (WATCH_STATUS_COMPLETED, WATCH_STATUS_DELIVERED)
			for item in self.items
		)
		if has_billable_item and not self.sales_invoice:
			frappe.throw(_("Cannot submit: A Sales Invoice must be created before delivering the order."))
	
	def on_submit(self):
		"""Actions to perform when the repair order is submitted."""
		self.db_set('status', 'Delivered', update_modified=False)
		self.db_set('delivery_date', getdate(), update_modified=False)

		# Only promote Completed items to Delivered; items already Delivered from
		# a prior partial-delivery finalize stay Delivered without being re-written.
		for item in self.items:
			if normalize_repair_item_status(item.status) == WATCH_STATUS_COMPLETED:
				frappe.db.set_value('DW Repair Item', item.name, 'status', 'Delivered', update_modified=False)

		frappe.msgprint(_("Order marked as Delivered on {0}").format(getdate()))
	
	def on_cancel(self):
		"""Actions to perform when the repair order is cancelled."""
		frappe.msgprint(_("Order has been cancelled"))
	
	def update_order_status_from_items(self):
		"""Calculate and update order status based on all item statuses."""
		if not self.items:
			return
		
		item_statuses = [item.status for item in self.items]
		
		# Don't auto-update if already Delivered (submitted)
		if self.status == "Delivered":
			return
		
		# Calculate new status based on items
		new_status = self.calculate_order_status(item_statuses)
		
		# Update status if it changed (valid transitions are checked separately if manual, but here we force logic)
		if new_status and new_status != self.status:
			# We TRUST the calculated status over the previous status here, 
			# because this runs ON SAVE and represents the actual state of the world.
			self.status = new_status
	
	def calculate_order_status(self, item_statuses):
		"""Calculate what the order status should be based on item statuses."""
		if not item_statuses:
			return "Pending"

		item_statuses = [normalize_repair_item_status(status) for status in item_statuses]

		# Watches returned to the customer without repair are just as "resolved" as
		# completed/delivered ones — they don't need an invoice to close the order.
		returned_without_repair = {WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED}
		resolved_statuses = {WATCH_STATUS_COMPLETED, WATCH_STATUS_DELIVERED} | returned_without_repair

		# All items Delivered → Delivered (but this requires submit)
		if all(s == WATCH_STATUS_DELIVERED for s in item_statuses):
			return "Repaired"  # Will become Delivered on submit

		# All items resolved (Completed/Delivered/Not Repairable/Declined) → Repaired
		if all(s in resolved_statuses for s in item_statuses):
			return "Repaired"

		# If any watch is awaiting estimate approval, bubble the order to Create Estimate.
		if any(s == WATCH_STATUS_APPROVAL_FOR_ESTIMATE for s in item_statuses):
			return WATCH_STATUS_APPROVAL_FOR_ESTIMATE

		# Any active item beyond intake/diagnosis → In Progress
		if any(s in {
			WATCH_STATUS_UNDER_DIAGNOSIS,
			WATCH_STATUS_DIAGNOSED,
			WATCH_STATUS_QUOTED,
			WATCH_STATUS_IN_REPAIR,
			WATCH_STATUS_COMPLETED,
		} | returned_without_repair for s in item_statuses):
			return "In Progress"

		# Otherwise Pending
		return "Pending"
	
	def validate_status_transition(self):
		"""Validate that status transition is allowed."""
		old_status = frappe.db.get_value("DW Repair Order", self.name, "status")
		new_status = self.status
		
		# Skip if status hasn't changed
		if old_status == new_status:
			return
		
		# Skip if this is a new document
		if not old_status:
			return
		
		# Check if transition is valid
		if not self.is_valid_transition(old_status, new_status):
			frappe.throw(
				_("Invalid status transition from '{0}' to '{1}'. Allowed transitions: {2}").format(
					old_status, new_status, 
					", ".join(self.VALID_TRANSITIONS.get(old_status, [])) or "None"
				)
			)
	
	def is_valid_transition(self, from_status, to_status):
		"""Check if a status transition is valid."""
		if from_status == to_status:
			return True
		allowed = self.VALID_TRANSITIONS.get(from_status, [])
		return to_status in allowed
	
	def update_item_statuses_from_workflow(self):
		"""Auto-update item and diagnosis statuses using the merged workflow."""
		# Get all tasks grouped by repair_item_key
		tasks_by_item = {}
		for task in self.all_tasks:
			item_key = task.repair_item_key
			if item_key not in tasks_by_item:
				tasks_by_item[item_key] = []
			tasks_by_item[item_key].append(task)
		
		# Update each item's status based on its tasks
		for item in self.items:
			# Use idx as the key (1-based index)
			item_key = str(item.idx)
			item_tasks = tasks_by_item.get(item_key, [])
			task_statuses = [task.status for task in item_tasks]
			item.status = resolve_repair_item_status(
				current_status=item.status,
				diagnosis_status=getattr(item, "diagnosis_status", None),
				technician=getattr(item, "technician", None),
				recommended_work=getattr(item, "recommended_work", None),
				task_statuses=task_statuses,
			)
			item.diagnosis_status = resolve_repair_item_diagnosis_status(
				item.status,
				current_diagnosis_status=getattr(item, "diagnosis_status", None),
				has_diagnosis_content=has_repair_item_diagnosis_content(item),
			)

	def _run_save_pipeline(self):
		"""Single business-logic pipeline for saving a repair order (API_PY_AUDIT.md item 6).

		Consolidates what used to be duplicated across watch_doctor.api.orders'
		save_repair_order (SPA path, 3 redundant resolution passes) and this
		controller's lighter validate() logic (Desk path, missing task
		auto-sync entirely). Called from validate() so every save — Desk or
		API — runs the same rules. Also directly callable standalone, matching
		the precedent in patches/migrate_merged_watch_statuses.py for
		bulk/patch code that shouldn't trigger a full save().
		"""
		self._normalize_item_diagnosis_fields()
		self._flatten_pending_nested_child_rows()
		self._bump_task_status_for_attached_parts()
		for item in self.items or []:
			sync_item_tasks_with_auto_sources(self, item)
		self.update_item_statuses_from_workflow()
		self.update_order_status_from_items()

	def _normalize_item_diagnosis_fields(self):
		"""JSON-encode list-valued item fields and resolve diagnosis_status.

		diagnosis_summary / movement_type / movement_caliber / recommended_work
		/ pre_existing_condition are stored as JSON arrays inside Small Text
		columns; callers may hand either a Python list or an already
		JSON-encoded string (normalize_string_list accepts both), and this
		must hold regardless of whether the save came from the SPA or a Desk
		user typing directly into the raw field.
		"""
		for item in self.items or []:
			item.pre_existing_condition = json.dumps(normalize_string_list(item.pre_existing_condition))
			diagnosis_summary = normalize_string_list(item.diagnosis_summary)
			item.diagnosis_summary = json.dumps(diagnosis_summary)

			legacy_movement_information = normalize_string_list(item.movement_information)
			movement_type = normalize_string_list(item.movement_type)
			movement_caliber = normalize_string_list(item.movement_caliber)
			recommended_work = normalize_string_list(item.recommended_work)
			if not movement_type and not movement_caliber and legacy_movement_information:
				split_movement = split_legacy_movement_information(legacy_movement_information)
				movement_type = split_movement["movement_type"]
				movement_caliber = split_movement["movement_caliber"]

			incoming_diagnosis_status = str(item.diagnosis_status or "").strip()
			if incoming_diagnosis_status and incoming_diagnosis_status not in VALID_DIAGNOSIS_STATUSES:
				frappe.throw(_("Invalid diagnosis status"))
			item.diagnosis_status = resolve_diagnosis_status(
				incoming_diagnosis_status,
				diagnosis_summary=diagnosis_summary,
				movement_type=movement_type,
				movement_caliber=movement_caliber,
				recommended_work=recommended_work,
			)
			item.movement_type = json.dumps(movement_type)
			item.movement_caliber = json.dumps(movement_caliber)
			item.movement_information = json.dumps(combine_movement_information(movement_type, movement_caliber))
			item.recommended_work = json.dumps(recommended_work)

	def _flatten_pending_nested_child_rows(self):
		"""Translate the SPA's nested items[].tasks/parts_used/issues shape
		into the flat all_tasks/all_parts/all_issues tables, and resolve
		"Other"/free-text issues to a valid DW Issue Template.

		The API layer stashes the SPA's nested arrays on
		item.flags.pending_tasks / pending_parts_used / pending_issues before
		calling doc.save() (see watch_doctor.api.orders.save_repair_order).
		Desk edits never set these flags — all_tasks/all_parts/items[].issues
		are flat siblings on this doctype already, so a Desk user edits them
		directly via their own grids and there is nothing to translate; this
		step is a no-op for that path.
		"""
		items = self.items or []
		has_pending = any(
			item.flags.get("pending_tasks") is not None
			or item.flags.get("pending_parts_used") is not None
			or item.flags.get("pending_issues") is not None
			for item in items
		)
		if not has_pending:
			return

		# Full replace: the SPA always resubmits the complete current state of
		# every item's tasks/parts/issues, so the incoming nested payload is
		# authoritative — matches the pre-refactor behavior where doc_dict's
		# all_tasks/all_parts/all_issues were rebuilt from scratch every save.
		flat_tasks, flat_parts, flat_issues = [], [], []
		for item in items:
			item_key = str(item.idx)

			for task in (item.flags.get("pending_tasks") or []):
				task = dict(task)
				task["repair_item_key"] = item_key
				flat_tasks.append(task)

			for part in (item.flags.get("pending_parts_used") or []):
				part = dict(part)
				part["repair_item_key"] = item_key
				flat_parts.append(part)

			resolved_item_issues = []
			for issue in (item.flags.get("pending_issues") or []):
				issue = dict(issue)
				raw_issue = issue.get("issue")
				is_other = bool(issue.get("is_other"))
				if is_other or (str(raw_issue or "").strip().lower() == "other"):
					# Child doctype requires a valid Link value even for custom "Other" entries.
					issue["issue"] = ensure_other_issue_template()
					issue["is_other"] = 1
				else:
					resolved_name = resolve_issue_template_name(raw_issue)
					if resolved_name:
						issue["issue"] = resolved_name
				resolved_item_issues.append(dict(issue))
				order_level_issue = dict(issue)
				order_level_issue["repair_item_key"] = item_key
				flat_issues.append(order_level_issue)

			# DW Repair Item also has its own `issues` table field (a table
			# nested two levels below the root), which get_auto_task_services_for_item
			# reads via item.get("issues") to resolve DW Issue Template.suggested_task
			# -- so it must be populated in-memory here for that lookup to work
			# within THIS save cycle. It is NOT actually persisted to the DB by a
			# plain doc.save() though: Document.get_all_children() only walks one
			# level of table fields from the root, so this grandchild table was
			# never written even by the pre-refactor save_repair_order (verified
			# directly against the unmodified code -- item.issues comes back empty
			# and issue_description stays None after reload). Pre-existing gap,
			# out of scope for item 6; see API_PY_AUDIT.md.
			item.set("issues", resolved_item_issues)

		self.set("all_tasks", flat_tasks)
		self.set("all_parts", flat_parts)
		self.set("all_issues", flat_issues)

	def _bump_task_status_for_attached_parts(self):
		"""Auto-advance a task from Pending to In Progress once a part is
		attached to it. Matches by the already-persisted task docname that
		part.task references — a brand-new task created in this same save
		only has a temporary local name and never matches an existing part's
		task reference, so this only fires for previously-saved tasks."""
		parts_by_task = {}
		for part in self.all_parts or []:
			task_name = part.task
			if task_name:
				parts_by_task.setdefault(task_name, []).append(part)

		for task in self.all_tasks or []:
			if task.name and task.name in parts_by_task and task.status == "Pending":
				task.status = "In Progress"


# Quotation Generation Methods

@frappe.whitelist()
def create_quotation(repair_order_name, quotation_type="Estimate", watch_indices=None):
	"""
	Create a quotation from a repair order.
	
	Args:
		repair_order_name: Name of the repair order
		quotation_type: "Estimate" or "Final"
		watch_indices: JSON string of watch indices to include (e.g., "[0, 1]"), or None for all watches
	
	Returns:
		Name of the created quotation
	"""
	import json
	
	# Parse watch indices if provided
	if watch_indices:
		if isinstance(watch_indices, str):
			watch_indices = json.loads(watch_indices)
	
	# Fetch the repair order with all child tables
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	
	# Determine which watches to include
	selected_items = []
	if watch_indices is not None:
		for idx in watch_indices:
			if idx < len(repair_order.items):
				selected_items.append(repair_order.items[idx])
	else:
		selected_items = repair_order.items
	
	# Create quotation document
	quotation = frappe.new_doc("Quotation")
	quotation.party_name = repair_order.customer
	quotation.quotation_to = "Customer"
	quotation.order_type = "Sales"
	
	quotation.title = f"{quotation_type} Quotation for {repair_order.name}"
	
	# Add one labor item per watch and itemized part lines.

	# Ensure we have a generic service item for tasks
	service_item_code = get_or_create_service_item()

	for item in selected_items:
		# Get tasks and parts for this watch
		item_key = str(item.idx)
		item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
		item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

		model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
		watch_item_name = f"Repair - {item.watch_brand} {model_name}"

		# Calculate labor cost for this watch
		tasks_cost = 0
		for task in item_tasks:
			task_template = frappe.get_doc("DW Task Template", task.service)
			tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

		# Build description from recommended_work (JSON array stored in field)
		try:
			rw_raw = item.recommended_work or "[]"
			rw_items = json.loads(rw_raw) if isinstance(rw_raw, str) else (rw_raw or [])
			if isinstance(rw_items, str):
				rw_items = [rw_items] if rw_items.strip() else []
		except Exception:
			rw_items = []

		if not rw_items and item_tasks:
			# Fallback: use task names from templates
			rw_items = [
				(frappe.db.get_value("DW Task Template", task.service, "task_name") or task.service)
				for task in item_tasks
			]

		desc_lines = "<br>".join(line for line in rw_items if str(line).strip())

		# Aggregate customer-facing total: tasks + parts at customer price.
		# Parts cost is bundled into the service line so the customer sees one clean line.
		customer_total = tasks_cost
		for part in item_parts:
			if not part.part or not part.quantity:
				continue
			part_rate = flt(part.rate) if part.rate else flt(frappe.db.get_value("Item", part.part, "standard_rate") or 0)
			customer_total += flt(part.quantity) * part_rate

		# A Declined watch (customer rejected the quotation) is not being charged for —
		# zero it out so re-quoting the rest of the order doesn't carry its old estimate.
		is_declined = normalize_repair_item_status(item.status) == WATCH_STATUS_DECLINED
		if is_declined:
			customer_total = 0

		# Visible service line: full customer price (tasks + parts markup).
		quotation_item = quotation.append("items", {})
		quotation_item.item_code = service_item_code
		quotation_item.item_name = watch_item_name
		quotation_item.description = (_("{0} (Declined — No Charge)").format(desc_lines or watch_item_name)
			if is_declined else (desc_lines or watch_item_name))
		quotation_item.qty = 1
		quotation_item.rate = customer_total
		quotation_item.uom = "Nos"

		# Internal part lines: zero rate, hidden from customer print.
		# These exist so downstream invoices can deduct stock correctly.
		for part in item_parts:
			if not part.part or not part.quantity:
				continue

			part_code = part.part
			part_qty = part.quantity
			part_uom = frappe.db.get_value("Item", part_code, "stock_uom") or "Nos"

			part_item = quotation.append("items", {})
			part_item.item_code = part_code
			part_item.item_name = frappe.db.get_value("Item", part_code, "item_name") or part_code
			part_item.description = _("Part for {0}").format(watch_item_name)
			part_item.qty = part_qty
			part_item.rate = 0
			part_item.price_list_rate = 0
			part_item.discount_percentage = 0
			part_item.uom = part_uom
			part_item.dw_is_internal_line = 1
	
	# Set expiry 30 days from today
	quotation.valid_till = add_days(frappe.utils.nowdate(), 30)

	# Track which repair items this quotation covers so partial-delivery invoicing works correctly.
	_q_covered = [i.name for i in selected_items]
	quotation.remarks = f"covered_items:{json.dumps(_q_covered)}"

	# Save quotation
	quotation.insert(ignore_permissions=True)

	# ERPNext's insert() fetches price_list_rate from the selling price list
	# and overwrites our rate=0 on internal part lines. Force them back to zero.
	_zero_internal_lines(quotation)

	# Submit the quotation
	quotation.submit()
	
	# Reload quotation to get calculated totals
	quotation.reload()
	
	# Link quotation to repair order
	repair_order.quotation = quotation.name
	repair_order.quotation_type = quotation_type
	# Use the quotation's calculated grand_total
	repair_order.quotation_amount = quotation.grand_total or quotation.total or 0
	repair_order.save(ignore_permissions=True)
	frappe.db.commit()  # Ensure changes are committed to database
	
	frappe.msgprint(_("Quotation {0} created successfully").format(quotation.name))
	
	return quotation.name


def get_or_create_service_item():
	"""Get or create a generic service item for repair tasks."""
	item_code = "REPAIR-SERVICE"
	
	if not frappe.db.exists("Item", item_code):
		# Create the generic service item
		service_item = frappe.new_doc("Item")
		service_item.item_code = item_code
		service_item.item_name = "Repair Service"
		service_item.item_group = "Services"
		service_item.stock_uom = "Nos"
		service_item.is_stock_item = 0
		service_item.is_sales_item = 1
		service_item.insert(ignore_permissions=True)
		frappe.db.commit()
	
	return item_code


def _zero_internal_lines(doc):
	"""Force zero rate on all internal (hidden) part lines.

	ERPNext's insert() / set_missing_values() fetches price_list_rate from the
	selling price list and recalculates rate, overwriting our explicit rate=0.
	This function must be called AFTER insert() to re-zero the rates, then
	save() to let ERPNext recalculate the document totals correctly.
	"""
	needs_save = False
	for item in doc.items:
		if item.dw_is_internal_line:
			item.price_list_rate = 0
			item.discount_percentage = 0
			item.rate = 0
			item.amount = 0
			item.net_rate = 0
			item.net_amount = 0
			item.base_rate = 0
			item.base_amount = 0
			item.base_net_rate = 0
			item.base_net_amount = 0
			item.base_price_list_rate = 0
			needs_save = True

	if needs_save:
		doc.save(ignore_permissions=True)


@frappe.whitelist()
def get_quotation_history(repair_order_name):
	"""Return all ERPNext Quotations whose title references this repair order."""
	rows = frappe.db.sql(
		"""
		SELECT name, title, transaction_date, valid_till, grand_total, status
		FROM `tabQuotation`
		WHERE title LIKE %s
		ORDER BY transaction_date DESC, creation DESC
		""",
		(f"%{repair_order_name}%",),
		as_dict=True,
	)
	return rows


@frappe.whitelist()
def get_quotation_summary(repair_order_name):
	"""
	Get quotation summary for a repair order.
	
	Args:
		repair_order_name: Name of the repair order
	
	Returns:
		Dictionary with quotation details
	"""
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	
	if not repair_order.quotation:
		return None
	
	quotation = frappe.get_doc("Quotation", repair_order.quotation)
	
	return {
		"quotation_name": quotation.name,
		"quotation_type": repair_order.quotation_type,
		"quotation_amount": quotation.grand_total,
		"status": quotation.status,
		"created_date": quotation.transaction_date,
		"valid_till": quotation.valid_till
	}


# Invoice Generation Methods

@frappe.whitelist()
def create_sales_invoice(repair_order_name, source_type="quotation", payment_type="full", amount=None, item_indices=None):
	"""
	Create a sales invoice from a repair order.

	Args:
		repair_order_name: Name of the repair order
		source_type: "quotation" or "order" - source for invoice items
		payment_type: "full", "advance", or "balance" - type of payment
		amount: Amount for partial payment (required for advance/balance)
		item_indices: Optional JSON list of DW Repair Item names to include (partial delivery)

	Returns:
		Dict with invoice_name, invoice_amount, print_format
	"""
	import json

	# Convert amount to float if it's a string
	if amount:
		if isinstance(amount, str):
			amount = float(amount)

	# Parse item_indices
	covered_item_names = None
	if item_indices:
		if isinstance(item_indices, str):
			try:
				covered_item_names = json.loads(item_indices)
			except Exception:
				covered_item_names = None
		elif isinstance(item_indices, list):
			covered_item_names = item_indices
	
	# Fetch the repair order
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	
	# Create sales invoice as POS invoice for payment tracking
	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = repair_order.customer
	invoice.posting_date = frappe.utils.nowdate()
	invoice.due_date = frappe.utils.add_days(None, 30)  # Net 30 payment terms
	invoice.is_pos = 1  # Mark as POS invoice to enable payment tracking
	invoice.update_stock = 1  # Auto-deduct stock items when invoice is submitted.
	apply_workflow_naming_series(invoice, WORKFLOW_REPAIR_SERVICE)
	
	# Determine source of items
	if source_type == "quotation" and repair_order.quotation:
		# Create from quotation
		quotation = frappe.get_doc("Quotation", repair_order.quotation)
		
		# Add all items from quotation, preserving the internal line flag
		for q_item in quotation.items:
			invoice_item = invoice.append("items", {})
			invoice_item.item_code = q_item.item_code
			invoice_item.item_name = q_item.item_name
			invoice_item.description = q_item.description
			invoice_item.qty = q_item.qty
			invoice_item.rate = q_item.rate
			invoice_item.uom = q_item.uom
			invoice_item.dw_is_internal_line = q_item.dw_is_internal_line or 0
		
		total_amount = quotation.grand_total
	else:
		# Create directly from repair order with one labor line plus itemized parts.
		total_amount = 0

		# Ensure we have a generic service item for tasks
		service_item_code = get_or_create_service_item()

		# Determine which watch rows to invoice (all, or only selected subset)
		items_to_invoice = repair_order.items
		if covered_item_names:
			items_to_invoice = [i for i in repair_order.items if i.name in covered_item_names]
			if not items_to_invoice:
				frappe.throw(_("None of the selected watches were found on this repair order."))

		for item in items_to_invoice:
			model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
			watch_item_name = f"Repair - {item.watch_brand} {model_name}"

			# Get tasks and parts for this watch
			item_key = str(item.idx)
			item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
			item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

			# Calculate labor cost for this watch
			tasks_cost = 0
			for task in item_tasks:
				task_template = frappe.get_doc("DW Task Template", task.service)
				tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

			# Build description from recommended_work
			try:
				rw_raw = item.recommended_work or "[]"
				rw_items = json.loads(rw_raw) if isinstance(rw_raw, str) else (rw_raw or [])
				if isinstance(rw_items, str):
					rw_items = [rw_items] if rw_items.strip() else []
			except Exception:
				rw_items = []

			if not rw_items and item_tasks:
				rw_items = [
					(frappe.db.get_value("DW Task Template", task.service, "task_name") or task.service)
					for task in item_tasks
				]

			desc_lines = "<br>".join(line for line in rw_items if str(line).strip())

			# Aggregate customer-facing total: tasks + parts at customer price.
			customer_total = tasks_cost
			for part in item_parts:
				if not part.part or not part.quantity:
					continue
				part_rate = flt(part.rate) if part.rate else flt(frappe.db.get_value("Item", part.part, "standard_rate") or 0)
				customer_total += flt(part.quantity) * part_rate

			# Visible service line: full customer price (tasks + parts markup).
			invoice_item = invoice.append("items", {})
			invoice_item.item_code = service_item_code
			invoice_item.item_name = watch_item_name
			invoice_item.description = desc_lines or watch_item_name
			invoice_item.qty = 1
			invoice_item.rate = customer_total
			invoice_item.uom = "Nos"
			total_amount += customer_total

			# Internal part lines: zero rate, stock deduction only.
			# Hidden from customer print via dw_is_internal_line flag.
			# ERPNext creates SLEs at valuation rate regardless of selling rate.
			for part in item_parts:
				if not part.part or not part.quantity:
					continue

				part_code = part.part
				part_qty = flt(part.quantity)
				part_uom = frappe.db.get_value("Item", part_code, "stock_uom") or "Nos"

				invoice_part = invoice.append("items", {})
				invoice_part.item_code = part_code
				invoice_part.item_name = frappe.db.get_value("Item", part_code, "item_name") or part_code
				invoice_part.description = _("Part for {0}").format(watch_item_name)
				invoice_part.qty = part_qty
				invoice_part.rate = 0
				invoice_part.price_list_rate = 0
				invoice_part.discount_percentage = 0
				invoice_part.uom = part_uom
				invoice_part.dw_is_internal_line = 1
	
	# Store which watch rows are covered so finalize_invoice can mark only those as Delivered.
	# For the quotation path, inherit coverage from the quotation's own remarks (set when quotation was created).
	if source_type == "quotation" and repair_order.quotation and not covered_item_names:
		try:
			_q = frappe.get_doc("Quotation", repair_order.quotation)
			if _q.remarks and "covered_items:" in _q.remarks:
				_raw = _q.remarks.split("covered_items:")[1]
				_end = _raw.index("]") + 1
				covered_item_names = json.loads(_raw[:_end])
		except Exception:
			pass

	if covered_item_names:
		_covered = covered_item_names
	else:
		_covered = [i.name for i in repair_order.items]
	invoice.remarks = f"covered_items:{json.dumps(_covered)}"

	# Handle partial payments
	if payment_type == "advance" or payment_type == "balance":
		if not amount:
			frappe.throw(_("Amount is required for {0} payment").format(payment_type))
		
		# Adjust invoice total by adding a discount
		discount_amount = total_amount - amount
		invoice.discount_amount = discount_amount
		invoice.apply_discount_on = "Grand Total"
		
		if payment_type == "advance":
			invoice.title = f"Advance Payment - {repair_order.name}"
		else:
			invoice.title = f"Balance Payment - {repair_order.name}"
	else:
		invoice.title = f"Invoice for {repair_order.name}"
	
	# Save invoice
	invoice.insert(ignore_permissions=True)

	# ERPNext's insert() fetches price_list_rate from the selling price list
	# and overwrites our rate=0 on internal part lines. Force them back to zero.
	_zero_internal_lines(invoice)
	
	# Link invoice to repair order
	if not repair_order.sales_invoice:
		repair_order.sales_invoice = invoice.name
	repair_order.save(ignore_permissions=True)
	
	frappe.msgprint(_("Sales Invoice {0} created successfully").format(invoice.name))
	
	return {
		"invoice_name": invoice.name,
		"invoice_amount": invoice.grand_total or invoice.total or 0,
		"print_format": get_workflow_settings(WORKFLOW_REPAIR_SERVICE).get("print_format") or "Standard",
	}


@frappe.whitelist()
def get_invoice_summary(repair_order_name):
	"""
	Get invoice summary for a repair order.
	
	Args:
		repair_order_name: Name of the repair order
	
	Returns:
		Dictionary with invoice details
	"""
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	
	if not repair_order.sales_invoice:
		return None
	
	invoice = frappe.get_doc("Sales Invoice", repair_order.sales_invoice)
	
	# Get payment entries linked to this invoice
	paid_amount = frappe.db.sql("""
		SELECT SUM(allocated_amount)
		FROM `tabPayment Entry Reference`
		WHERE reference_name = %s AND reference_doctype = 'Sales Invoice'
	""", invoice.name)[0][0] or 0
	
	balance_amount = invoice.grand_total - paid_amount
	
	return {
		"invoice_name": invoice.name,
		"invoice_amount": invoice.grand_total,
		"paid_amount": paid_amount,
		"balance_amount": balance_amount,
		"status": invoice.status,
		"payment_status": "Paid" if paid_amount >= invoice.grand_total else "Unpaid"
	}


@frappe.whitelist()
def check_parts_availability(repair_order_name, warehouse=""):
	"""Return part shortages for a repair order, grouped by item_code."""
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	company = frappe.db.get_single_value("Global Defaults", "default_company") or ""
	return validate_parts_stock_availability(repair_order, warehouse=warehouse or "", company=company)


@frappe.whitelist()
def finalize_invoice(repair_order_name, invoice_name, discount=0, payment_mode="Cash", mark_as_delivered=True):
	"""
	Finalize an invoice with discount, payment mode, and optionally mark order as delivered.
	
	Args:
		repair_order_name: Name of the repair order
		invoice_name: Name of the sales invoice
		discount: Discount amount to apply
		payment_mode: Cash, Credit Card, or Credit (Pay Later)
		mark_as_delivered: Whether to submit the repair order
	
	Returns:
		Dictionary with success status and message
	"""
	import json
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	
	# Parse boolean if passed as string
	if isinstance(mark_as_delivered, str):
		mark_as_delivered = mark_as_delivered.lower() in ['true', '1', 'yes']
	
	# Parse discount as float
	discount = float(discount or 0)
	
	# Get the invoice
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	invoice.flags.ignore_permissions = True

	# Get repair order
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	repair_order.flags.ignore_permissions = True

	# Validate stock availability before finalizing invoice.
	warehouse = invoice.set_warehouse or ""
	shortage_map = validate_parts_stock_availability(repair_order, warehouse=warehouse, company=invoice.company)
	if shortage_map:
		shortage_lines = []
		for item_code, shortage in shortage_map.items():
			item_name = shortage.get("item_name") or item_code
			shortage_lines.append(
				_("{0} ({1}): Need {2}, Have {3}").format(
					item_name,
					item_code,
					shortage.get("qty_required", 0),
					shortage.get("qty_available", 0),
				)
			)
		frappe.throw(
			_("Insufficient stock for repair order {0}:\n{1}").format(
				repair_order_name,
				"\n".join(shortage_lines),
			)
		)
	
	# Apply discount if any
	if discount > 0:
		invoice.discount_amount = discount
		invoice.save(ignore_permissions=True)
		invoice.reload()
	
	# Add payment mode entry if this is a POS invoice
	mode_of_payment_doc = None
	if invoice.is_pos:
		# Clear existing payments
		invoice.payments = []
		
		# Get the Mode of Payment details
		mode_of_payment_doc = frappe.get_doc("Mode of Payment", payment_mode)
		
		# Get default account for this mode of payment
		default_account = None
		if mode_of_payment_doc.accounts:
			for acc in mode_of_payment_doc.accounts:
				if acc.company == invoice.company:
					default_account = acc.default_account
					break
		
		# If no account found, get company's default cash account
		if not default_account:
			default_account = frappe.get_cached_value("Company", invoice.company, "default_cash_account")
		
		# Add payment entry with the final amount (after discount)
		payment_entry = invoice.append('payments', {})
		payment_entry.mode_of_payment = payment_mode
		payment_entry.account = default_account
		
		# Set payment amount based on payment mode TYPE (not name)
		# Cash and Bank types = immediate payment
		# General type = credit/pay later
		if mode_of_payment_doc.type in ['Cash', 'Bank']:
			# Full payment for Cash/Bank modes
			payment_entry.amount = invoice.grand_total
		else:
			# Credit/Pay Later (General type) - no payment now
			payment_entry.amount = 0
		
		# Save to update totals and calculate paid_amount
		invoice.save(ignore_permissions=True)
		invoice.reload()
	else:
		# For non-POS invoices, set in remarks
		if payment_mode:
			invoice.db_set('remarks', f"Payment Mode: {payment_mode}", update_modified=False)
	
	# Submit the invoice
	if invoice.docstatus == 0:
		try:
			invoice.submit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(frappe.get_traceback(), _("Finalize Invoice Submit Failure"))
			frappe.throw(_("Failed to submit Sales Invoice. Please review stock and accounting setup, then retry."))

	# Verify stock ledger entries were created for stock items (parts) on the invoice.
	stock_item_codes = [
		item.item_code
		for item in (invoice.items or [])
		if item.item_code and frappe.db.get_value("Item", item.item_code, "is_stock_item")
	]
	if stock_item_codes and int(invoice.update_stock or 0):
		sle_count = frappe.db.sql(
			"""
			select count(*)
			from `tabStock Ledger Entry`
			where voucher_type = 'Sales Invoice'
			  and voucher_no = %s
			  and item_code in ({placeholders})
			""".format(placeholders=", ".join(["%s"] * len(stock_item_codes))),
			tuple([invoice.name, *stock_item_codes]),
		)[0][0] or 0
		if sle_count <= 0:
			frappe.log_error(
				_("No Stock Ledger Entry found for stock items in Sales Invoice {0}").format(invoice.name),
				_("Finalize Invoice Stock Ledger Warning"),
			)
	
	# Accumulate invoiced and paid amounts across multiple invoices (advance + balance flows)
	is_immediate_payment = bool(mode_of_payment_doc and mode_of_payment_doc.type in ['Cash', 'Bank'])

	prev_invoiced = float(frappe.db.get_value("DW Repair Order", repair_order_name, "invoiced_amount") or 0)
	prev_paid     = float(frappe.db.get_value("DW Repair Order", repair_order_name, "paid_amount") or 0)

	new_invoiced = prev_invoiced + float(invoice.grand_total or 0)
	new_paid     = prev_paid + (float(invoice.grand_total or 0) if is_immediate_payment else 0)

	# Balance = quotation total minus what has been paid; fall back to total invoiced
	ref_total   = float(repair_order.quotation_amount or 0) or new_invoiced
	new_balance = max(0.0, ref_total - new_paid)

	repair_order.db_set('invoiced_amount', new_invoiced, update_modified=False)
	repair_order.db_set('paid_amount', new_paid, update_modified=False)
	repair_order.db_set('balance_amount', new_balance, update_modified=False)
	
	# Parse which watch rows this invoice covers (stored in remarks by create_sales_invoice)
	import json as _json
	covered_item_names = None
	if invoice.remarks and 'covered_items:' in invoice.remarks:
		try:
			raw = invoice.remarks.split('covered_items:')[1]
			# Grab the JSON array portion
			end = raw.index(']') + 1
			covered_item_names = _json.loads(raw[:end])
		except Exception:
			covered_item_names = None

	# Mark covered items as Delivered regardless of mark_as_delivered flag.
	# Skip watches already resolved as Not Repairable/Declined — those were only
	# swept into "covered_items" because it defaults to every watch on the order,
	# not because this invoice actually billed them, so their status must stay intact.
	if covered_item_names:
		for item in repair_order.items:
			if item.name in covered_item_names and normalize_repair_item_status(item.status) not in (
				WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED
			):
				frappe.db.set_value('DW Repair Item', item.name, 'status', 'Delivered', update_modified=False)

	# Mark as delivered if requested
	if mark_as_delivered:
		repair_order.reload()
		# Only submit (full Frappe docsubmit) when every item has been invoiced+delivered,
		# or was returned to the customer without repair (Not Repairable/Declined).
		# "Completed" means repair is done but not yet invoiced — do not submit early.
		all_done = all(
			normalize_repair_item_status(item.status) in (
				WATCH_STATUS_DELIVERED, WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED
			)
			for item in repair_order.items
		)
		if all_done:
			repair_order.flags.ignore_permissions = True
			if repair_order.docstatus == 0:
				repair_order.submit()
				frappe.msgprint(_("Repair order marked as Delivered"))
		else:
			# Partial delivery: recalculate order status without submitting
			repair_order.update_order_status_from_items()
			repair_order.save(ignore_permissions=True)
			frappe.msgprint(_("Partial delivery recorded — remaining watches still in progress."))
	
	frappe.db.commit()
	
	return {
		"success": True,
		"invoice_name": invoice.name,
		"invoice_total": invoice.grand_total,
		"discount_applied": discount,
		"payment_mode": payment_mode,
		"order_delivered": mark_as_delivered
	}


@frappe.whitelist()
def close_repair_order_without_invoice(repair_order_name):
	"""
	Close a repair order where no invoice is needed — every watch is either
	already invoiced/delivered, or is being handed back to the customer without
	repair (Not Repairable, or the customer declined the quotation).

	This replaces the old workaround of creating a zero-amount Sales Invoice
	just to satisfy the "invoice required before delivery" rule.

	Args:
		repair_order_name: Name of the repair order

	Returns:
		Dictionary with success status
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	repair_order.flags.ignore_permissions = True

	if repair_order.docstatus != 0:
		frappe.throw(_("Repair order {0} is already {1}.").format(repair_order_name, repair_order.status))

	no_invoice_needed_statuses = {WATCH_STATUS_DELIVERED, WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED}
	unresolved = [
		item for item in repair_order.items
		if normalize_repair_item_status(item.status) not in no_invoice_needed_statuses
	]
	if unresolved:
		frappe.throw(
			_("Cannot close order: {0} still need an invoice or a final diagnosis (Not Repairable/Declined).").format(
				", ".join(f"{item.watch_brand} {item.watch_model}" for item in unresolved)
			)
		)

	if not any(
		normalize_repair_item_status(item.status) in (WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED)
		for item in repair_order.items
	):
		frappe.throw(_("This action is only needed when a watch is being returned without repair."))

	repair_order.submit()
	frappe.db.commit()

	frappe.msgprint(_("Repair order closed — watch(es) returned to customer without repair."))

	return {"success": True}
