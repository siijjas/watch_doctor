from frappe import _


def get_data():
	return [
		{
			"module_name": "Repair Management",
			"category": "Modules",
			"label": _("Repair Management"),
			"color": "blue",
			"icon": "octicon octicon-tools",
			"type": "module",
			"description": _("Watch repair management."),
		}
	]
