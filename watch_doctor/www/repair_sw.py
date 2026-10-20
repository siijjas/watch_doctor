"""Service worker for the staff app, served at /repair_sw.js (scope /repair/).

Served as a page rather than a static asset so it sits at the site root:
a worker under /assets/ could not control /repair/. Same approach as
Frappe's own /website_script.js.
"""

no_cache = 1
base_template_path = "www/repair_sw.js"


def get_context(context):
	context.no_cache = 1
