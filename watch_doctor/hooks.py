app_name = "watch_doctor"
app_title = "Repair Management"
app_publisher = "dr"
app_description = "Repair Management"
app_email = "dr@dr.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "watch_doctor",
# 		"logo": "/assets/watch_doctor/logo.png",
# 		"title": "Repair Management",
# 		"route": "/watch_doctor",
# 		"has_permission": "watch_doctor.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/watch_doctor/css/watch_doctor.css"
# app_include_js = "/assets/watch_doctor/js/watch_doctor.js"

# include js, css files in header of web template
# web_include_css = "/assets/watch_doctor/css/watch_doctor.css"
# web_include_js = "/assets/watch_doctor/js/watch_doctor.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "watch_doctor/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Customer": "public/js/customer.js",
	"Sales Invoice": "public/js/sales_invoice_pms.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "watch_doctor/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "watch_doctor.utils.jinja_methods",
# 	"filters": "watch_doctor.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "watch_doctor.install.before_install"
# after_install = "watch_doctor.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "watch_doctor.uninstall.before_uninstall"
# after_uninstall = "watch_doctor.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "watch_doctor.utils.before_app_install"
# after_app_install = "watch_doctor.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "watch_doctor.utils.before_app_uninstall"
# after_app_uninstall = "watch_doctor.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "watch_doctor.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"DW Repair Order": "watch_doctor.permissions.repair_order_query_conditions",
}

has_permission = {
	"DW Repair Order": "watch_doctor.permissions.repair_order_has_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Sales Invoice": {
		"validate": "watch_doctor.pms.si_validate",
		"on_submit": "watch_doctor.pms.si_on_submit",
		"on_cancel": "watch_doctor.pms.si_on_cancel",
	}
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"watch_doctor.tasks.all"
# 	],
# 	"daily": [
# 		"watch_doctor.tasks.daily"
# 	],
# 	"hourly": [
# 		"watch_doctor.tasks.hourly"
# 	],
# 	"weekly": [
# 		"watch_doctor.tasks.weekly"
# 	],
# 	"monthly": [
# 		"watch_doctor.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "watch_doctor.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "watch_doctor.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "watch_doctor.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["watch_doctor.utils.before_request"]
# after_request = ["watch_doctor.utils.after_request"]

# Job Events
# ----------
# before_job = ["watch_doctor.utils.before_job"]
# after_job = ["watch_doctor.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"watch_doctor.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# Run doc reload on migrate to ensure DW doctypes are registered, and set up roles
after_migrate = [
    "watch_doctor.patches.reload_dw_doctypes.execute",
    "watch_doctor.setup_roles.execute",
    "watch_doctor.patches.grant_native_doctype_permissions.execute",
    "watch_doctor.setup_general_configuration.execute",
    "watch_doctor.setup_diagnosis_summary_templates.execute",
    "watch_doctor.setup_movement_type_templates.execute",
    "watch_doctor.setup_movement_caliber_templates.execute",
    "watch_doctor.setup_movement_info_templates.execute",
    "watch_doctor.setup_watch_condition_templates.execute",
    "watch_doctor.setup_pms.execute",
    "watch_doctor.setup_invoice_settings.execute",
    "watch_doctor.setup_pos_enhancements.execute",
]


# Fixtures
fixtures = [
    {
        "doctype": "DocType",
        "filters": [["name", "in", ["DW Technician", "DW Repair Order", "DW Repair Item", "DW Repair Task", "DW Repair Part Used", "DW Task Template", "DW Watch Condition Template", "DW Diagnosis Summary Template", "DW Movement Information Template", "DW Movement Type Template", "DW Movement Caliber Template", "DW Test"]]],
    },
    {
        "doctype": "Role",
        "filters": [["name", "in", ["DW Executive", "DW Data Entry", "DW Technician"]]],
    },
    {
        "doctype": "Print Format",
        "filters": [["name", "in", ["DW RO Bag Label", "DW PMS Tax Invoice", "DW POS Retail Receipt"]]],
    },
]
