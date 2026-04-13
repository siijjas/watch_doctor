import frappe
from frappe import _  # noqa: F401
import json

from watch_doctor.permissions import (
    require_roles,
    can_access_repair_order,
    get_dw_roles,
    get_current_technician,
    get_current_technician_identifiers,
    ROLE_EXECUTIVE,
    ROLE_DATA_ENTRY,
    ROLE_TECHNICIAN,
    PRIVILEGED_ROLES,
)


# ==================== User Info ====================

@frappe.whitelist()
def get_user_info():
    """Return the current user's DW roles and linked technician record."""
    user = frappe.session.user
    dw_roles = get_dw_roles(user)

    technician = None
    if "technician" in dw_roles:
        tech_values = get_current_technician_identifiers(user)
        if tech_values:
            technician = frappe.db.get_value(
                "DW Technician",
                {"name": ["in", tech_values]},
                ["name", "technician_name"],
                as_dict=True,
            )

    return {
        "user": user,
        "roles": dw_roles,
        "technician": technician,
    }


# ==================== App Configuration ====================

@frappe.whitelist()
def get_app_config():
	"""Return app-level configuration: logo URL, currency symbol, decimal places."""
	config = {
		"logo_url": "",
		"currency_code": "USD",
		"currency_symbol": "$",
		"decimal_places": 2,
	}

	# Logo stored via frappe defaults (no schema change needed)
	try:
		logo = frappe.db.get_default("dw_logo_url", "watch_doctor")
		config["logo_url"] = logo or ""
	except Exception:
		pass

	# Default currency: prefer default Company currency, fall back to System Settings
	try:
		currency_code = None
		# Try default company first
		default_company = frappe.db.get_single_value("Global Defaults", "default_company")
		if default_company:
			currency_code = frappe.db.get_value("Company", default_company, "default_currency")
		# Fallback to System Settings
		if not currency_code:
			currency_code = frappe.db.get_single_value("System Settings", "currency")
		currency_code = currency_code or "USD"
		config["currency_code"] = currency_code
	except Exception:
		pass

	# Fetch symbol and decimal places from Currency doctype
	try:
		currency_row = frappe.db.get_value(
			"Currency", config["currency_code"],
			["symbol", "fraction_units"], as_dict=True
		)
		if currency_row:
			config["currency_symbol"] = currency_row.symbol or config["currency_code"]
			fraction_units = int(currency_row.fraction_units or 100)
			import math
			config["decimal_places"] = round(math.log10(fraction_units)) if fraction_units > 1 else 0
	except Exception:
		pass

	return config


@frappe.whitelist()
def save_logo_url(logo_url):
	"""Persist the app logo URL using frappe defaults."""
	require_roles(ROLE_EXECUTIVE)
	try:
		frappe.db.set_default("dw_logo_url", logo_url, "watch_doctor")
		frappe.db.commit()
		return {"success": True}
	except Exception as e:
		frappe.log_error(frappe.get_traceback(), "save_logo_url error")
		return {"success": False, "error": str(e)}


@frappe.whitelist()
def save_repair_order(doc_json):
	"""Custom save method for repair orders that handles system fields properly."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	doc_dict = json.loads(doc_json) if isinstance(doc_json, str) else doc_json

	# Technicians may only update orders they are assigned to
	if doc_dict.get('name'):
		if not can_access_repair_order(doc_dict['name']):
			frappe.throw(_("You do not have access to this repair order"), frappe.PermissionError)
	
	# Remove system fields recursively
	def clean_dict(d):
		if isinstance(d, dict):
			# Remove system fields that cannot be modified
			for key in ['creation', 'modified_by', 'owner', 'simple_description', 
			            'docstatus', '__islocal', '__unsaved', '__onload']:
				d.pop(key, None)
			# Recursively clean nested dicts and lists
			for key, value in d.items():
				if isinstance(value, dict):
					clean_dict(value)
				elif isinstance(value, list):
					for item in value:
						if isinstance(item, dict):
							clean_dict(item)
		return d
	
	doc_dict = clean_dict(doc_dict)
	
	# Debug: log what we received
	frappe.logger().info(f"=== save_repair_order called ===")
	frappe.logger().info(f"Order: {doc_dict.get('name', 'NEW')}")
	for idx, item in enumerate(doc_dict.get('items', [])):
		frappe.logger().info(f"Item {idx}: technician={item.get('technician')}, status={item.get('status')}")
	
	# Auto-update item statuses based on technician assignment BEFORE merging with doc
	# This ensures the status change is included in the update
	for item in doc_dict.get('items', []):
		if item.get('technician') and item.get('status') == 'Pending':
			frappe.logger().info(f"Updating item status from Pending to In Repair (technician: {item.get('technician')})")
			item['status'] = 'In Repair'

	# Flatten nested structures (tasks, parts, issues) from items into the main doc tables
	# This is necessary because frontend uses nested structure but backend uses flat tables linked by repair_item_key
	all_tasks = []
	all_parts = []
	all_issues = []

	def ensure_other_issue_template():
		"""Return a valid DW Issue Template name for the generic Other issue."""
		if frappe.db.exists("DW Issue Template", "Other"):
			return "Other"
		existing_other = frappe.db.sql(
			"""
			select name
			from `tabDW Issue Template`
			where lower(issue_name) = 'other'
			limit 1
			""",
			as_dict=True,
		)
		if existing_other:
			return existing_other[0].name
		other_doc = frappe.get_doc({
			"doctype": "DW Issue Template",
			"issue_name": "Other",
			"description": "Generic issue placeholder for custom complaints",
			"is_active": 1,
		})
		other_doc.insert(ignore_permissions=True)
		return other_doc.name

	def resolve_issue_template_name(raw_issue):
		"""Resolve an issue label or name into a valid DW Issue Template name."""
		if not raw_issue:
			return None
		issue_value = str(raw_issue).strip()
		if not issue_value:
			return None
		if frappe.db.exists("DW Issue Template", issue_value):
			return issue_value
		by_issue_name = frappe.db.sql(
			"""
			select name
			from `tabDW Issue Template`
			where lower(issue_name) = lower(%s)
			limit 1
			""",
			(issue_value,),
			as_dict=True,
		)
		if by_issue_name:
			return by_issue_name[0].name
		return None
	
	for i, item in enumerate(doc_dict.get('items', [])):
		item_key = str(i + 1)
		
		# Process Tasks
		if item.get('tasks'):
			for task in item['tasks']:
				task['repair_item_key'] = item_key
				all_tasks.append(task)
		
		# Process Parts
		if item.get('parts_used'):
			for part in item['parts_used']:
				part['repair_item_key'] = item_key
				all_parts.append(part)
				
		# Process Issues
		if item.get('issues'):
			for issue in item['issues']:
				raw_issue = issue.get('issue')
				is_other = bool(issue.get('is_other'))
				if is_other or (str(raw_issue or '').strip().lower() == 'other'):
					# Child doctype requires a valid Link value even for custom "Other" entries.
					issue['issue'] = ensure_other_issue_template()
					issue['is_other'] = 1
				else:
					resolved_name = resolve_issue_template_name(raw_issue)
					if resolved_name:
						issue['issue'] = resolved_name
				issue['repair_item_key'] = item_key
				all_issues.append(issue)
				
	doc_dict['all_tasks'] = all_tasks
	doc_dict['all_parts'] = all_parts
	doc_dict['all_issues'] = all_issues
	
	# Auto-update task statuses when parts are added
	# Group parts by task
	parts_by_task = {}
	for part in doc_dict.get('all_parts', []):
		task_name = part.get('task')
		if task_name:
			if task_name not in parts_by_task:
				parts_by_task[task_name] = []
			parts_by_task[task_name].append(part)
	
	# Update task status from Pending to In Progress if it has parts
	for task in doc_dict.get('all_tasks', []):
		task_name = task.get('name')
		if task_name and task_name in parts_by_task and task.get('status') == 'Pending':
			frappe.logger().info(f"Updating task {task_name} status from Pending to In Progress (has parts)")
			task['status'] = 'In Progress'
	
	# Auto-update order status based on item statuses
	item_statuses = [item.get('status') for item in doc_dict.get('items', [])]
	if any(s == 'In Repair' for s in item_statuses) and doc_dict.get('status') == 'Pending':
		frappe.logger().info(f"Updating order status from Pending to In Progress")
		doc_dict['status'] = 'In Progress'
	
	# Get or create document
	if doc_dict.get('name'):
		# Update existing
		doc = frappe.get_doc('DW Repair Order', doc_dict['name'])
		doc.update(doc_dict)
	else:
		# Create new
		doc = frappe.get_doc(doc_dict)
	
	doc.save()
	frappe.db.commit()
	
	# Reload to get all child tables populated
	doc.reload()
	
	frappe.logger().info(f"After save: order status={doc.status}")
	for item in doc.items:
		frappe.logger().info(f"After save: item {item.idx} status={item.status}, technician={item.technician}")
	
	return doc.as_dict()




@frappe.whitelist()
def list_repair_orders():
	"""Return lightweight repair order list with customer display."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)

	# Technicians: only orders assigned to them
	roles = set(frappe.get_roles())
	extra_filters = {}
	if not (roles & PRIVILEGED_ROLES) and ROLE_TECHNICIAN in roles:
		tech_values = get_current_technician_identifiers()
		if tech_values:
			assigned_orders = frappe.get_all(
				"DW Repair Item",
				filters={"technician": ["in", tech_values]},
				fields=["parent"],
				distinct=True,
			)
			order_names = [r.parent for r in assigned_orders]
			if not order_names:
				return []
			extra_filters["name"] = ["in", order_names]
		else:
			return []

	orders = frappe.get_all(
		"DW Repair Order",
		fields=["name", "customer", "status", "priority", "received_date"],
		filters=extra_filters,
		limit_page_length=50,
		order_by="modified desc",
	)
	# add customer_name for display
	customer_names = {}
	for o in orders:
		if o.customer and o.customer not in customer_names:
			customer_names[o.customer] = frappe.db.get_value("Customer", o.customer, "customer_name")
		o["customer_name"] = customer_names.get(o.customer) or o.customer
		
		# Add item count
		o["item_count"] = frappe.db.count("DW Repair Item", {"parent": o.name})
	
	return orders


@frappe.whitelist()
def search_customers(txt: str = ""):
	"""Search customers by name."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	filters = []
	or_filters = []
	if txt:
		needle = f"%{txt}%"
		or_filters = [
			["customer_name", "like", needle],
			["mobile_no", "like", needle],
			["name", "like", needle]
		]

	customers = frappe.get_all(
		"Customer",
		fields=["name", "customer_name", "mobile_no"],
		filters=filters,
		or_filters=or_filters,
		limit_page_length=50,
	)

	# Add phone display from linked contacts if available
	for c in customers:
		# Try to get primary contact phone
		contact = frappe.db.get_value(
			"Dynamic Link",
			{
				"link_doctype": "Customer",
				"link_name": c["name"],
				"parenttype": "Contact"
			},
			"parent"
		)
		if contact:
			phone = frappe.db.get_value("Contact", contact, "phone")
			c["phone_display"] = phone or c.get("mobile_no") or ""
		else:
			c["phone_display"] = c.get("mobile_no") or ""

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
		limit_page_length=100,
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
		limit = 50
		
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
	"""Get all technicians (employees)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY, ROLE_TECHNICIAN)
	employees = frappe.get_all(
		"DW Technician",
		fields=["name", "employee_name"],
		limit_page_length=100,
		order_by="employee_name asc"
	)
	return employees


@frappe.whitelist()
def get_payment_modes():
	"""Get configured payment modes for repair workflow."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	# Fetch active payment modes from config
	payment_modes = frappe.db.sql("""
		SELECT 
			pmc.payment_mode as name,
			mop.type
		FROM `tabDW Payment Mode Config` pmc
		INNER JOIN `tabMode of Payment` mop ON pmc.payment_mode = mop.name
		WHERE pmc.is_active = 1 AND mop.enabled = 1
		ORDER BY pmc.display_order ASC, pmc.payment_mode ASC
	""", as_dict=True)
	
	return payment_modes


# ============ DASHBOARD APIs ============

@frappe.whitelist()
def get_dashboard_stats(days: int = 7):
	"""Get summary statistics for dashboard KPI cards."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from datetime import datetime, timedelta
	
	today = datetime.now().date()
	start_date = today - timedelta(days=int(days))
	month_start = today.replace(day=1)
	
	# Count orders by status
	status_counts = frappe.db.sql("""
		SELECT status, COUNT(*) as count
		FROM `tabDW Repair Order`
		GROUP BY status
	""", as_dict=True)
	
	status_map = {row['status']: row['count'] for row in status_counts}
	
	# Total orders
	total_orders = sum(status_map.values())
	
	# Orders in period
	orders_in_period = frappe.db.count("DW Repair Order", {
		"received_date": [">=", start_date]
	})
	
	# Completed in period (status = Repaired or Delivered)
	completed_in_period = frappe.db.count("DW Repair Order", {
		"status": ["in", ["Repaired", "Delivered"]],
		"modified": [">=", start_date]
	})
	
	# Revenue this month (from linked Sales Invoices)
	revenue_this_month = frappe.db.sql("""
		SELECT COALESCE(SUM(si.grand_total), 0) as total
		FROM `tabDW Repair Order` ro
		INNER JOIN `tabSales Invoice` si ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
		AND si.posting_date >= %s
	""", (month_start,))[0][0] or 0
	
	# Average repair days (for completed orders)
	avg_repair_days = frappe.db.sql("""
		SELECT AVG(DATEDIFF(COALESCE(delivery_date, CURDATE()), received_date)) as avg_days
		FROM `tabDW Repair Order`
		WHERE status IN ('Repaired', 'Delivered')
		AND received_date IS NOT NULL
	""")[0][0] or 0
	
	return {
		"total_orders": total_orders,
		"pending": status_map.get("Pending", 0),
		"in_progress": status_map.get("In Progress", 0),
		"awaiting_parts": status_map.get("Awaiting Parts", 0),
		"repaired": status_map.get("Repaired", 0),
		"delivered": status_map.get("Delivered", 0),
		"orders_in_period": orders_in_period,
		"completed_in_period": completed_in_period,
		"revenue_this_month": float(revenue_this_month),
		"avg_repair_days": round(float(avg_repair_days), 1),
		"period_days": int(days)
	}


@frappe.whitelist()
def get_orders_trend(days: int = 7):
	"""Get daily order counts for the last N days."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from datetime import datetime, timedelta
	
	today = datetime.now().date()
	start_date = today - timedelta(days=int(days) - 1)
	
	# Get received orders per day
	received = frappe.db.sql("""
		SELECT received_date as date, COUNT(*) as count
		FROM `tabDW Repair Order`
		WHERE received_date >= %s
		GROUP BY received_date
		ORDER BY received_date
	""", (start_date,), as_dict=True)
	
	# Get completed orders per day (based on delivery_date or modified when status changed)
	completed = frappe.db.sql("""
		SELECT DATE(COALESCE(delivery_date, modified)) as date, COUNT(*) as count
		FROM `tabDW Repair Order`
		WHERE status IN ('Repaired', 'Delivered')
		AND DATE(COALESCE(delivery_date, modified)) >= %s
		GROUP BY DATE(COALESCE(delivery_date, modified))
		ORDER BY date
	""", (start_date,), as_dict=True)
	
	# Build date-indexed maps
	received_map = {str(row['date']): row['count'] for row in received}
	completed_map = {str(row['date']): row['count'] for row in completed}
	
	# Generate full date range
	result = []
	for i in range(int(days)):
		date = start_date + timedelta(days=i)
		date_str = str(date)
		result.append({
			"date": date_str,
			"label": date.strftime("%a"),  # Day name abbreviation
			"received": received_map.get(date_str, 0),
			"completed": completed_map.get(date_str, 0)
		})
	
	return result


@frappe.whitelist()
def get_technician_stats():
	"""Get performance stats per technician."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	# Get task counts grouped by technician and status
	stats = frappe.db.sql("""
		SELECT 
			t.technician,
			tech.technician_name,
			COUNT(*) as total_tasks,
			SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed,
			SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
			SUM(CASE WHEN t.status = 'Pending' THEN 1 ELSE 0 END) as pending
		FROM `tabDW Repair Task` t
		LEFT JOIN `tabDW Technician` tech ON t.technician = tech.name
		WHERE t.technician IS NOT NULL AND t.technician != ''
		GROUP BY t.technician, tech.technician_name
		ORDER BY completed DESC
	""", as_dict=True)
	
	return stats


@frappe.whitelist()
def get_top_issues(limit: int = 10):
	"""Get most common repair issues."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	issues = frappe.db.sql("""
		SELECT 
			COALESCE(it.issue_name, ri.issue) as issue_name,
			COUNT(*) as count
		FROM `tabDW Repair Item Issue` ri
		LEFT JOIN `tabDW Issue Template` it ON ri.issue = it.name
		GROUP BY ri.issue, it.issue_name
		ORDER BY count DESC
		LIMIT %s
	""", (int(limit),), as_dict=True)
	
	# Calculate percentages
	total = sum(i['count'] for i in issues)
	for issue in issues:
		issue['percentage'] = round((issue['count'] / total * 100) if total > 0 else 0, 1)
	
	return issues


@frappe.whitelist()
def get_aged_pending_orders(limit: int = 5):
	"""Get oldest pending repair orders."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	orders = frappe.db.sql("""
		SELECT 
			name, customer, received_date, status,
			DATEDIFF(CURDATE(), received_date) as days_pending
		FROM `tabDW Repair Order`
		WHERE status = 'Pending'
		ORDER BY received_date ASC
		LIMIT %s
	""", (int(limit),), as_dict=True)
	
	# Add customer name for display
	for o in orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]
		
	return orders


# ==================== POS APIs ====================

@frappe.whitelist()
def get_pos_items(search: str = "", limit: int = 100, in_stock_only: int = 1):
	"""Get items for POS with stock and pricing info. Only returns enabled items with stock."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	filters = {"is_stock_item": 1, "disabled": 0}
	
	# Get items from Bin that have stock
	if int(in_stock_only):
		items_with_stock = frappe.db.sql("""
			SELECT DISTINCT b.item_code, SUM(b.actual_qty) as stock_qty
			FROM `tabBin` b
			INNER JOIN `tabItem` i ON b.item_code = i.name
			WHERE i.disabled = 0 AND i.is_stock_item = 1
			GROUP BY b.item_code
			HAVING SUM(b.actual_qty) > 0
		""", as_dict=True)
		
		item_codes = [i['item_code'] for i in items_with_stock]
		stock_map = {i['item_code']: i['stock_qty'] for i in items_with_stock}
		
		if not item_codes:
			return []
		
		if search:
			items = frappe.get_all(
				"Item",
				filters={"name": ["in", item_codes]},
				or_filters=[
					["item_name", "like", f"%{search}%"],
					["item_code", "like", f"%{search}%"]
				],
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		else:
			items = frappe.get_all(
				"Item",
				filters={"name": ["in", item_codes]},
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		
		for item in items:
			item['stock_qty'] = stock_map.get(item['name'], 0)
	else:
		if search:
			items = frappe.get_all(
				"Item",
				filters=filters,
				or_filters=[
					["item_name", "like", f"%{search}%"],
					["item_code", "like", f"%{search}%"]
				],
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		else:
			items = frappe.get_all(
				"Item",
				filters=filters,
				fields=["name", "item_name", "item_code", "item_group", "standard_rate", "image"],
				limit_page_length=int(limit),
				order_by="item_name asc"
			)
		
		for item in items:
			stock = frappe.db.sql("""
				SELECT SUM(actual_qty) as qty
				FROM `tabBin`
				WHERE item_code = %s
			""", (item['name'],), as_dict=True)
			item['stock_qty'] = stock[0]['qty'] if stock and stock[0]['qty'] else 0
	
	return items


@frappe.whitelist()
def get_pos_customers(search: str = "", limit: int = 20):
	"""Get customers for POS selection."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if search:
		customers = frappe.get_all(
			"Customer",
			or_filters=[
				["customer_name", "like", f"%{search}%"],
				["name", "like", f"%{search}%"]
			],
			fields=["name", "customer_name"],
			limit_page_length=int(limit),
			order_by="customer_name asc"
		)
	else:
		customers = frappe.get_all(
			"Customer",
			fields=["name", "customer_name"],
			limit_page_length=int(limit),
			order_by="modified desc"
		)
	
	return customers


@frappe.whitelist()
def create_pos_invoice(customer: str, items_json: str, payment_mode: str = "Cash", discount_percent: float = 0):
	"""Create a POS Sales Invoice with immediate payment."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	discount_percent = float(discount_percent) if discount_percent else 0
	
	if not customer:
		frappe.throw("Customer is required")
	if not items or len(items) == 0:
		frappe.throw("At least one item is required")
	
	# Get company from settings or first company
	company = frappe.defaults.get_user_default("Company") or frappe.get_all("Company", limit=1)[0].name
	
	# Get mode of payment account
	payment_account = None
	try:
		mode_of_payment = frappe.get_doc("Mode of Payment", payment_mode)
		for account in mode_of_payment.accounts:
			if account.company == company:
				payment_account = account.default_account
				break
	except Exception:
		pass
	
	if not payment_account:
		# Fallback: get first cash/bank account
		payment_account = frappe.db.get_value(
			"Account",
			{"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0},
			"name"
		)
	
	# Calculate total first to set payment amount
	total_amount = sum(item.get("rate", 0) * item.get("qty", 1) for item in items)
	
	# Create Sales Invoice with payment in payments child table (required for POS)
	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": frappe.utils.today(),
		"is_pos": 1,
		"update_stock": 1,
		"additional_discount_percentage": discount_percent,
		"items": [],
		"payments": [{
			"mode_of_payment": payment_mode,
			"account": payment_account,
			"amount": total_amount
		}]
	})
	invoice.flags.ignore_permissions = True
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})
	
	invoice.insert(ignore_permissions=True)
	
	# Update payment amount to match grand_total after insert (which calculates taxes/discount etc)
	if invoice.payments and len(invoice.payments) > 0:
		invoice.payments[0].amount = invoice.grand_total
		invoice.save(ignore_permissions=True)
	
	invoice.flags.ignore_permissions = True
	invoice.submit()
	
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": customer
	}


@frappe.whitelist()
def save_pos_draft(customer: str, items_json: str):
	"""Save POS cart as draft Sales Invoice (not submitted)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	items = json.loads(items_json) if isinstance(items_json, str) else items_json
	
	if not customer:
		frappe.throw("Customer is required")
	if not items or len(items) == 0:
		frappe.throw("At least one item is required")
	
	# Get company from settings or first company
	company = frappe.defaults.get_user_default("Company") or frappe.get_all("Company", limit=1)[0].name
	
	# Create draft Sales Invoice (is_pos but not submitted)
	invoice = frappe.get_doc({
		"doctype": "Sales Invoice",
		"customer": customer,
		"company": company,
		"posting_date": frappe.utils.today(),
		"due_date": frappe.utils.today(),
		"is_pos": 1,
		"update_stock": 1,
		"items": []
	})
	invoice.flags.ignore_permissions = True
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})
	
	invoice.insert(ignore_permissions=True)
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": customer
	}


@frappe.whitelist()
def get_pos_drafts(limit: int = 20):
	"""Get draft POS invoices (held orders)."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	drafts = frappe.get_all(
		"Sales Invoice",
		filters={
			"is_pos": 1,
			"docstatus": 0  # Draft
		},
		fields=["name", "customer", "customer_name", "grand_total", "creation", "modified"],
		limit_page_length=int(limit),
		order_by="modified desc"
	)
	
	# Get item count for each draft
	for draft in drafts:
		items = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": draft["name"]},
			fields=["COUNT(*) as count"]
		)
		draft["item_count"] = items[0]["count"] if items else 0
	
	return drafts


@frappe.whitelist()
def load_pos_draft(invoice_name: str):
	"""Load a draft invoice to continue in POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	items = []
	for item in invoice.items:
		items.append({
			"item_code": item.item_code,
			"item_name": item.item_name,
			"qty": item.qty,
			"rate": item.rate
		})
	
	return {
		"invoice_name": invoice.name,
		"customer": invoice.customer,
		"customer_name": invoice.customer_name,
		"items": items,
		"grand_total": invoice.grand_total
	}


@frappe.whitelist()
def delete_pos_draft(invoice_name: str):
	"""Delete a draft POS invoice."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Can only delete draft invoices")
	
	frappe.delete_doc("Sales Invoice", invoice_name)
	frappe.db.commit()
	
	return {"success": True}


@frappe.whitelist()
def submit_pos_draft(invoice_name: str, payment_mode: str = "Cash", discount_percent: float = 0):
	"""Submit a draft POS invoice with payment."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	invoice.flags.ignore_permissions = True
	discount_percent = float(discount_percent) if discount_percent else 0
	
	if invoice.docstatus != 0:
		frappe.throw("Invoice is not a draft")
	
	company = invoice.company
	
	# Get mode of payment account
	payment_account = None
	try:
		mode_of_payment = frappe.get_doc("Mode of Payment", payment_mode)
		for account in mode_of_payment.accounts:
			if account.company == company:
				payment_account = account.default_account
				break
	except Exception:
		pass
	
	if not payment_account:
		payment_account = frappe.db.get_value(
			"Account",
			{"company": company, "account_type": ["in", ["Cash", "Bank"]], "is_group": 0},
			"name"
		)
	
	# Apply discount if any
	if discount_percent > 0:
		invoice.additional_discount_percentage = discount_percent
	
	# Add payment
	invoice.append("payments", {
		"mode_of_payment": payment_mode,
		"account": payment_account,
		"amount": invoice.grand_total
	})
	
	invoice.save(ignore_permissions=True)
	
	# Update payment amount after save
	if invoice.payments and len(invoice.payments) > 0:
		invoice.payments[-1].amount = invoice.grand_total
		invoice.save(ignore_permissions=True)
	
	invoice.flags.ignore_permissions = True
	invoice.submit()
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": invoice.customer
	}




# ==================== Daily Report API ====================

@frappe.whitelist()
def get_daily_report(report_date=None):
	"""Get a comprehensive daily report for repair works and POS."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	import datetime
	is_executive = "executive" in get_dw_roles()
	if not report_date:
		report_date = datetime.date.today().isoformat()

	# ---- REPAIR SECTION ----

	# Orders received on report_date
	received_orders = frappe.db.sql("""
		SELECT name, customer, status, priority, received_date,
			promised_delivery_date, invoiced_amount
		FROM `tabDW Repair Order`
		WHERE received_date = %s
		ORDER BY creation ASC
	""", (report_date,), as_dict=True)
	for o in received_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Orders completed on report_date (status=Completed, modified on that date)
	completed_orders = frappe.db.sql("""
		SELECT name, customer, status, received_date, invoiced_amount,
			DATE(modified) as completed_date
		FROM `tabDW Repair Order`
		WHERE status = 'Completed' AND DATE(modified) = %s
		ORDER BY modified DESC
	""", (report_date,), as_dict=True)
	for o in completed_orders:
		o["customer_name"] = frappe.db.get_value("Customer", o["customer"], "customer_name") or o["customer"]

	# Pending / In Progress counts (current snapshot)
	pending_count = frappe.db.count("DW Repair Order", {"status": "Pending"})
	inprogress_count = frappe.db.count("DW Repair Order", {"status": "In Progress"})

	# Repair revenue: submitted Sales Invoices posted on report_date linked to a repair order
	repair_revenue_rows = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.customer
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date = %s
	""", (report_date,), as_dict=True)
	repair_revenue = sum(r["grand_total"] for r in repair_revenue_rows)
	repair_invoice_count = len(repair_revenue_rows)

	# Repair invoice payment mode breakdown
	repair_payment_breakdown = []
	if repair_revenue_rows:
		ri_names = [r["name"] for r in repair_revenue_rows]
		ri_placeholders = ", ".join(["%s"] * len(ri_names))
		repair_payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({ri_placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(ri_names), as_dict=True
		)

	# Tasks completed per technician on report_date
	technician_tasks = frappe.db.sql("""
		SELECT
			t.technician,
			tech.technician_name,
			COUNT(*) as tasks_completed
		FROM `tabDW Repair Task` t
		LEFT JOIN `tabDW Technician` tech ON t.technician = tech.name
		WHERE t.status = 'Completed' AND DATE(t.modified) = %s
			AND t.technician IS NOT NULL AND t.technician != ''
		GROUP BY t.technician, tech.technician_name
		ORDER BY tasks_completed DESC
	""", (report_date,), as_dict=True)

	# Top issues from orders received on report_date
	top_issues = frappe.db.sql("""
		SELECT
			COALESCE(it.issue_name, ri.issue) as issue_name,
			COUNT(*) as count
		FROM `tabDW Repair Item Issue` ri
		INNER JOIN `tabDW Repair Order` ro ON ri.parent = ro.name
		LEFT JOIN `tabDW Issue Template` it ON ri.issue = it.name
		WHERE ro.received_date = %s
		GROUP BY ri.issue, it.issue_name
		ORDER BY count DESC
		LIMIT 10
	""", (report_date,), as_dict=True)

	# Parts used in orders received on report_date
	parts_used = frappe.db.sql("""
		SELECT
			rp.part,
			COALESCE(rp.item_name, i.item_name, rp.part) as item_name,
			SUM(rp.quantity) as total_qty,
			SUM(rp.quantity * COALESCE(rp.rate, rp.auto_rate, 0)) as total_amount
		FROM `tabDW Repair Part Used` rp
		INNER JOIN `tabDW Repair Order` ro ON rp.parent = ro.name
		LEFT JOIN `tabItem` i ON rp.part = i.name
		WHERE ro.received_date = %s
		GROUP BY rp.part, item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- FINANCIAL / EXPENSES SECTION ----

	# ---- FINANCIAL / EXPENSES SECTION ----

	expense_entries = []

	# 1) Payment Entry expenses — outgoing payments on ALL modes
	pe_rows = frappe.db.sql(
		"""SELECT
			pe.name,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			pe.paid_to AS debit_account
		FROM `tabPayment Entry` pe
		WHERE pe.payment_type = 'Pay'
			AND pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.creation ASC""",
		(report_date,),
		as_dict=True
	)
	expense_entries.extend(pe_rows)

	def _mode_breakdown_dicts(rows):
		m = {}
		for r in rows:
			mode = r.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(r.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	# 2) Journal Entry debits — credit on ANY mode-of-payment account = cash out
	default_company = frappe.defaults.get_defaults().get("company")
	mode_account_rows = frappe.db.sql(
		"""SELECT mopa.default_account, mop.name AS mode_of_payment
		FROM `tabMode of Payment Account` mopa
		INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
		WHERE (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
		(default_company or "",),
		as_dict=True
	)
	account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}
	payment_accounts = list(account_to_mode.keys())

	je_detail_rows = []
	if payment_accounts:
		pa_placeholders = ", ".join(["%s"] * len(payment_accounts))
		je_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.credit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				jea_debit.account AS debit_account
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			LEFT JOIN `tabJournal Entry Account` jea_debit
				ON jea_debit.parent = je.name
				AND jea_debit.debit_in_account_currency > 0
			WHERE je.docstatus = 1
				AND je.posting_date = %s
				AND jea.account IN ({pa_placeholders})
				AND jea.credit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple([report_date] + payment_accounts),
			as_dict=True
		)
		for row in je_rows:
			row["mode_of_payment"] = account_to_mode.get(row["account"], row["account"])
			je_detail_rows.append({
				"name": row["name"],
				"mode_of_payment": row["mode_of_payment"],
				"against_account": row.get("debit_account") or "",
				"amount": float(row["amount"] or 0),
				"remarks": row.get("remarks") or "",
			})
		expense_entries.extend(je_rows)

	je_count = len(je_detail_rows)
	je_total = sum(r["amount"] for r in je_detail_rows)
	je_by_mode = _mode_breakdown_dicts(je_detail_rows)

	# Paid-at-invoice Purchase Invoices (is_paid=1): cash purchases settled directly
	# without a separate Payment Entry — must be fetched here so they're included in
	# expense_breakdown (→ Cash Flow by Payment Mode) and paid_purchases_by_mode.
	paid_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total,
			COALESCE(pi.supplier_name, '') AS supplier_name,
			COALESCE(pi.cash_bank_account, '') AS cash_bank_account
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s AND pi.is_paid = 1
		ORDER BY pi.grand_total DESC
	""", (report_date,), as_dict=True)
	total_paid_purchases = sum(float(inv["grand_total"] or 0) for inv in paid_purchase_invoices)

	# Group paid invoices by their cash/bank account for mode breakdown
	paid_purchases_mode_map = {}
	for inv in paid_purchase_invoices:
		mode = inv.get("cash_bank_account") or "Cash"
		if mode not in paid_purchases_mode_map:
			paid_purchases_mode_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		paid_purchases_mode_map[mode]["total"] += float(inv.get("grand_total") or 0)
		paid_purchases_mode_map[mode]["count"] += 1
	paid_purchases_by_mode = sorted(paid_purchases_mode_map.values(), key=lambda x: x["total"], reverse=True)

	# Aggregate by payment mode — include paid purchase invoice outflows
	mode_expense_map = {}
	for e in expense_entries:
		mode = e.get("mode_of_payment", "Other")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(e.get("amount") or 0)
		mode_expense_map[mode]["count"] += 1
	for inv in paid_purchase_invoices:
		mode = inv.get("cash_bank_account") or "Cash"
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(inv.get("grand_total") or 0)
		mode_expense_map[mode]["count"] += 1

	expense_breakdown = sorted(mode_expense_map.values(), key=lambda x: x["total"], reverse=True)
	total_expenses = sum(b["total"] for b in expense_breakdown)

	# ---- PAYMENT ENTRIES OVERVIEW ----
	# All submitted Payment Entries for the day — Receive (collections) and Pay (disbursements)
	pe_all = frappe.db.sql("""
		SELECT
			pe.name,
			pe.payment_type,
			pe.mode_of_payment,
			pe.party_type,
			pe.party,
			COALESCE(pe.party_name, '') AS party_name,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks,
			COALESCE(pe.reference_no, '') AS reference_no
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1
			AND pe.posting_date = %s
		ORDER BY pe.payment_type DESC, pe.creation ASC
	""", (report_date,), as_dict=True)

	pe_receive = [p for p in pe_all if p["payment_type"] == "Receive"]
	pe_pay_all = [p for p in pe_all if p["payment_type"] == "Pay"]

	total_pe_received = sum(float(p["amount"] or 0) for p in pe_receive)
	total_pe_paid = sum(float(p["amount"] or 0) for p in pe_pay_all)
	net_pe_cash = total_pe_received - total_pe_paid

	def _mode_breakdown(entries):
		m = {}
		for p in entries:
			mode = p.get("mode_of_payment") or "Other"
			if mode not in m:
				m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
			m[mode]["total"] += float(p.get("amount") or 0)
			m[mode]["count"] += 1
		return sorted(m.values(), key=lambda x: x["total"], reverse=True)

	pe_receive_by_mode = _mode_breakdown(pe_receive)
	pe_pay_by_mode = _mode_breakdown(pe_pay_all)

	# Split outgoing PEs: Purchases (Supplier) vs Operating (everything else)
	pe_purchases = [p for p in pe_pay_all if p.get("party_type") == "Supplier"]
	pe_operating = [p for p in pe_pay_all if p.get("party_type") != "Supplier"]
	total_pe_purchases = sum(float(p["amount"] or 0) for p in pe_purchases)
	total_pe_operating = sum(float(p["amount"] or 0) for p in pe_operating)
	pe_purchases_by_mode = _mode_breakdown(pe_purchases)
	pe_operating_by_mode = _mode_breakdown(pe_operating)

	# ---- CUSTOMER COLLECTIONS (PE Receive against credit Sales Invoices) ----
	pe_customer_collections = []
	for p in pe_receive:
		if p.get("party_type") == "Customer":
			# Check if this PE references a Sales Invoice
			refs = frappe.db.sql("""
				SELECT reference_doctype, reference_name, allocated_amount
				FROM `tabPayment Entry Reference`
				WHERE parent = %s AND reference_doctype = 'Sales Invoice'
			""", (p["name"],), as_dict=True)
			if refs:
				for ref in refs:
					pe_customer_collections.append({
						"pe_name": p["name"],
						"customer": p.get("party") or "",
						"customer_name": p.get("party_name") or p.get("party") or "",
						"invoice": ref["reference_name"],
						"amount": float(ref["allocated_amount"] or 0),
						"mode_of_payment": p.get("mode_of_payment") or "",
					})
			else:
				# No explicit invoice references (on-account/customer collection).
				# Count this as collection so income stream reflects actual cash received.
				pe_customer_collections.append({
					"pe_name": p["name"],
					"customer": p.get("party") or "",
					"customer_name": p.get("party_name") or p.get("party") or "",
					"invoice": "",
					"amount": float(p.get("amount") or 0),
					"mode_of_payment": p.get("mode_of_payment") or "",
				})
	total_customer_collections = sum(c["amount"] for c in pe_customer_collections)

	# ---- CREDIT INVOICES FOR THE DAY ----
	# Credit Sales Invoices: submitted today, outstanding > 0 (not fully paid)
	credit_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.customer, si.grand_total, si.outstanding_amount,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.posting_date = %s
			AND si.outstanding_amount > 0
		ORDER BY si.outstanding_amount DESC
	""", (report_date,), as_dict=True)
	total_credit_sales = sum(float(inv["outstanding_amount"] or 0) for inv in credit_sales_invoices)

	# Credit Purchase Invoices: submitted today, outstanding > 0
	credit_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.outstanding_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date = %s
			AND pi.outstanding_amount > 0
		ORDER BY pi.outstanding_amount DESC
	""", (report_date,), as_dict=True)
	total_credit_purchases = sum(float(inv["outstanding_amount"] or 0) for inv in credit_purchase_invoices)

	# Purchased items summary (for purchase-focused daily view)
	items_purchased = frappe.db.sql("""
		SELECT
			pii.item_code,
			pii.item_name,
			SUM(pii.qty) AS total_qty,
			CASE WHEN SUM(pii.qty) = 0 THEN 0 ELSE SUM(pii.amount) / SUM(pii.qty) END AS rate,
			SUM(pii.amount) AS total_amount
		FROM `tabPurchase Invoice Item` pii
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = pii.parent
		WHERE pi.docstatus = 1
			AND pi.posting_date = %s
		GROUP BY pii.item_code, pii.item_name
		ORDER BY total_qty DESC
	""", (report_date,), as_dict=True)

	# ---- POS / SALES OVERVIEW SECTION ----

	# Fetch all submitted Sales Invoices for the date
	# We exclude invoices that are explicitly linked to a Repair Order (already counted above)
	# This ensures Repair + Sales = Total Revenue
	all_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.outstanding_amount, si.is_pos, si.is_return, si.owner, si.customer,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 
			AND si.posting_date = %s
			AND ro.name IS NULL
	""", (report_date,), as_dict=True)

	total_retail_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 1 and inv["is_return"] == 0)
	total_b2b_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 0 and inv["is_return"] == 0)
	total_returns = sum(abs(inv["grand_total"]) for inv in all_sales_invoices if inv["is_return"] == 1)
	net_sales = (total_retail_sales + total_b2b_sales) - total_returns
	
	transaction_count = len([inv for inv in all_sales_invoices if inv["is_return"] == 0])
	sales_inv_names = [inv["name"] for inv in all_sales_invoices]

	# Payment method breakdown for all general sales
	payment_breakdown = []
	sales_payment_modes = {}
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total, COUNT(DISTINCT parent) as txn_count "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_rows = frappe.db.sql(
			f"SELECT parent, GROUP_CONCAT(DISTINCT mode_of_payment ORDER BY mode_of_payment SEPARATOR ', ') AS payment_modes "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY parent",
			tuple(sales_inv_names), as_dict=True
		)
		sales_payment_modes = {r["parent"]: (r.get("payment_modes") or "") for r in sales_payment_rows}

	# Items sold & Category Breakdown
	items_sold = []
	category_breakdown = []
	item_profit_summary = []
	item_group_profit_summary = []
	if sales_inv_names:
		placeholders = ", ".join(["%s"] * len(sales_inv_names))
		# Detailed items
		items_sold = frappe.db.sql(
			f"SELECT item_code, item_name, SUM(qty) as total_qty, "
			f"CASE WHEN SUM(qty) = 0 THEN 0 ELSE SUM(amount) / SUM(qty) END as rate, "
			f"SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY item_code, item_name ORDER BY total_qty DESC",
			tuple(sales_inv_names), as_dict=True
		)
		# Categorical summary
		category_breakdown = frappe.db.sql(
			f"SELECT item_group, SUM(qty) as total_qty, SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY item_group ORDER BY total_amount DESC",
			tuple(sales_inv_names), as_dict=True
		)

	# Item-wise profit summary should include ALL submitted Sales Invoices for the day
	# (both standalone sales and repair-linked invoices).
	profit_invoice_names = frappe.get_all(
		"Sales Invoice",
		filters={"docstatus": 1, "posting_date": report_date},
		pluck="name",
	)
	if profit_invoice_names:
		profit_placeholders = ", ".join(["%s"] * len(profit_invoice_names))
		has_last_purchase_rate = frappe.db.has_column("Item", "last_purchase_rate")
		last_purchase_component = ", NULLIF(i.last_purchase_rate, 0)" if has_last_purchase_rate else ""
		cogs_rate_expr = (
			"CASE WHEN i.is_stock_item = 1 "
			f"THEN COALESCE(NULLIF(sii.incoming_rate, 0), NULLIF(i.valuation_rate, 0){last_purchase_component}, 0) "
			"ELSE 0 END"
		)
		item_group_profit_summary = frappe.db.sql(
			f"""
			SELECT
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				SUM(sii.base_net_amount) AS sales_amount,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			GROUP BY COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

		item_profit_summary = frappe.db.sql(
			f"""
			SELECT
				sii.item_code,
				COALESCE(sii.item_name, sii.item_code) AS item_name,
				COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other') AS item_group,
				SUM(sii.qty) AS qty_sold,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.base_net_amount) / SUM(sii.qty) END AS selling_rate,
				SUM(sii.base_net_amount) AS sales_amount,
				CASE WHEN SUM(sii.qty) = 0 THEN 0 ELSE SUM(sii.qty * {cogs_rate_expr}) / SUM(sii.qty) END AS cogs_rate,
				SUM(sii.qty * {cogs_rate_expr}) AS cogs_amount,
				SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr}) AS gross_profit,
				CASE
					WHEN SUM(sii.base_net_amount) = 0 THEN 0
					ELSE ((SUM(sii.base_net_amount) - SUM(sii.qty * {cogs_rate_expr})) / SUM(sii.base_net_amount)) * 100
				END AS gross_margin_pct
			FROM `tabSales Invoice Item` sii
			LEFT JOIN `tabItem` i ON i.name = sii.item_code
			WHERE sii.parent IN ({profit_placeholders})
			GROUP BY sii.item_code, sii.item_name, COALESCE(NULLIF(sii.item_group, ''), i.item_group, 'Other')
			ORDER BY gross_profit DESC, sales_amount DESC
			""",
			tuple(profit_invoice_names),
			as_dict=True,
		)

	# Cashier / Staff Breakdown
	cashier_breakdown = []
	if all_sales_invoices:
		cashier_map = {}
		for inv in all_sales_invoices:
			owner = inv["owner"]
			if owner not in cashier_map:
				cashier_map[owner] = {"owner": owner, "total": 0.0, "count": 0}
			if inv["is_return"] == 0:
				cashier_map[owner]["total"] += float(inv["grand_total"])
				cashier_map[owner]["count"] += 1
			else:
				cashier_map[owner]["total"] -= float(abs(inv["grand_total"]))
		cashier_breakdown = sorted(cashier_map.values(), key=lambda x: x["total"], reverse=True)

	# Detailed sales and purchase entries for executive drill-down tables
	sales_entries = []
	for inv in all_sales_invoices:
		amount = float(inv.get("grand_total") or 0)
		outstanding = float(inv.get("outstanding_amount") or 0)
		if inv.get("is_return") == 1:
			payment_status = "Returned"
		elif outstanding <= 0:
			payment_status = "Paid"
		elif outstanding < amount:
			payment_status = "Partially Paid"
		else:
			payment_status = "Unpaid"

		sales_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("customer_name") or inv.get("customer") or "",
			"amount": amount,
			"payment_status": payment_status,
			"payment_mode": sales_payment_modes.get(inv.get("name"), "Credit" if outstanding > 0 else "N/A"),
			"source": "Sales Invoice",
		})

	purchase_entries = []
	for p in pe_purchases:
		purchase_entries.append({
			"id": p.get("name"),
			"party_name": p.get("party_name") or p.get("party") or "",
			"amount": float(p.get("amount") or 0),
			"payment_status": "Paid",
			"payment_mode": p.get("mode_of_payment") or "",
			"source": "Payment Entry",
		})

	for inv in credit_purchase_invoices:
		outstanding = float(inv.get("outstanding_amount") or 0)
		grand_total = float(inv.get("grand_total") or 0)
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": outstanding,
			"payment_status": "Partially Paid" if (grand_total > 0 and outstanding < grand_total) else "Unpaid",
			"payment_mode": "Credit",
			"source": "Purchase Invoice",
		})

	for inv in paid_purchase_invoices:
		purchase_entries.append({
			"id": inv.get("name"),
			"party_name": inv.get("supplier_name") or inv.get("supplier") or "",
			"amount": float(inv.get("grand_total") or 0),
			"payment_status": "Paid",
			"payment_mode": inv.get("cash_bank_account") or "Cash",
			"source": "Purchase Invoice",
		})

	return {
		"date": report_date,
		"repair": {
			"received_count": len(received_orders),
			"received_orders": received_orders,
			"completed_count": len(completed_orders),
			"completed_orders": completed_orders,
			"pending_count": pending_count,
			"inprogress_count": inprogress_count,
			"revenue": repair_revenue,
			"invoice_count": repair_invoice_count,
			"technician_tasks": technician_tasks,
			"top_issues": top_issues,
			"parts_used": parts_used,
		},
		"pos": {
			"total_sales": total_retail_sales + total_b2b_sales,
			"total_retail_sales": total_retail_sales,
			"total_b2b_sales": total_b2b_sales,
			"total_returns": total_returns,
			"net_sales": net_sales,
			"transaction_count": transaction_count,
			"payment_breakdown": payment_breakdown,
			"items_sold": items_sold,
			"category_breakdown": category_breakdown,
			"cashier_breakdown": cashier_breakdown,
		},
		"financial": {
			"total_expenses": total_expenses,
			"expense_breakdown": expense_breakdown,
			"expense_entries": expense_entries,
			"repair_payment_breakdown": repair_payment_breakdown,
			# Payment Entries overview (Receive + Pay)
			"pe_entries": pe_all,
			"pe_receive": pe_receive,
			"pe_pay": pe_pay_all,
			"total_pe_received": total_pe_received,
			"total_pe_paid": total_pe_paid,
			"net_pe_cash": net_pe_cash,
			"pe_receive_by_mode": pe_receive_by_mode,
			"pe_pay_by_mode": pe_pay_by_mode,
			# Purchase vs Operating split
			"pe_purchases": pe_purchases,
			"pe_operating": pe_operating,
			"total_pe_purchases": total_pe_purchases,
			"total_pe_operating": total_pe_operating,
			"pe_purchases_by_mode": pe_purchases_by_mode,
			"pe_operating_by_mode": pe_operating_by_mode,
			# Journal Entry detail
			"je_entries": je_detail_rows,
			"je_count": je_count,
			"je_total": je_total,
			"je_by_mode": je_by_mode,
			# Customer collections against credit invoices
			"pe_customer_collections": pe_customer_collections,
			"total_customer_collections": total_customer_collections,
			# Credit invoices
			"credit_sales_invoices": credit_sales_invoices,
			"total_credit_sales": total_credit_sales,
			"credit_purchase_invoices": credit_purchase_invoices,
			"total_credit_purchases": total_credit_purchases,
			"paid_purchase_invoices": paid_purchase_invoices,
			"total_paid_purchases": total_paid_purchases,
			"paid_purchases_by_mode": paid_purchases_by_mode,
			"items_purchased": items_purchased,
			"item_group_profit_summary": item_group_profit_summary if is_executive else [],
			"item_profit_summary": item_profit_summary if is_executive else [],
			"sales_entries": sales_entries,
			"purchase_entries": purchase_entries,
		}
	}
