frappe.query_reports["DW Create Estimate Queue"] = {
	filters: [
		{
			fieldname: "priority",
			label: __("Priority"),
			fieldtype: "Select",
			options: ["", "Normal", "Urgent", "VIP"],
		},
		{
			fieldname: "technician",
			label: __("Technician"),
			fieldtype: "Link",
			options: "DW Technician",
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
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
		{
			fieldname: "only_without_estimate",
			label: __("Only Without Estimate Amount"),
			fieldtype: "Check",
			default: 0,
		},
	],
};
