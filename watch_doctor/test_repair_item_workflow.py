import unittest

from watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order import (
	resolve_repair_item_diagnosis_status,
	resolve_repair_item_status,
)


class RepairItemWorkflowTests(unittest.TestCase):
	def test_assigned_watch_moves_to_under_diagnosis(self):
		self.assertEqual(
			resolve_repair_item_status(current_status="Pending", technician="TECH-001"),
			"Under Diagnosis",
		)

	def test_recommended_work_moves_watch_to_diagnosed(self):
		self.assertEqual(
			resolve_repair_item_status(
				current_status="Under Diagnosis",
				technician="TECH-001",
				recommended_work=["Complete service"],
			),
			"Diagnosed",
		)

	def test_awaiting_approval_maps_to_create_estimate(self):
		self.assertEqual(
			resolve_repair_item_status(
				current_status="Diagnosed",
				diagnosis_status="Awaiting Approval",
				technician="TECH-001",
			),
			"Create Estimate",
		)

	def test_quoted_and_repair_completion_flow(self):
		self.assertEqual(
			resolve_repair_item_status(
				current_status="Quoted",
				diagnosis_status="Quoted",
				technician="TECH-001",
			),
			"Quoted",
		)
		self.assertEqual(
			resolve_repair_item_status(
				current_status="In Repair",
				task_statuses=["Completed", "Completed"],
			),
			"Completed",
		)

	def test_item_status_backfills_compatible_diagnosis_status(self):
		self.assertEqual(
			resolve_repair_item_diagnosis_status(
				"Create Estimate",
				current_diagnosis_status="Diagnosed",
				has_diagnosis_content=True,
			),
			"Awaiting Approval",
		)
		self.assertEqual(
			resolve_repair_item_diagnosis_status(
				"In Repair",
				current_diagnosis_status="Quoted",
				has_diagnosis_content=True,
			),
			"Quoted",
		)


if __name__ == "__main__":
	unittest.main()