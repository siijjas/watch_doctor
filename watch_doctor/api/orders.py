"""Repair-order lifecycle endpoints split from watch_doctor/api.py (API_PY_AUDIT.md item 5).

save_repair_order, update_repair_item_diagnosis, list_repair_orders. Both save
endpoints are thin wrappers -- payload parsing and permission checks only; all
normalization/task-sync/status-resolution logic lives in
DWRepairOrder._run_save_pipeline (API_PY_AUDIT.md item 6), invoked via
doc.save() -> validate() for every save path, Desk or API.
"""

import json

import frappe
from frappe import _
from frappe.utils import now_datetime

from watch_doctor.permissions import (
    require_roles,
    can_access_repair_order,
    get_current_technician,
    get_current_technician_identifiers,
    ROLE_EXECUTIVE,
    ROLE_DATA_ENTRY,
    ROLE_TECHNICIAN,
    PRIVILEGED_ROLES,
)
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
    VALID_DIAGNOSIS_STATUSES,
    has_diagnosis_content,
)
from watch_doctor.list_field_utils import normalize_string_list


@frappe.whitelist()
def save_repair_order(doc_json):
	"""Custom save method for repair orders that handles system fields properly.

	Thin wrapper: parse payload, check permissions, hand off to
	DWRepairOrder.validate()'s consolidated pipeline via doc.save(). All
	normalization / task-sync / status-resolution logic lives in the
	controller (DWRepairOrder._run_save_pipeline) so Desk edits get the same
	rules. See API_PY_AUDIT.md item 6.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	doc_dict = json.loads(doc_json) if isinstance(doc_json, str) else doc_json

	# Technicians may only update orders they are assigned to
	if doc_dict.get('name'):
		if not can_access_repair_order(doc_dict['name']):
			frappe.throw(_("You do not have access to this repair order"), frappe.PermissionError)

	# Remove system fields recursively.
	# `modified` is kept on the ROOT doc so doc.save() below can detect a
	# stale save the same way Frappe does for any other doctype; strip it
	# only from child rows.
	def clean_dict(d, is_root=False):
		if isinstance(d, dict):
			keys_to_remove = ['creation', 'modified_by', 'owner', 'simple_description',
			                  'docstatus', '__islocal', '__unsaved', '__onload']
			if not is_root:
				keys_to_remove.append('modified')
			for key in keys_to_remove:
				d.pop(key, None)
			for key, value in d.items():
				if isinstance(value, dict):
					clean_dict(value, is_root=False)
				elif isinstance(value, list):
					for item in value:
						if isinstance(item, dict):
							clean_dict(item, is_root=False)
		return d

	doc_dict = clean_dict(doc_dict, is_root=True)

	# The SPA sends items[].tasks/parts_used/issues nested, but the DocType
	# stores them as flat sibling tables (all_tasks/all_parts/all_issues)
	# keyed by repair_item_key. Pull the nested arrays out of the payload
	# before building the doc and stash them on each item's own transient
	# .flags, for DWRepairOrder._run_save_pipeline to flatten during
	# validate(). Desk edits never populate these flags -- the flat tables
	# are edited directly there, so the controller treats their absence as
	# a no-op.
	pending_by_item = []
	for item in doc_dict.get('items', []):
		pending_by_item.append({
			'tasks': item.pop('tasks', None),
			'parts_used': item.pop('parts_used', None),
			'issues': item.pop('issues', None),
		})

	# Get or create document
	if doc_dict.get('name'):
		# Update existing
		doc = frappe.get_doc('DW Repair Order', doc_dict['name'])
		doc.update(doc_dict)
	else:
		# Create new
		doc = frappe.get_doc(doc_dict)

	for item, pending in zip(doc.items or [], pending_by_item):
		item.flags.pending_tasks = pending['tasks']
		item.flags.pending_parts_used = pending['parts_used']
		item.flags.pending_issues = pending['issues']

	try:
		doc.save()
	except frappe.TimestampMismatchError:
		frappe.throw(
			_("This order was modified by another user while you were editing. "
			  "Please reload the page and re-apply your changes."),
			title=_("Save Conflict"),
		)

	# Reload to get all child tables populated
	doc.reload()

	return doc.as_dict()


@frappe.whitelist()
def update_repair_item_diagnosis(item_name, diagnosis_json):
	"""Update diagnosis fields for a single repair item with item-level technician checks."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	diagnosis = json.loads(diagnosis_json) if isinstance(diagnosis_json, str) else (diagnosis_json or {})

	item_row = frappe.db.get_value(
		"DW Repair Item",
		item_name,
		["name", "parent", "technician"],
		as_dict=True,
	)
	if not item_row:
		frappe.throw(_("Repair item not found"), frappe.DoesNotExistError)

	if not can_access_repair_order(item_row.parent):
		frappe.throw(_("You do not have access to this repair order"), frappe.PermissionError)

	roles = set(frappe.get_roles())
	is_privileged = bool(roles & PRIVILEGED_ROLES)
	if not is_privileged and ROLE_TECHNICIAN in roles:
		tech_values = set(get_current_technician_identifiers())
		if not tech_values or (item_row.technician or "") not in tech_values:
			frappe.throw(_("You can only update diagnosis for watches assigned to you"), frappe.PermissionError)

	allowed_fields = {
		"diagnosis_status",
		"diagnosis_summary",
		"movement_type",
		"movement_caliber",
		"movement_information",
		"recommended_work",
	}
	for key in diagnosis.keys():
		if key not in allowed_fields:
			frappe.throw(_("Field {0} is not allowed in diagnosis update").format(key), frappe.PermissionError)

	incoming_status = str(diagnosis.get("diagnosis_status") or "").strip()
	if incoming_status and incoming_status not in VALID_DIAGNOSIS_STATUSES:
		frappe.throw(_("Invalid diagnosis status"))

	order_doc = frappe.get_doc("DW Repair Order", item_row.parent)
	target_item = next((item for item in order_doc.items if item.name == item_name), None)
	if not target_item:
		frappe.throw(_("Repair item not found in parent order"), frappe.DoesNotExistError)

	# Set the raw request values; DWRepairOrder._run_save_pipeline (invoked
	# from validate() below, via order_doc.save()) does the JSON-encoding,
	# legacy movement_information split, task auto-sync, and status/diagnosis
	# resolution -- the same pipeline every other save path now goes through.
	diagnosis_summary = normalize_string_list(diagnosis.get("diagnosis_summary"))
	movement_type = normalize_string_list(diagnosis.get("movement_type"))
	movement_caliber = normalize_string_list(diagnosis.get("movement_caliber"))
	recommended_work = normalize_string_list(diagnosis.get("recommended_work"))

	target_item.diagnosis_status = incoming_status
	target_item.diagnosis_summary = diagnosis.get("diagnosis_summary")
	target_item.movement_type = diagnosis.get("movement_type")
	target_item.movement_caliber = diagnosis.get("movement_caliber")
	target_item.movement_information = diagnosis.get("movement_information")
	target_item.recommended_work = diagnosis.get("recommended_work")

	# diagnosed_by/diagnosis_date are request metadata (who is diagnosing,
	# right now) -- not derivable from doc state, so they stay computed here
	# from the raw incoming content rather than moving into the controller.
	has_content = has_diagnosis_content(
		diagnosis_summary,
		movement_type,
		movement_caliber,
		recommended_work,
	)

	if has_content:
		target_item.diagnosis_date = now_datetime()
		if ROLE_TECHNICIAN in roles and not is_privileged:
			current_technician = get_current_technician()
			if current_technician:
				target_item.diagnosed_by = current_technician
	elif is_privileged:
		target_item.diagnosed_by = None
		target_item.diagnosis_date = None

	order_doc.save()

	return {
		"item_name": target_item.name,
		"diagnosis_status": target_item.diagnosis_status,
		"diagnosis_summary": normalize_string_list(target_item.diagnosis_summary),
		"movement_type": normalize_string_list(target_item.movement_type),
		"movement_caliber": normalize_string_list(target_item.movement_caliber),
		"movement_information": normalize_string_list(target_item.movement_information),
		"recommended_work": normalize_string_list(target_item.recommended_work),
		"diagnosed_by": target_item.diagnosed_by,
		"diagnosis_date": target_item.diagnosis_date,
	}




@frappe.whitelist()
def list_repair_orders(
	start: int = 0,
	limit_page_length: int = 100,
	search: str = "",
	status: str = "All",
	include_total: int = 0,
):
	"""Return lightweight repair order list with customer display."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)

	# Keep page size bounded to protect API performance.
	try:
		start = max(0, int(start or 0))
	except (TypeError, ValueError):
		start = 0
	try:
		limit_page_length = int(limit_page_length or 100)
	except (TypeError, ValueError):
		limit_page_length = 100
	limit_page_length = max(1, min(limit_page_length, 500))
	search = (search or "").strip()
	status = (status or "All").strip()
	include_total = int(include_total or 0)

	# Technicians: only orders assigned to them
	roles = set(frappe.get_roles())
	extra_filters = {}
	if not (roles & PRIVILEGED_ROLES) and ROLE_TECHNICIAN in roles:
		tech_values = get_current_technician_identifiers()
		if tech_values:
			assigned_orders = frappe.get_all(
				"DW Repair Item",
				filters={"technician": ["in", tech_values]},
				fields=["parent"],
				distinct=True,
			)
			order_names = [r.parent for r in assigned_orders]
			if not order_names:
				return []
			extra_filters["name"] = ["in", order_names]
		else:
			return []

	where_clauses = ["1=1"]
	query_values = {
		"start": start,
		"limit": limit_page_length,
	}

	if "name" in extra_filters and extra_filters["name"][0] == "in":
		where_clauses.append("o.name IN %(order_names)s")
		query_values["order_names"] = tuple(extra_filters["name"][1])

	if status and status != "All":
		where_clauses.append("o.status = %(status)s")
		query_values["status"] = status

	if search:
		where_clauses.append("""
			(
				o.name LIKE %(needle)s
				OR IFNULL(o.reference_number, '') LIKE %(needle)s
				OR IFNULL(o.customer, '') LIKE %(needle)s
				OR IFNULL(c.customer_name, '') LIKE %(needle)s
				OR IFNULL(c.mobile_no, '') LIKE %(needle)s
			)
		""")
		query_values["needle"] = f"%{search}%"

	orders = frappe.db.sql(
		f"""
			SELECT
				o.name,
				o.customer,
				o.reference_number,
				o.status,
				o.priority,
				o.received_date,
				c.customer_name,
				c.mobile_no AS customer_mobile
			FROM `tabDW Repair Order` o
			LEFT JOIN `tabCustomer` c ON c.name = o.customer
			WHERE {' AND '.join(where_clauses)}
			ORDER BY o.modified DESC
			LIMIT %(limit)s OFFSET %(start)s
		""",
		query_values,
		as_dict=True,
	)

	total_count = None
	if include_total:
		# Build a separate values dict for COUNT — strip LIMIT/OFFSET keys which
		# have no placeholders in the COUNT SQL (passing unused keys causes pymysql
		# "not all arguments converted" error).
		count_values = {k: v for k, v in query_values.items() if k not in ("start", "limit")}
		count_sql = f"""
			SELECT COUNT(*) as count
			FROM `tabDW Repair Order` o
			LEFT JOIN `tabCustomer` c ON c.name = o.customer
			WHERE {' AND '.join(where_clauses)}
		"""
		# Only pass values when there are actual filter params; passing an empty
		# dict to pymysql still triggers substitution and errors on plain SQL.
		if count_values:
			count_rows = frappe.db.sql(count_sql, count_values, as_dict=True)
		else:
			count_rows = frappe.db.sql(count_sql, as_dict=True)
		total_count = count_rows[0].get("count", 0) if count_rows else 0

	order_names = [o.name for o in orders]
	item_count_map = {}
	if order_names:
		item_counts = frappe.db.sql(
			"""
				SELECT parent, COUNT(name) AS item_count
				FROM `tabDW Repair Item`
				WHERE parent IN %(order_names)s
				GROUP BY parent
			""",
			{"order_names": tuple(order_names)},
			as_dict=True,
		)
		item_count_map = {row.parent: int(row.item_count or 0) for row in item_counts}

	for o in orders:
		o["customer_name"] = o.get("customer_name") or o.get("customer")
		o["customer_mobile"] = o.get("customer_mobile") or ""
		o["item_count"] = item_count_map.get(o.name, 0)

	if include_total:
		return {
			"orders": orders,
			"total_count": int(total_count or 0),
		}

	return orders
