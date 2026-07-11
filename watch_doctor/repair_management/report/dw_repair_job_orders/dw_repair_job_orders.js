frappe.query_reports["DW Repair Job Orders"] = {
	filters: [
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: [
				"",
				"Pending",
				"Under Diagnosis",
				"Diagnosed",
				"Create Estimate",
				"Quoted",
				"In Repair",
				"Completed",
				"Not Repairable",
				"Declined",
				"Delivered",
			],
		},
		{
			fieldname: "priority",
			label: __("Priority"),
			fieldtype: "Select",
			options: ["", "Normal", "Urgent", "VIP"],
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
		},
		{
			fieldname: "watch_brand",
			label: __("Watch Brand"),
			fieldtype: "Link",
			options: "DW Watch Brand",
		},
		{
			fieldname: "technician",
			label: __("Technician"),
			fieldtype: "Link",
			options: "DW Technician",
		},
		{
			fieldname: "from_received_date",
			label: __("From Received Date"),
			fieldtype: "Date",
		},
		{
			fieldname: "to_received_date",
			label: __("To Received Date"),
			fieldtype: "Date",
		},
	],
};
