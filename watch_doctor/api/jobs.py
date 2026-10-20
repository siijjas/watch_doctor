"""Order page and technician bench endpoints (UI_REDESIGN_SPEC.md B5.4).

Each edit changes one thing on one watch and saves through
DWRepairOrder.save(), so the usual pipeline (task sync, status resolution,
order status) still runs, but the browser never resends the whole order.

Desk roles may edit any open watch. Technicians may edit only watches
assigned to them, and never the stage (the receptionist sets stages).
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, nowdate

from watch_doctor.api.tracker import _get_last_messages, log_watch_activity, ui_stage_of
from watch_doctor.permissions import (
	PRIVILEGED_ROLES,
	ROLE_DATA_ENTRY,
	ROLE_EXECUTIVE,
	ROLE_TECHNICIAN,
	can_access_repair_order,
	get_current_technician_identifiers,
	require_roles,
)
from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	ensure_other_issue_template,
	resolve_issue_template_name,
)

TASK_STATUSES = ("Pending", "In Progress", "Completed")
PRIORITIES = ("Normal", "Urgent", "VIP")


def _is_desk():
	return bool(set(frappe.get_roles()) & PRIVILEGED_ROLES)


def _load_watch(item_name, technician_may_edit=True):
	"""Return (order, item) for an open order the current user may edit."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	order_name = frappe.db.get_value(
		"DW Repair Item", {"name": item_name, "parenttype": "DW Repair Order"}, "parent"
	)
	if not order_name or not can_access_repair_order(order_name):
		frappe.throw(_("Watch not found"), frappe.DoesNotExistError)

	order = frappe.get_doc("DW Repair Order", order_name)
	item = next((row for row in order.items if row.name == item_name), None)
	if not item:
		frappe.throw(_("Watch not found"), frappe.DoesNotExistError)
	if order.docstatus != 0 or item.status == "Delivered":
		frappe.throw(_("This order is closed."))

	if not _is_desk():
		if not technician_may_edit:
			frappe.throw(_("Only the front desk can change this."), frappe.PermissionError)
		if (item.technician or "") not in set(get_current_technician_identifiers()):
			frappe.throw(_("This watch is assigned to another technician."), frappe.PermissionError)
	return order, item


def _item_tasks(order, item):
	return [task for task in order.all_tasks if str(task.repair_item_key) == str(item.idx)]


def _done(order):
	order.save()
	return {"repair_order": order.name, "order_status": order.status}


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

@frappe.whitelist()
def get_order_context(name: str):
	"""Everything the order page shows next to the order itself."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	if not can_access_repair_order(name):
		frappe.throw(_("Order not found"), frappe.DoesNotExistError)
	order = frappe.get_doc("DW Repair Order", name)
	desk = _is_desk()

	customer = None
	if order.customer:
		row = frappe.db.get_value(
			"Customer", order.customer, ["name", "customer_name", "mobile_no"], as_dict=True
		) or {}
		customer = {
			"name": order.customer,
			"customer_name": row.get("customer_name") or order.customer,
			"mobile": row.get("mobile_no") or "",
			"previous_orders": frappe.db.count(
				"DW Repair Order", {"customer": order.customer, "name": ["!=", order.name], "docstatus": ["<", 2]}
			),
		}
		if not desk:
			customer["mobile"] = ""

	part_codes = sorted({part.part for part in order.all_parts if part.part})
	parts = {}
	if part_codes:
		for row in frappe.get_all(
			"Item", filters={"name": ["in", part_codes]}, fields=["name", "item_name", "standard_rate", "stock_uom"]
		):
			parts[row.name] = row
		for row in frappe.db.sql(
			"SELECT item_code, SUM(actual_qty) AS qty FROM `tabBin` WHERE item_code IN %(codes)s GROUP BY item_code",
			{"codes": tuple(part_codes)},
			as_dict=True,
		):
			if row.item_code in parts:
				parts[row.item_code]["stock_qty"] = flt(row.qty)

	comments = frappe.get_all(
		"Comment",
		filters={
			"reference_doctype": "DW Repair Order",
			"reference_name": order.name,
			"comment_type": ["in", ["Comment", "Info"]],
		},
		fields=["content", "owner", "creation"],
		order_by="creation desc",
		limit_page_length=50,
	)
	users = {c.owner for c in comments} | {order.owner}
	full_names = dict(frappe.get_all("User", filters={"name": ["in", list(users)]}, fields=["name", "full_name"], as_list=True))
	activity = [
		{"text": frappe.utils.strip_html(c.content or ""), "by": full_names.get(c.owner) or c.owner, "at": c.creation}
		for c in comments
	]
	activity.append({
		"text": _("Order received, {0} watch(es)").format(len(order.items)),
		"by": full_names.get(order.owner) or order.owner,
		"at": order.creation,
	})

	quotations = []
	if desk:
		quotations = frappe.get_all(
			"Quotation",
			filters={"title": ["like", f"%{order.name}%"], "docstatus": ["<", 2]},
			fields=["name", "status", "grand_total", "transaction_date", "valid_till"],
			order_by="creation desc",
			limit_page_length=20,
		)
	quotation = None
	if order.quotation and desk:
		quotation = frappe.db.get_value(
			"Quotation", order.quotation,
			["name", "status", "grand_total", "transaction_date", "valid_till", "docstatus"], as_dict=True,
		)
	invoice = None
	if order.sales_invoice and desk:
		invoice = frappe.db.get_value(
			"Sales Invoice", order.sales_invoice,
			["name", "status", "grand_total", "outstanding_amount", "docstatus", "posting_date"], as_dict=True,
		)

	model_ids = sorted({item.watch_model for item in order.items if item.watch_model})
	models = dict(frappe.get_all(
		"DW Watch Model", filters={"name": ["in", model_ids]}, fields=["name", "model_name"], as_list=True
	)) if model_ids else {}

	return {
		"customer": customer,
		"models": models,
		"received_by": full_names.get(order.owner) or order.owner,
		"task_templates": frappe.get_all(
			"DW Task Template",
			fields=["name", "task_name", "default_rate"],
			limit_page_length=500,
			order_by="task_name asc",
		),
		"technicians": _technicians(),
		"parts": parts,
		"activity": activity,
		"last_message": _get_last_messages({order.name}).get(order.name) if desk else None,
		"whatsapp_enabled": bool(frappe.conf.get("whatsapp_enabled")) and desk,
		"quotation": quotation,
		"quotations": quotations,
		"invoice": invoice,
		"invoice_print_format": _invoice_print_format() if desk else None,
		"quotation_print_format": _quotation_print_format() if desk else None,
		"paid_amount": flt(order.paid_amount) if desk else 0,
		"invoiced_amount": flt(order.invoiced_amount) if desk else 0,
	}


def _invoice_print_format():
	from watch_doctor.invoice_settings import WORKFLOW_REPAIR_SERVICE, get_workflow_settings
	return get_workflow_settings(WORKFLOW_REPAIR_SERVICE).get("print_format") or "Standard"


def _quotation_print_format():
	for name in ("DW Watch Quotation", "Quotation"):
		if frappe.db.exists("Print Format", {"name": name, "disabled": 0}):
			return name
	return "Standard"


def _technicians():
	techs = frappe.get_all(
		"DW Technician", fields=["name", "technician_name"], limit_page_length=200, order_by="technician_name asc"
	)
	open_counts = dict(frappe.db.sql(
		"""
		SELECT i.technician, COUNT(*)
		FROM `tabDW Repair Item` i
		INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
		WHERE o.docstatus = 0 AND i.status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined')
		  AND IFNULL(i.technician, '') != ''
		GROUP BY i.technician
		"""
	))
	for tech in techs:
		tech["open_watches"] = cint(open_counts.get(tech.name))
	return techs


@frappe.whitelist()
def get_my_bench():
	"""Technician home (canvas M2): my open watches, plus what I finished today.

	Desk users without a technician record see every assigned watch, so the
	owner can look at the workshop the way the technicians do.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	tech_ids = get_current_technician_identifiers()
	if not tech_ids and not _is_desk():
		return {"technician": None, "open": [], "done_today": []}

	conditions = ["IFNULL(i.technician, '') != ''", "o.docstatus < 2"]
	values = {"today": nowdate()}
	if tech_ids:
		conditions.append("i.technician IN %(techs)s")
		values["techs"] = tuple(tech_ids)

	rows = frappe.db.sql(
		f"""
		SELECT
			i.name AS item_name, i.idx AS item_idx, i.watch_brand,
			COALESCE(m.model_name, i.watch_model) AS watch_model,
			i.serial_number, i.status AS watch_status, i.status_changed_on,
			i.awaiting_parts, i.parts_expected_date, i.parts_note,
			COALESCE(t.technician_name, i.technician) AS technician,
			o.name AS repair_order, o.reference_number, o.docstatus, o.priority,
			o.received_date, o.promised_delivery_date,
			c.customer_name
		FROM `tabDW Repair Item` i
		INNER JOIN `tabDW Repair Order` o ON o.name = i.parent AND i.parenttype = 'DW Repair Order'
		LEFT JOIN `tabCustomer` c ON c.name = o.customer
		LEFT JOIN `tabDW Watch Model` m ON m.name = i.watch_model
		LEFT JOIN `tabDW Technician` t ON t.name = i.technician
		WHERE {' AND '.join(conditions)}
		  AND (
			(o.docstatus = 0 AND i.status NOT IN ('Delivered', 'Completed', 'Not Repairable', 'Declined'))
			OR (i.status IN ('Completed', 'Not Repairable', 'Declined', 'Delivered') AND DATE(i.status_changed_on) = %(today)s)
		  )
		ORDER BY o.promised_delivery_date IS NULL, o.promised_delivery_date ASC, o.name ASC, i.idx ASC
		LIMIT 500
		""",
		values,
		as_dict=True,
	)

	task_counts = {}
	if rows:
		for row in frappe.db.sql(
			"""
			SELECT parent, repair_item_key, COUNT(*) AS total, SUM(status = 'Completed') AS done
			FROM `tabDW Repair Task`
			WHERE parenttype = 'DW Repair Order' AND parent IN %(orders)s
			GROUP BY parent, repair_item_key
			""",
			{"orders": tuple({r.repair_order for r in rows})},
			as_dict=True,
		):
			task_counts[(row.parent, str(row.repair_item_key))] = (cint(row.total), cint(row.done))

	today = getdate(nowdate())
	open_rows, done_rows = [], []
	for row in rows:
		row.tasks_total, row.tasks_done = task_counts.get((row.repair_order, str(row.item_idx)), (0, 0))
		row.awaiting_parts = bool(cint(row.awaiting_parts))
		row.overdue_days = (
			max((today - getdate(row.promised_delivery_date)).days, 0) if row.promised_delivery_date else 0
		)
		row.stage = "collected" if row.docstatus == 1 else ui_stage_of(row.watch_status)
		(done_rows if row.stage in ("ready", "return", "collected") else open_rows).append(row)

	technician = None
	if tech_ids:
		technician = frappe.db.get_value("DW Technician", tech_ids[0], "technician_name") or tech_ids[0]
	return {"technician": technician, "open": open_rows, "done_today": done_rows}


# ---------------------------------------------------------------------------
# Narrow edits
# ---------------------------------------------------------------------------

@frappe.whitelist()
def assign_technician(item_name: str, technician: str = ""):
	order, item = _load_watch(item_name, technician_may_edit=False)
	technician = (technician or "").strip()
	if technician and not frappe.db.exists("DW Technician", technician):
		frappe.throw(_("Technician not found"))
	if (item.technician or "") == technician:
		return {"repair_order": order.name, "order_status": order.status}
	item.technician = technician or None
	for task in _item_tasks(order, item):
		if task.status != "Completed":
			task.technician = technician or None
	result = _done(order)
	name = frappe.db.get_value("DW Technician", technician, "technician_name") if technician else None
	log_watch_activity(order, item, _("Assigned to {0}").format(name) if name else _("Technician removed"))
	return result


@frappe.whitelist()
def add_task(item_name: str, service: str):
	order, item = _load_watch(item_name)
	if not frappe.db.exists("DW Task Template", service):
		frappe.throw(_("Task not found"))
	if any(task.service == service for task in _item_tasks(order, item)):
		frappe.throw(_("This watch already has that task."))
	order.append("all_tasks", {
		"repair_item_key": str(item.idx),
		"service": service,
		"technician": item.technician,
		"status": "Pending",
		"is_manual": 1,
	})
	return _done(order)


@frappe.whitelist()
def set_task_status(item_name: str, service: str, status: str):
	"""Tick or untick a task. Ticking the last one moves the watch to Ready."""
	order, item = _load_watch(item_name)
	if status not in TASK_STATUSES:
		frappe.throw(_("Unknown task status"))
	task = next((t for t in _item_tasks(order, item) if t.service == service), None)
	if not task:
		frappe.throw(_("Task not found"))
	task.status = status
	return _done(order)


@frappe.whitelist()
def remove_task(item_name: str, service: str):
	"""Remove a task added by hand. Suggested tasks follow the diagnosis instead."""
	order, item = _load_watch(item_name, technician_may_edit=False)
	task = next((t for t in _item_tasks(order, item) if t.service == service), None)
	if not task:
		frappe.throw(_("Task not found"))
	if not cint(task.is_manual):
		frappe.throw(_("This task comes from the diagnosis. Change the work needed instead."))
	if task.status != "Pending":
		frappe.throw(_("Only a task that has not started can be removed."))
	order.set("all_tasks", [t for t in order.all_tasks if t is not task])
	return _done(order)


@frappe.whitelist()
def add_part(item_name: str, part: str, quantity: float = 1, task: str = ""):
	order, item = _load_watch(item_name)
	quantity = flt(quantity)
	if quantity <= 0:
		frappe.throw(_("Enter a quantity above zero."))
	row = frappe.db.get_value("Item", part, ["name", "item_name", "stock_uom", "disabled"], as_dict=True)
	if not row or cint(row.disabled):
		frappe.throw(_("Part not found"))
	task_name = None
	if task:
		match = next((t for t in _item_tasks(order, item) if t.service == task or t.name == task), None)
		task_name = match.name if match else None
	order.append("all_parts", {
		"repair_item_key": str(item.idx),
		"part": row.name,
		"item_code": row.name,
		"item_name": row.item_name,
		"uom": row.stock_uom,
		"quantity": quantity,
		"task": task_name,
	})
	return _done(order)


@frappe.whitelist()
def remove_part(item_name: str, part_row: str):
	order, item = _load_watch(item_name)
	key = str(item.idx)
	kept = [p for p in order.all_parts if not (p.name == part_row and str(p.repair_item_key) == key)]
	if len(kept) == len(order.all_parts):
		frappe.throw(_("Part not found"))
	order.set("all_parts", kept)
	return _done(order)


@frappe.whitelist()
def set_awaiting_parts(item_name: str, waiting: int = 1, expected_date: str | None = None, note: str | None = None):
	"""Hold or release a watch for a part. Technicians can flag it without a
	date ("need a part"); the desk adds the date when the supplier gives one."""
	order, item = _load_watch(item_name)
	waiting = cint(waiting)
	if waiting:
		if ui_stage_of(item.status) in ("ready", "return", "collected"):
			frappe.throw(_("This watch is finished; it is not waiting for anything."))
		item.awaiting_parts = 1
		item.parts_expected_date = getdate(expected_date) if expected_date else None
		item.parts_note = (note or "").strip()[:140] or None
		text = _("Waiting for a part")
		if item.parts_note:
			text += f" ({item.parts_note})"
		if item.parts_expected_date:
			text += " · " + _("expected {0}").format(frappe.utils.formatdate(item.parts_expected_date, "d MMM"))
	else:
		item.awaiting_parts = 0
		text = _("Part arrived")
	result = _done(order)
	log_watch_activity(order, item, text)
	return result


@frappe.whitelist()
def set_internal_note(item_name: str, note: str = ""):
	order, item = _load_watch(item_name)
	item.internal_note = (note or "").strip()
	return _done(order)


@frappe.whitelist()
def set_watch_issues(item_name: str, issues: str | list = "[]"):
	"""Replace what the customer says is wrong with this watch (complaint chips).

	Each entry is an issue template name, or {"issue": "Other", "other_description": "..."}.
	"""
	order, item = _load_watch(item_name, technician_may_edit=False)
	entries = json.loads(issues) if isinstance(issues, str) else (issues or [])
	key = str(item.idx)
	rows = []
	for entry in entries:
		if isinstance(entry, str):
			entry = {"issue": entry}
		raw = str(entry.get("issue") or "").strip()
		description = str(entry.get("other_description") or "").strip()[:140]
		if raw.lower() == "other" or (not raw and description):
			rows.append({"repair_item_key": key, "issue": ensure_other_issue_template(), "is_other": 1, "other_description": description})
			continue
		name = resolve_issue_template_name(raw)
		if name and not any(r["issue"] == name and not r.get("is_other") for r in rows):
			rows.append({"repair_item_key": key, "issue": name, "is_other": 0})
	order.set("all_issues", [i for i in order.all_issues if str(i.repair_item_key) != key])
	for row in rows:
		order.append("all_issues", row)
	return _done(order)


@frappe.whitelist()
def update_order_details(
	name: str,
	promised_delivery_date: str | None = None,
	priority: str | None = None,
	reference_number: str | None = None,
	customer: str | None = None,
	received_date: str | None = None,
):
	"""Order-level edits on the order page: dates, priority, bag tag, customer."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	order = frappe.get_doc("DW Repair Order", name)
	if order.docstatus != 0:
		frappe.throw(_("This order is closed."))
	if promised_delivery_date is not None:
		order.promised_delivery_date = getdate(promised_delivery_date) if promised_delivery_date else None
	if priority is not None:
		if priority not in PRIORITIES:
			frappe.throw(_("Unknown priority"))
		order.priority = priority
	if reference_number is not None:
		order.reference_number = reference_number.strip()[:60] or None
	if customer:
		if not frappe.db.exists("Customer", customer):
			frappe.throw(_("Customer not found"))
		order.customer = customer
	if received_date:
		order.received_date = getdate(received_date)
	return _done(order)


# ---------------------------------------------------------------------------
# Prices (estimate screen, D5)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def set_task_rate(item_name: str, service: str, rate: float | None = None):
	"""Set a task's price for this watch. An empty rate goes back to the template price."""
	order, item = _load_watch(item_name, technician_may_edit=False)
	task = next((t for t in _item_tasks(order, item) if t.service == service), None)
	if not task:
		frappe.throw(_("Task not found"))
	if rate in (None, ""):
		task.rate = None
		task.price_manually_set = 0
	else:
		rate = flt(rate)
		if rate < 0:
			frappe.throw(_("A price cannot be negative."))
		task.rate = rate
		task.price_manually_set = 1
	return _done(order)


@frappe.whitelist()
def set_part_line(item_name: str, part_row: str, rate: float | None = None, quantity: float | None = None):
	"""Change a part's price or quantity on this watch."""
	order, item = _load_watch(item_name, technician_may_edit=False)
	part = next((p for p in order.all_parts if p.name == part_row and str(p.repair_item_key) == str(item.idx)), None)
	if not part:
		frappe.throw(_("Part not found"))
	if quantity not in (None, ""):
		if flt(quantity) <= 0:
			frappe.throw(_("Enter a quantity above zero."))
		part.quantity = flt(quantity)
	if rate is not None:
		if rate == "":
			part.rate = None
			part.price_manually_set = 0
		else:
			if flt(rate) < 0:
				frappe.throw(_("A price cannot be negative."))
			part.rate = flt(rate)
			part.price_manually_set = 1
	return _done(order)


@frappe.whitelist()
def create_estimate(name: str, item_names: str | list, quotation_type: str = "Estimate", valid_till: str = "", note: str = ""):
	"""Make the quotation for the chosen watches (spec B5.2, D5).

	The watch moves to "Waiting customer" when the desk sends it or says it
	was told another way, not here, so an estimate made but never sent still
	shows as "Estimate to send".
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import create_quotation

	names = json.loads(item_names) if isinstance(item_names, str) else (item_names or [])
	order = frappe.get_doc("DW Repair Order", name)
	if order.docstatus != 0:
		frappe.throw(_("This order is closed."))
	if not names:
		frappe.throw(_("Choose at least one watch for the estimate."))
	unknown = set(names) - {i.name for i in order.items}
	if unknown:
		frappe.throw(_("A chosen watch is not on this order. Reload and try again."))
	if quotation_type not in ("Estimate", "Final"):
		frappe.throw(_("Unknown estimate type"))

	quotation = create_quotation(order.name, quotation_type, item_names=names, valid_till=valid_till or None, note=note)
	total = frappe.db.get_value("Quotation", quotation, "grand_total")
	labels = ", ".join(_watch_label(i) for i in order.items if i.name in names)
	order.add_comment("Info", _("Estimate {0} made for {1}: {2}").format(
		quotation, labels, frappe.utils.fmt_money(total, currency=frappe.db.get_value("Quotation", quotation, "currency"))
	))
	return {"quotation": quotation, "grand_total": total}


def _watch_label(item):
	from watch_doctor.api.tracker import watch_label
	return watch_label(item)


# ---------------------------------------------------------------------------
# Collect & invoice (D6)
# ---------------------------------------------------------------------------

@frappe.whitelist()
def collect_watches(
	name: str,
	item_names: str | list,
	discount: float = 0,
	payments_json: str = "",
	is_credit_sale: int = 0,
	due_date: str = "",
	invoice_note: str = "",
	payment_mode: str = "",
):
	"""Invoice and take payment for exactly the watches handed over (spec B5.1, B5.3).

	One payment mode: pass `payment_mode` and leave `payments_json` empty; the
	payment is the invoice's exact grand total (VAT included). Split: pass
	`payments_json` rows that add up to that total (see preview_collect).

	The invoice is built from the chosen watches' current tasks and parts,
	never from the order's quotation total, and only those watches become
	Collected. Creating and finalising happen in one request, so a failure
	(stock, accounting) leaves no draft invoice behind.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
		create_sales_invoice,
		finalize_invoice,
	)

	names = json.loads(item_names) if isinstance(item_names, str) else (item_names or [])
	order = frappe.get_doc("DW Repair Order", name)
	if order.docstatus != 0:
		frappe.throw(_("This order is closed."))
	if not names:
		frappe.throw(_("Choose the watches being collected."))
	chosen = [i for i in order.items if i.name in names]
	if len(chosen) != len(set(names)):
		frappe.throw(_("A chosen watch is not on this order. Reload and try again."))
	not_ready = [i for i in chosen if i.status != "Completed"]
	if not_ready:
		frappe.throw(_("{0} is not ready yet.").format(_watch_label(not_ready[0])))

	discount = flt(discount)
	if discount < 0:
		frappe.throw(_("A discount cannot be negative."))

	draft = create_sales_invoice(order.name, source_type="order", payment_type="full", item_indices=names)
	if discount > flt(draft["invoice_amount"]):
		frappe.throw(_("The discount is more than the invoice."))

	result = finalize_invoice(
		order.name,
		draft["invoice_name"],
		discount=discount,
		payment_mode=payment_mode or "Cash",
		payments_json=payments_json or None,
		is_credit_sale=cint(is_credit_sale),
		due_date=due_date,
		mark_as_delivered=True,
		invoice_note=invoice_note,
	)

	order.reload()
	text = _("Collected {0}: invoice {1}, {2}").format(
		", ".join(_watch_label(i) for i in chosen),
		result["invoice_name"],
		frappe.utils.fmt_money(result["invoice_total"]),
	)
	text += " · " + (_("on credit") if cint(is_credit_sale) else _("paid"))
	order.add_comment("Info", text)
	frappe.db.commit()

	return {
		"invoice_name": result["invoice_name"],
		"invoice_total": result["invoice_total"],
		"outstanding_amount": result["outstanding_amount"],
		"is_credit_sale": cint(is_credit_sale),
		"order_closed": order.docstatus == 1,
		"print_format": draft.get("print_format") or "Standard",
	}


@frappe.whitelist()
def preview_collect(name: str, item_names: str | list, discount: float = 0):
	"""The invoice totals collect_watches would produce, without keeping anything.

	Builds the real draft invoice (so taxes and rounding come from ERPNext,
	not the browser) inside a savepoint and rolls it back.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import create_sales_invoice

	names = json.loads(item_names) if isinstance(item_names, str) else (item_names or [])
	if not names:
		return {"net_total": 0, "taxes": 0, "discount": 0, "grand_total": 0}
	frappe.db.savepoint("dw_preview_collect")
	try:
		draft = create_sales_invoice(name, source_type="order", payment_type="full", item_indices=names)
		invoice = frappe.get_doc("Sales Invoice", draft["invoice_name"])
		if flt(discount) > 0:
			invoice.discount_amount = flt(discount)
			invoice.calculate_taxes_and_totals()
		totals = {
			"net_total": flt(invoice.total),
			"taxes": flt(invoice.total_taxes_and_charges),
			"discount": flt(invoice.discount_amount),
			"grand_total": flt(invoice.rounded_total or invoice.grand_total),
		}
	finally:
		frappe.db.rollback(save_point="dw_preview_collect")
		frappe.local.message_log = []
	return totals


# ---------------------------------------------------------------------------
# Watch details (replaces the old edit form)
# ---------------------------------------------------------------------------

WATCH_DETAIL_FIELDS = ("watch_brand", "watch_model", "serial_number", "case_type", "strap_bracelet", "watch_type", "dial")


def _apply_watch_fields(item, fields):
	for key in WATCH_DETAIL_FIELDS:
		if key in fields:
			item.set(key, (fields.get(key) or "").strip() if isinstance(fields.get(key), str) else fields.get(key))
	if "pre_existing_condition" in fields:
		item.pre_existing_condition = json.dumps([str(c).strip() for c in (fields.get("pre_existing_condition") or []) if str(c).strip()])
	if not item.watch_brand:
		frappe.throw(_("Choose the brand."))
	if not item.watch_model or not frappe.db.exists("DW Watch Model", item.watch_model):
		frappe.throw(_("Choose the model from the list, or add it."))


@frappe.whitelist()
def update_watch_details(item_name: str, fields: str | dict = "{}"):
	order, item = _load_watch(item_name, technician_may_edit=False)
	_apply_watch_fields(item, json.loads(fields) if isinstance(fields, str) else (fields or {}))
	return _done(order)


@frappe.whitelist()
def add_watch(name: str, fields: str | dict = "{}"):
	"""Another watch handed in on an existing order."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	order = frappe.get_doc("DW Repair Order", name)
	if order.docstatus != 0:
		frappe.throw(_("This order is closed."))
	item = order.append("items", {"status": "Pending"})
	_apply_watch_fields(item, json.loads(fields) if isinstance(fields, str) else (fields or {}))
	result = _done(order)
	log_watch_activity(order, item, _("Added to the order"))
	return result
