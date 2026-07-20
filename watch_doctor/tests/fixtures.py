"""Shared DB fixture builders for watch_doctor's FrappeTestCase-based tests.

Every helper creates a minimal, valid doc and returns its name (or names).
Callers are responsible for wrapping the calling test in a FrappeTestCase so
the whole class transaction gets rolled back — nothing here commits.
"""

import random

import frappe


def unique_suffix(length=6):
	return frappe.generate_hash(length=length)


def unique_digits(length=8):
	return "".join(random.choices("0123456789", k=length))


def make_customer(name_hint="Test Customer"):
	suffix = unique_suffix()
	customer_group = frappe.db.get_value("Customer Group", {}, "name") or "All Customer Groups"
	territory = frappe.db.get_value("Territory", {}, "name") or "All Territories"
	customer = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": f"{name_hint} {suffix}",
		"customer_type": "Individual",
		"customer_group": customer_group,
		"territory": territory,
		"mobile_no": f"3{unique_digits(7)}",
	})
	customer.insert(ignore_permissions=True)
	return customer.name


def make_brand_model():
	suffix = unique_suffix()
	brand = frappe.get_doc({"doctype": "DW Watch Brand", "brand_name": f"Test Brand {suffix}"})
	brand.insert(ignore_permissions=True)
	model = frappe.get_doc({
		"doctype": "DW Watch Model",
		"brand": brand.name,
		"model_name": f"Test Model {suffix}",
	})
	model.insert(ignore_permissions=True)
	return brand.name, model.name


def make_task_template(task_name=None, default_rate=10):
	task_name = task_name or f"Test Task {unique_suffix()}"
	doc = frappe.get_doc({
		"doctype": "DW Task Template",
		"task_name": task_name,
		"default_rate": default_rate,
	})
	doc.insert(ignore_permissions=True)
	return doc.name, task_name


def make_issue_template(issue_name=None, suggested_task=None):
	issue_name = issue_name or f"Test Issue {unique_suffix()}"
	doc = frappe.get_doc({
		"doctype": "DW Issue Template",
		"issue_name": issue_name,
		"suggested_task": suggested_task,
		"is_active": 1,
	})
	doc.insert(ignore_permissions=True)
	return doc.name


def make_technician(create_user=False, technician_name=None):
	"""Create a DW Technician, optionally backed by a real User with the DW Technician role.

	Returns (technician_name_field_value_used_for_item_assignment, user_email_or_None).
	The value used to assign `DW Repair Item.technician` is the DW Technician doc's
	own `name` (its docname), which is what get_current_technician_identifiers
	resolves back to for a linked user.
	"""
	suffix = unique_suffix()
	technician_name = technician_name or f"Test Tech {suffix}"
	email = None
	if create_user:
		email = f"tech.{suffix}@example.com"
		user = frappe.get_doc({
			"doctype": "User",
			"email": email,
			"first_name": technician_name,
			"send_welcome_email": 0,
		})
		user.insert(ignore_permissions=True)
		user.add_roles("DW Technician")

	doc = frappe.get_doc({
		"doctype": "DW Technician",
		"technician_name": technician_name,
		"user": email,
		"email": email,
	})
	doc.insert(ignore_permissions=True)
	return doc.name, email
