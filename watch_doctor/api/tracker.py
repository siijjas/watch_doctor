"""Front-desk Order Tracker endpoints.

One row per watch, grouped into customer-facing stages, so the receptionist
can answer "is it ready?" from a phone number and see what needs chasing
today. Stage moves go through DWRepairOrder.save() like every other save path.
"""

import re

import frappe
from frappe import _
from frappe.utils import cint, date_diff, getdate, nowdate

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	WATCH_STATUS_APPROVAL_FOR_ESTIMATE,
	WATCH_STATUS_APPROVED,
	WATCH_STATUS_COMPLETED,
	WATCH_STATUS_DECLINED,
	WATCH_STATUS_DELIVERED,
	WATCH_STATUS_DIAGNOSED,
	WATCH_STATUS_IN_REPAIR,
	WATCH_STATUS_NOT_REPAIRABLE,
	WATCH_STATUS_PENDING,
	WATCH_STATUS_QUOTED,
	WATCH_STATUS_UNDER_DIAGNOSIS,
	normalize_repair_item_status,
)

STAGE_NOT_STARTED = "not_started"
STAGE_WORKSHOP = "workshop"
STAGE_ESTIMATE = "estimate"
STAGE_APPROVAL = "approval"
STAGE_PARTS = "parts"
STAGE_READY = "ready"
STAGE_COLLECTED = "collected"

# Who is holding the watch up, from the customer's point of view.
STAGE_BY_WATCH_STATUS = {
	WATCH_STATUS_PENDING: STAGE_NOT_STARTED,
	WATCH_STATUS_UNDER_DIAGNOSIS: STAGE_WORKSHOP,
	WATCH_STATUS_DIAGNOSED: STAGE_ESTIMATE,
	WATCH_STATUS_APPROVAL_FOR_ESTIMATE: STAGE_ESTIMATE,
	WATCH_STATUS_QUOTED: STAGE_APPROVAL,
	WATCH_STATUS_APPROVED: STAGE_WORKSHOP,
	WATCH_STATUS_IN_REPAIR: STAGE_WORKSHOP,
	WATCH_STATUS_COMPLETED: STAGE_READY,
	WATCH_STATUS_NOT_REPAIRABLE: STAGE_READY,
	WATCH_STATUS_DECLINED: STAGE_READY,
	WATCH_STATUS_DELIVERED: STAGE_COLLECTED,
}

# A watch sitting in a stage this many days (or more) is flagged for follow-up.
# Watches waiting for parts are flagged once the expected date has passed.
ATTENTION_AFTER_DAYS = {
	STAGE_NOT_STARTED: 2,
	STAGE_ESTIMATE: 2,
	STAGE_APPROVAL: 5,
	STAGE_WORKSHOP: 7,
	STAGE_READY: 7,
}

OPEN_ROWS_LIMIT = 2000
SEARCH_ROWS_LIMIT = 100

ACTION_APPROVE = "approve"
ACTION_DECLINE = "decline"
ACTION_START = "start"
ACTION_COMPLETE = "complete"
ACTION_PARTS_WAIT = "parts_wait"
ACTION_PARTS_ARRIVED = "parts_arrived"

# Watch statuses each action may be applied from (None = any open status).
ACTION_ALLOWED_FROM = {
	ACTION_APPROVE: {WATCH_STATUS_QUOTED},
	ACTION_DECLINE: {WATCH_STATUS_QUOTED},
	ACTION_START: {WATCH_STATUS_APPROVED},
	ACTION_COMPLETE: {WATCH_STATUS_IN_REPAIR},
	ACTION_PARTS_WAIT: {WATCH_STATUS_APPROVED, WATCH_STATUS_IN_REPAIR},
	ACTION_PARTS_ARRIVED: None,
}


@frappe.whitelist()
def get_order_tracker(search: str = ""):
	"""Return tracker rows, one per watch.

	Without a search: every watch still in the shop (open orders only).
	With a search: matching watches including already-collected ones, so the
	front desk can also answer "we handed that over on ...".
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	rows, truncated = get_tracker_rows(search)
	return {
		"rows": rows,
		"attention_after_days": ATTENTION_AFTER_DAYS,
		"whatsapp_enabled": bool(frappe.conf.get("whatsapp_enabled")),
		"truncated": truncated,
	}


def get_tracker_rows(search: str = ""):
	"""Load and classify tracker rows. Returns (rows, truncated). No permission check."""
	search = (search or "").strip()
	conditions = ["i.parenttype = 'DW Repair Order'", "o.docstatus < 2"]
	values = {}

	if search:
		values["needle"] = f"%{search}%"
		search_clauses = [
			"o.name LIKE %(needle)s",
			"IFNULL(o.reference_number, '') LIKE %(needle)s",
			"IFNULL(c.customer_name, '') LIKE %(needle)s",
			"IFNULL(o.customer, '') LIKE %(needle)s",
			"IFNULL(c.mobile_no, '') LIKE %(needle)s",
			"IFNULL(i.serial_number, '') LIKE %(needle)s",
			"IFNULL(i.watch_brand, '') LIKE %(needle)s",
			"IFNULL(m.model_name, '') LIKE %(needle)s",
		]
		phone_columns = ["c.mobile_no"]
		if frappe.db.has_column("Customer", "whatsapp_no"):
			phone_columns.append("c.whatsapp_no")
			search_clauses.append("IFNULL(c.whatsapp_no, '') LIKE %(needle)s")

		# Phone numbers are stored with mixed spacing / country-code formatting.
		digits = re.sub(r"[\s+\-()]", "", search)
		if digits.isdigit() and len(digits) >= 3:
			values["digits"] = f"%{digits}%"
			for column in phone_columns:
				search_clauses.append(
					f"REPLACE(REPLACE(REPLACE(IFNULL({column}, ''), ' ', ''), '-', ''), '+', '') LIKE %(digits)s"
				)

		conditions.append("(" + " OR ".join(search_clauses) + ")")
		limit = SEARCH_ROWS_LIMIT
	else:
		conditions.append("o.docstatus = 0")
		conditions.append("IFNULL(o.status, '') != 'Delivered'")
		conditions.append("IFNULL(i.status, '') != 'Delivered'")
		limit = OPEN_ROWS_LIMIT

	query = f"""
		SELECT
			i.name AS item_name,
			i.watch_brand,
			COALESCE(m.model_name, i.watch_model) AS watch_model,
			i.serial_number,
			i.status AS watch_status,
			i.status_changed_on,
			i.awaiting_parts,
			i.parts_expected_date,
			i.parts_note,
			COALESCE(t.technician_name, i.technician) AS technician,
			o.name AS repair_order,
			o.reference_number,
			o.status AS order_status,
			o.docstatus,
			o.priority,
			o.received_date,
			o.promised_delivery_date,
			o.delivery_date,
			o.sales_invoice,
			o.balance_amount,
			c.customer_name,
			o.customer,
			c.mobile_no AS customer_mobile
		FROM `tabDW Repair Item` i
		INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		LEFT JOIN `tabCustomer` c ON c.name = o.customer
		LEFT JOIN `tabDW Watch Model` m ON m.name = i.watch_model
		LEFT JOIN `tabDW Technician` t ON t.name = i.technician
		WHERE {' AND '.join(conditions)}
		ORDER BY (o.docstatus = 0) DESC, o.received_date DESC, o.name DESC, i.idx ASC
		LIMIT {int(limit)}
	"""
	# Passing an empty values dict makes pymysql attempt substitution and fail.
	rows = frappe.db.sql(query, values, as_dict=True) if values else frappe.db.sql(query, as_dict=True)

	last_messages = _get_last_messages({row.repair_order for row in rows})
	today = getdate(nowdate())

	for row in rows:
		row.watch_status = normalize_repair_item_status(row.watch_status)
		if row.docstatus == 1 or row.order_status == "Delivered":
			stage = STAGE_COLLECTED
		else:
			stage = STAGE_BY_WATCH_STATUS.get(row.watch_status, STAGE_WORKSHOP)

		row.awaiting_parts = bool(cint(row.awaiting_parts)) and stage not in (STAGE_READY, STAGE_COLLECTED)
		if row.awaiting_parts:
			stage = STAGE_PARTS
		row.stage = stage

		stage_since = row.status_changed_on or row.received_date
		row.days_in_stage = max(date_diff(today, getdate(stage_since)), 0) if stage_since else 0

		row.overdue_days = 0
		if stage not in (STAGE_READY, STAGE_COLLECTED) and row.promised_delivery_date:
			row.overdue_days = max(date_diff(today, row.promised_delivery_date), 0)

		threshold = ATTENTION_AFTER_DAYS.get(stage)
		row.needs_attention = bool(threshold is not None and row.days_in_stage >= threshold)

		row.parts_overdue_days = 0
		if stage == STAGE_PARTS:
			if row.parts_expected_date:
				row.parts_overdue_days = max(date_diff(today, row.parts_expected_date), 0)
				row.needs_attention = row.parts_overdue_days > 0
			else:
				row.needs_attention = row.days_in_stage >= ATTENTION_AFTER_DAYS[STAGE_WORKSHOP]

		row.customer_name = row.customer_name or row.customer
		row.customer_mobile = row.customer_mobile or ""
		row.last_message = last_messages.get(row.repair_order)

	return rows, len(rows) >= limit


def _get_last_messages(order_names):
	"""Latest WhatsApp message queued/sent per order."""
	if not order_names:
		return {}

	logs = frappe.db.sql(
		"""
			SELECT
				l.repair_order,
				l.notification_key,
				COALESCE(tpl.label, l.notification_key) AS label,
				l.status,
				COALESCE(l.sent_at, l.creation) AS sent_at
			FROM `tabDW WhatsApp Log` l
			LEFT JOIN `tabDW WhatsApp Template` tpl ON tpl.name = l.notification_key
			WHERE l.repair_order IN %(order_names)s AND l.status IN ('Queued', 'Sent')
			ORDER BY l.creation DESC
		""",
		{"order_names": tuple(order_names)},
		as_dict=True,
	)

	latest = {}
	for log in logs:
		if log.repair_order not in latest:
			latest[log.repair_order] = {
				"notification_key": log.notification_key,
				"label": log.label,
				"status": log.status,
				"sent_at": log.sent_at,
			}
	return latest


@frappe.whitelist()
def update_watch_stage(item_name: str, action: str, expected_date: str | None = None, note: str | None = None):
	"""One-click update for a single watch from the Order Tracker.

	approve       - customer accepted the estimate: Quoted -> Approved
	decline       - customer refused the estimate:  Quoted -> Declined
	start         - technician started the repair:  Approved -> In Repair
	complete      - repair is finished:             In Repair -> Completed
	parts_wait    - repair is held up waiting for a part (needs expected_date)
	parts_arrived - the part is in, the hold is lifted
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	if action not in ACTION_ALLOWED_FROM:
		frappe.throw(_("Unknown action: {0}").format(action))

	order_name = frappe.db.get_value(
		"DW Repair Item", {"name": item_name, "parenttype": "DW Repair Order"}, "parent"
	)
	if not order_name:
		frappe.throw(_("Watch not found"), frappe.DoesNotExistError)

	order = frappe.get_doc("DW Repair Order", order_name)
	if order.docstatus != 0:
		frappe.throw(_("Repair order {0} is already closed.").format(order_name))

	item = next((row for row in order.items if row.name == item_name), None)
	if not item:
		frappe.throw(_("Watch not found"), frappe.DoesNotExistError)

	current_status = normalize_repair_item_status(item.status)
	allowed_from = ACTION_ALLOWED_FROM[action]
	if allowed_from is not None and current_status not in allowed_from:
		frappe.throw(
			_("This watch is now '{0}'. Refresh the tracker and try again.").format(current_status)
		)

	# The save pipeline derives the watch status from its tasks first, so the
	# tasks have to move with it (same as the order screen's "Move to In Repair").
	item_tasks = [task for task in order.all_tasks if task.repair_item_key == str(item.idx)]
	if action == ACTION_APPROVE:
		item.status = WATCH_STATUS_APPROVED
	elif action == ACTION_DECLINE:
		item.status = WATCH_STATUS_DECLINED
	elif action == ACTION_START:
		item.status = WATCH_STATUS_IN_REPAIR
		for task in item_tasks:
			if task.status != "Completed":
				task.status = "In Progress"
	elif action == ACTION_COMPLETE:
		item.status = WATCH_STATUS_COMPLETED
		for task in item_tasks:
			task.status = "Completed"
	elif action == ACTION_PARTS_WAIT:
		if not expected_date:
			frappe.throw(_("Enter the date the part is expected."))
		item.awaiting_parts = 1
		item.parts_expected_date = getdate(expected_date)
		item.parts_note = (note or "").strip()[:140] or None
	else:
		if not cint(item.awaiting_parts):
			frappe.throw(_("This watch is not waiting for parts. Refresh the tracker and try again."))
		item.awaiting_parts = 0

	order.save()

	return {
		"repair_order": order.name,
		"item_name": item.name,
		"watch_status": item.status,
		"order_status": order.status,
		"awaiting_parts": cint(item.awaiting_parts),
	}
