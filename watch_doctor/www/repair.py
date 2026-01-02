import os

import frappe

no_cache = 1


def get_context(context):
	csrf_token = frappe.sessions.get_csrf_token()
	file_path = frappe.get_app_path("watch_doctor", "public", "frontend", "index.html")

	if os.path.exists(file_path):
		with open(file_path, "r", encoding="utf-8") as built:
			content = built.read()

		csrf_script = f'<script>window.csrf_token = "{csrf_token}";</script>'
		if "</head>" in content:
			content = content.replace("</head>", f"{csrf_script}</head>")
		else:
			content = csrf_script + content

		context.build_content = content
	else:
		context.build_content = "Build not found. Please run npm install && npm run build inside the frontend folder."
