"""Patch existing draft repair orders onto the merged watch workflow statuses."""

import frappe


def execute():
	from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import DWRepairOrder
	has_diagnosis_status_column = frappe.db.has_column("DW Repair Item", "diagnosis_status")

	order_names = frappe.get_all("DW Repair Order", filters={"docstatus": 0}, pluck="name")
	for order_name in order_names:
		order = frappe.get_doc("DW Repair Order", order_name)
		status_before = order.status
		item_states_before = [
			(str(item.name), str(item.status or ""), str(getattr(item, "diagnosis_status", "") or ""))
			for item in (order.items or [])
		]

		DWRepairOrder.update_item_statuses_from_workflow(order)
		order.update_order_status_from_items()

		item_states_after = [
			(str(item.name), str(item.status or ""), str(getattr(item, "diagnosis_status", "") or ""))
			for item in (order.items or [])
		]
		if status_before == order.status and item_states_before == item_states_after:
			continue

		for item in (order.items or []):
			item_values = {
				"status": item.status or "",
			}
			if has_diagnosis_status_column:
				item_values["diagnosis_status"] = getattr(item, "diagnosis_status", "") or ""

			frappe.db.set_value(
				"DW Repair Item",
				item.name,
				item_values,
				update_modified=False,
			)

		frappe.db.set_value(
			"DW Repair Order",
			order.name,
			"status",
			order.status,
			update_modified=False,
		)

	frappe.db.commit()