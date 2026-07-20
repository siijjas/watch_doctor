"""Catalog/reference-lookup endpoints split from watch_doctor/api.py (API_PY_AUDIT.md item 5).

Customer search, watch brands/models, templates, country codes, items/stock, task
templates, employees, payment modes.
"""

import frappe
from frappe import _

from watch_doctor.permissions import (
    require_roles,
    ROLE_EXECUTIVE,
    ROLE_DATA_ENTRY,
    ROLE_TECHNICIAN,
)

# Result cap for live typeahead search endpoints (customers, items) — deliberately
# tighter than reference-data list endpoints (brands, templates) to bound
# per-keystroke query cost.
SEARCH_RESULT_LIMIT = 50


@frappe.whitelist()
def search_customers(txt: str = ""):
	"""Search customers by name."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)

	where_clause = "1=1"
	params = {}
	if txt:
		where_clause = "(c.customer_name like %(needle)s or c.mobile_no like %(needle)s or c.name like %(needle)s)"
		params["needle"] = f"%{txt}%"

	customers = frappe.db.sql(
		f"""
		select
			c.name, c.customer_name, c.mobile_no,
			(select con.phone
			 from `tabDynamic Link` dl
			 join `tabContact` con on con.name = dl.parent
			 where dl.link_doctype = 'Customer' and dl.link_name = c.name and dl.parenttype = 'Contact'
			 order by con.creation asc limit 1
			) as contact_phone
		from `tabCustomer` c
		where {where_clause}
		order by c.customer_name asc
		limit {SEARCH_RESULT_LIMIT}
		""",
		params,
		as_dict=True,
	)

	for c in customers:
		c["phone_display"] = c.pop("contact_phone", None) or c.get("mobile_no") or ""

	return customers


@frappe.whitelist()
def get_watch_brands(txt: str = ""):
	"""Search watch brands by name."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = []
	if txt:
		needle = f"%{txt}%"
		filters = [["brand_name", "like", needle]]
	
	brands = frappe.get_all(
		"DW Watch Brand",
		fields=["name", "brand_name", "description"],
		filters=filters,
		limit_page_length=500,
		order_by="brand_name asc"
	)
	
	return brands


@frappe.whitelist()
def create_watch_brand(brand_name: str, description: str = ""):
	"""Create a new watch brand."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if not brand_name:
		frappe.throw(_("Brand name is required"))
	
	if frappe.db.exists("DW Watch Brand", {"brand_name": brand_name}):
		frappe.throw(_("Brand already exists"))
		
	doc = frappe.get_doc({
		"doctype": "DW Watch Brand",
		"brand_name": brand_name,
		"description": description
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def create_watch_model(brand: str, model_name: str, description: str = ""):
	"""Create a new watch model."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if not brand or not model_name:
		frappe.throw(_("Brand and Model name are required"))
		
	if frappe.db.exists("DW Watch Model", {"brand": brand, "model_name": model_name}):
		frappe.throw(_("Model already exists for this brand"))
		
	doc = frappe.get_doc({
		"doctype": "DW Watch Model",
		"brand": brand,
		"model_name": model_name,
		"description": description
	})
	doc.insert()
	return doc.as_dict()


@frappe.whitelist()
def get_watch_models(brand: str = "", txt: str = ""):
	"""Get watch models for a specific brand, optionally filtered by search text."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = []
	
	# Always filter by brand if provided
	if brand:
		filters.append(["brand", "=", brand])
	
	# Add text search filter if provided
	if txt:
		needle = f"%{txt}%"
		filters.append(["model_name", "like", needle])
	
	models = frappe.get_all(
		"DW Watch Model",
		fields=["name", "brand", "model_name", "description"],
		filters=filters,
		limit_page_length=100,
		order_by="model_name asc"
	)
	
	return models



@frappe.whitelist()
def get_issue_templates():
	"""Get all active issue templates with suggested tasks."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Issue Template",
		fields=["name", "issue_name", "description", "suggested_task"],
		filters={"is_active": 1},
		limit_page_length=100,
		order_by="issue_name asc"
	)
	
	return templates


@frappe.whitelist()
def get_watch_condition_templates():
	"""Get all active pre-existing watch condition templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Watch Condition Template",
		fields=["name", "condition_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="condition_name asc"
	)
	return templates


@frappe.whitelist()
def get_diagnosis_summary_templates():
	"""Get all active diagnosis summary templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Diagnosis Summary Template",
		fields=["name", "summary_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="summary_name asc",
	)


@frappe.whitelist()
def get_recommended_work_templates():
	"""Get all active recommended work templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Recommended Work Template",
		fields=["name", "work_name", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="work_name asc",
	)


@frappe.whitelist()
def get_movement_info_templates():
	"""Get all active movement information templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Information Template",
		fields=["name", "movement_info", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="movement_info asc",
	)


@frappe.whitelist()
def get_movement_type_templates():
	"""Get all active movement type templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Type Template",
		fields=["name", "movement_type", "description"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="movement_type asc",
	)


@frappe.whitelist()
def get_movement_caliber_templates():
	"""Get all active movement caliber templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	return frappe.get_all(
		"DW Movement Caliber Template",
		fields=["name", "caliber_code", "description"],
		filters={"is_active": 1},
		limit_page_length=400,
		order_by="caliber_code asc",
	)


@frappe.whitelist()
def get_country_codes():
	"""Get all active country codes."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	codes = frappe.get_all(
		"DW Country Code",
		fields=["name", "country_name", "code"],
		filters={"is_active": 1},
		limit_page_length=200,
		order_by="country_name asc"
	)
	return codes



@frappe.whitelist()
def search_items(txt: str = "", item_group: str = ""):
	"""Search items by code, name, or description for parts selection.
	
	Supports flexible word-order matching. For example, 'battery 357' will find '357 RENATA BATTERY'.
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	filters = {
		"disabled": 0  # Only show enabled items
	}
	
	if item_group:
		filters["item_group"] = item_group
	
	if txt:
		# Split search text into words for flexible matching
		words = txt.strip().split()
		limit = SEARCH_RESULT_LIMIT

		if words:
			# Build SQL query to match ALL words in any order
			# Each word must appear in item_code OR item_name OR description
			conditions = []
			params = []
			
			for word in words:
				word_pattern = f"%{word}%"
				conditions.append("""
					(item_code LIKE %s OR item_name LIKE %s OR description LIKE %s)
				""")
				params.extend([word_pattern, word_pattern, word_pattern])
			
			# Combine all word conditions with AND
			where_clause = " AND ".join(conditions)
			
			# Add disabled filter
			where_clause += " AND disabled = 0"
			
			if item_group:
				where_clause += " AND item_group = %s"
				params.append(item_group)
			
			sql = f"""
				SELECT name, item_code, item_name, description, standard_rate, stock_uom
				FROM `tabItem`
				WHERE {where_clause}
				ORDER BY item_name ASC
				LIMIT {limit}
			"""
			
			items = frappe.db.sql(sql, params, as_dict=True)
		else:
			items = []
	else:
		# When no search query, return first 100 items as suggestions
		limit = 100
		items = frappe.get_all(
			"Item",
			fields=["name", "item_code", "item_name", "description", "standard_rate", "stock_uom"],
			filters=filters,
			limit_page_length=limit,
			order_by="item_name asc"
		)
	
	# Add actual stock balance for each item
	for item in items:
		# Get actual stock qty from Bin table
		stock_qty = frappe.db.sql("""
			SELECT SUM(actual_qty)
			FROM `tabBin`
			WHERE item_code = %s
		""", item['item_code'])
		item['stock_qty'] = stock_qty[0][0] if stock_qty and stock_qty[0][0] else 0
	
	return items



@frappe.whitelist()
def get_item_stock(item_code: str, warehouse: str = ""):
	"""Return available stock qty for a single item across all warehouses (or a specific one)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	item_code = (item_code or "").strip()
	if not item_code:
		frappe.throw(_("item_code is required"))
	warehouse = (warehouse or "").strip()
	if warehouse:
		qty = frappe.db.sql(
			"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s AND warehouse = %s",
			(item_code, warehouse),
		)
	else:
		qty = frappe.db.sql(
			"SELECT SUM(actual_qty) FROM `tabBin` WHERE item_code = %s",
			(item_code,),
		)
	available = float((qty[0][0] or 0) if qty else 0)
	return {"item_code": item_code, "available_qty": available}


@frappe.whitelist()
def get_task_templates():
	"""Get all active task templates."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	templates = frappe.get_all(
		"DW Task Template",
		fields=["name", "task_name", "description", "default_rate"],
		filters={"is_active": 1},
		limit_page_length=100,
		order_by="task_name asc"
	)
	return templates


@frappe.whitelist()
def get_employees():
	"""Get all technicians with their current open-item workload count."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	employees = frappe.get_all(
		"DW Technician",
		fields=["name", "technician_name as employee_name"],
		limit_page_length=100,
		order_by="technician_name asc",
	)
	open_counts = frappe.db.sql(
		"""
		SELECT technician, COUNT(*) AS open_count
		FROM `tabDW Repair Item`
		WHERE status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined')
		  AND technician IS NOT NULL AND technician != ''
		GROUP BY technician
		""",
		as_dict=True,
	)
	count_map = {r.technician: r.open_count for r in open_counts}
	for emp in employees:
		emp["open_items"] = count_map.get(emp["name"], 0)
	return employees


@frappe.whitelist()
def get_payment_modes():
	"""Get configured payment modes for repair workflow."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	payment_modes = frappe.db.sql("""
		SELECT 
			pmc.payment_mode as name,
			pmc.payment_mode as mode_of_payment,
			mop.type
		FROM `tabDW Payment Mode Config` pmc
		INNER JOIN `tabMode of Payment` mop ON pmc.payment_mode = mop.name
		WHERE pmc.is_active = 1 AND mop.enabled = 1
		ORDER BY pmc.display_order ASC, pmc.payment_mode ASC
	""", as_dict=True)
	return payment_modes
