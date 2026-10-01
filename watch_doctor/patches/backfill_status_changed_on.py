"""Backfill status_changed_on on repair orders and watches.

The Order Tracker shows "days in stage" from this field. For existing data
the last status change is recovered from the Version history (track_changes
is on for DW Repair Order); rows with no recorded change fall back to the
delivery / received / creation date.
"""

import json

import frappe


def execute():
	# patches.txt has no [post_model_sync] section, so the new columns do not
	# exist yet when this runs during migrate.
	frappe.reload_doc("repair_management", "doctype", "dw_repair_item")
	frappe.reload_doc("repair_management", "doctype", "dw_repair_order")

	order_changed_on = {}
	item_changed_on = {}

	versions = frappe.db.sql(
		"""
		SELECT docname, creation, data
		FROM `tabVersion`
		WHERE ref_doctype = 'DW Repair Order'
		ORDER BY creation DESC
		""",
		as_dict=True,
	)
	for version in versions:
		try:
			data = json.loads(version.data or "{}")
		except ValueError:
			continue

		# Newest first: the first hit per order / watch is its latest change.
		if version.docname not in order_changed_on and _has_status_change(data.get("changed")):
			order_changed_on[version.docname] = version.creation

		for row_change in data.get("row_changed") or []:
			if len(row_change) < 4 or row_change[0] != "items":
				continue
			item_name = row_change[2]
			if item_name not in item_changed_on and _has_status_change(row_change[3]):
				item_changed_on[item_name] = version.creation

	orders = frappe.db.sql(
		"""
		SELECT name, status, creation, received_date, delivery_date
		FROM `tabDW Repair Order`
		WHERE status_changed_on IS NULL
		""",
		as_dict=True,
	)
	order_fallback = {}
	for order in orders:
		fallback = order.received_date or order.creation
		if order.status == "Delivered" and order.delivery_date:
			fallback = order.delivery_date
		order_fallback[order.name] = fallback
		frappe.db.set_value(
			"DW Repair Order",
			order.name,
			"status_changed_on",
			order_changed_on.get(order.name) or fallback,
			update_modified=False,
		)

	items = frappe.db.sql(
		"""
		SELECT name, parent, creation
		FROM `tabDW Repair Item`
		WHERE status_changed_on IS NULL AND parenttype = 'DW Repair Order'
		""",
		as_dict=True,
	)
	for item in items:
		frappe.db.set_value(
			"DW Repair Item",
			item.name,
			"status_changed_on",
			item_changed_on.get(item.name)
			or order_changed_on.get(item.parent)
			or order_fallback.get(item.parent)
			or item.creation,
			update_modified=False,
		)

	frappe.db.commit()


def _has_status_change(changes):
	return any(change and change[0] == "status" for change in (changes or []))
