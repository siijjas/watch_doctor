# Copyright (c) 2025, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate

from watch_doctor.invoice_settings import (
	WORKFLOW_REPAIR_SERVICE,
	apply_workflow_naming_series,
	get_workflow_settings,
)
from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles


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


def _normalize_string_list(value):
	if not value:
		return []
	if isinstance(value, list):
		return [str(entry).strip() for entry in value if str(entry).strip()]
	if isinstance(value, str):
		value = value.strip()
		if not value:
			return []
		if value.startswith("[") and value.endswith("]"):
			try:
				import json

				parsed = json.loads(value)
				if isinstance(parsed, list):
					return [str(entry).strip() for entry in parsed if str(entry).strip()]
			except Exception:
				pass
		return [value]
	return [str(value).strip()]


def has_repair_item_diagnosis_content(item):
	return any([
		_normalize_string_list(getattr(item, "diagnosis_summary", None)),
		_normalize_string_list(getattr(item, "movement_type", None)),
		_normalize_string_list(getattr(item, "movement_caliber", None)),
		_normalize_string_list(getattr(item, "recommended_work", None)),
	])


def resolve_repair_item_status(current_status=None, diagnosis_status=None, technician=None, recommended_work=None, task_statuses=None):
	status = normalize_repair_item_status(current_status)
	diagnosis_status = normalize_diagnosis_status(diagnosis_status)
	task_statuses = [str(task_status).strip() for task_status in (task_statuses or []) if str(task_status).strip()]
	has_recommended_work = bool(_normalize_string_list(recommended_work))
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
	if diagnosis_mapped_status in {WATCH_STATUS_NOT_REPAIRABLE, WATCH_STATUS_DECLINED, WATCH_STATUS_QUOTED, WATCH_STATUS_APPROVAL_FOR_ESTIMATE}:
		return diagnosis_mapped_status

	if status in MANUAL_ITEM_STATUSES:
		return status

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
		if not self.promised_delivery_date and self.received_date:
			self.promised_delivery_date = add_days(self.received_date, 7)
		
		# Get the status from database (before any changes)
		db_status = None
		if not self.is_new():
			db_status = frappe.db.get_value("DW Repair Order", self.name, "status")
		
		# Store current status before auto-updates
		status_before_auto_update = self.status
		
		# Auto-update item and diagnosis statuses from the merged workflow.
		self.update_item_statuses_from_workflow()
		
		# Auto-update order status based on item statuses
		self.update_order_status_from_items()
		
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
		# Check all items are Completed or Delivered
		for item in self.items:
			if normalize_repair_item_status(item.status) not in [WATCH_STATUS_COMPLETED, WATCH_STATUS_DELIVERED]:
				frappe.throw(
					_("Cannot submit: Item '{0}' is still in '{1}' status. All items must be Completed or Delivered.").format(
						f"{item.watch_brand} {item.watch_model}", item.status
					)
				)
		
		# Check invoice exists
		if not self.sales_invoice:
			frappe.throw(_("Cannot submit: A Sales Invoice must be created before delivering the order."))
	
	def on_submit(self):
		"""Actions to perform when the repair order is submitted."""
		# Use db_set to update fields after submit (since doc is already saved)
		self.db_set('status', 'Delivered', update_modified=False)
		self.db_set('delivery_date', getdate(), update_modified=False)
		
		# Update all items to Delivered
		for item in self.items:
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
		
		# All items Delivered → Delivered (but this requires submit)
		if all(s == WATCH_STATUS_DELIVERED for s in item_statuses):
			return "Repaired"  # Will become Delivered on submit
		
		# All items Completed/Delivered → Repaired
		if all(s in {WATCH_STATUS_COMPLETED, WATCH_STATUS_DELIVERED} for s in item_statuses):
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
		} for s in item_statuses):
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
	
	# Add ONE item per watch (total cost; recommended_work as description)
	total_amount = 0

	# Ensure we have a generic service item for tasks
	service_item_code = get_or_create_service_item()

	for item in selected_items:
		# Get tasks and parts for this watch
		item_key = str(item.idx)
		item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
		item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

		model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
		watch_item_name = f"Repair - {item.watch_brand} {model_name}"

		# Calculate total cost for this watch
		tasks_cost = 0
		for task in item_tasks:
			task_template = frappe.get_doc("DW Task Template", task.service)
			tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

		parts_cost = 0
		for part in item_parts:
			item_doc = frappe.get_doc("Item", part.part)
			parts_cost += (part.rate if part.rate else (item_doc.standard_rate or 0)) * part.quantity

		watch_total = tasks_cost + parts_cost

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

		# One quotation item per watch
		quotation_item = quotation.append("items", {})
		quotation_item.item_code = service_item_code
		quotation_item.item_name = watch_item_name
		quotation_item.description = desc_lines or watch_item_name
		quotation_item.qty = 1
		quotation_item.rate = watch_total
		quotation_item.uom = "Nos"

		total_amount += watch_total
	
	# Save quotation
	quotation.insert(ignore_permissions=True)
	
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
def create_sales_invoice(repair_order_name, source_type="quotation", payment_type="full", amount=None):
	"""
	Create a sales invoice from a repair order.
	
	Args:
		repair_order_name: Name of the repair order
		source_type: "quotation" or "order" - source for invoice items
		payment_type: "full", "advance", or "balance" - type of payment
		amount: Amount for partial payment (required for advance/balance)
	
	Returns:
		Name of the created sales invoice
	"""
	import json
	
	# Convert amount to float if it's a string
	if amount:
		if isinstance(amount, str):
			amount = float(amount)
	
	# Fetch the repair order
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	
	# Create sales invoice as POS invoice for payment tracking
	invoice = frappe.new_doc("Sales Invoice")
	invoice.customer = repair_order.customer
	invoice.posting_date = frappe.utils.nowdate()
	invoice.due_date = frappe.utils.add_days(None, 30)  # Net 30 payment terms
	invoice.is_pos = 1  # Mark as POS invoice to enable payment tracking
	apply_workflow_naming_series(invoice, WORKFLOW_REPAIR_SERVICE)
	
	# Determine source of items
	if source_type == "quotation" and repair_order.quotation:
		# Create from quotation
		quotation = frappe.get_doc("Quotation", repair_order.quotation)
		
		# Add all items from quotation
		for q_item in quotation.items:
			invoice_item = invoice.append("items", {})
			invoice_item.item_code = q_item.item_code
			invoice_item.item_name = q_item.item_name
			invoice_item.description = q_item.description
			invoice_item.qty = q_item.qty
			invoice_item.rate = q_item.rate
			invoice_item.uom = q_item.uom
		
		total_amount = quotation.grand_total
	else:
		# Create directly from repair order – ONE item per watch
		total_amount = 0

		# Ensure we have a generic service item for tasks
		service_item_code = get_or_create_service_item()

		for item in repair_order.items:
			model_name = frappe.db.get_value("DW Watch Model", item.watch_model, "model_name") or item.watch_model
			watch_item_name = f"Repair - {item.watch_brand} {model_name}"

			# Get tasks and parts for this watch
			item_key = str(item.idx)
			item_tasks = [task for task in repair_order.all_tasks if task.repair_item_key == item_key]
			item_parts = [part for part in repair_order.all_parts if part.repair_item_key == item_key]

			# Calculate total cost for this watch
			tasks_cost = 0
			for task in item_tasks:
				task_template = frappe.get_doc("DW Task Template", task.service)
				tasks_cost += task.rate if task.rate else (task_template.default_rate or 0)

			parts_cost = 0
			for part in item_parts:
				item_doc = frappe.get_doc("Item", part.part)
				parts_cost += (part.rate if part.rate else (item_doc.standard_rate or 0)) * part.quantity

			watch_total = tasks_cost + parts_cost

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

			invoice_item = invoice.append("items", {})
			invoice_item.item_code = service_item_code
			invoice_item.item_name = watch_item_name
			invoice_item.description = desc_lines or watch_item_name
			invoice_item.qty = 1
			invoice_item.rate = watch_total
			invoice_item.uom = "Nos"

			total_amount += watch_total
	
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
	
	# Apply discount if any
	if discount > 0:
		invoice.discount_amount = discount
		invoice.save(ignore_permissions=True)
		invoice.reload()
	
	# Add payment mode entry if this is a POS invoice
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
		invoice.submit()
	
	# Get repair order
	repair_order = frappe.get_doc("DW Repair Order", repair_order_name)
	repair_order.flags.ignore_permissions = True
	
	# Update invoiced amount
	repair_order.db_set('invoiced_amount', invoice.grand_total, update_modified=False)
	
	# Update paid amount based on payment mode TYPE
	if mode_of_payment_doc.type in ['Cash', 'Bank']:
		# Immediate payment - mark as paid
		repair_order.db_set('paid_amount', invoice.grand_total, update_modified=False)
		repair_order.db_set('balance_amount', 0, update_modified=False)
	else:
		# Credit (Pay Later) - balance remains
		repair_order.db_set('paid_amount', 0, update_modified=False)
		repair_order.db_set('balance_amount', invoice.grand_total, update_modified=False)
	
	# Mark as delivered if requested
	if mark_as_delivered:
		# Submit the repair order
		repair_order.reload()
		repair_order.flags.ignore_permissions = True
		if repair_order.docstatus == 0:
			repair_order.submit()
			frappe.msgprint(_("Repair order marked as Delivered"))
	
	frappe.db.commit()
	
	return {
		"success": True,
		"invoice_name": invoice.name,
		"invoice_total": invoice.grand_total,
		"discount_applied": discount,
		"payment_mode": payment_mode,
		"order_delivered": mark_as_delivered
	}
