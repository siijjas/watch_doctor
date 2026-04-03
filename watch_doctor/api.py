import frappe
from frappe import _  # noqa: F401
import json

@frappe.whitelist()
def save_repair_order(doc_json):
	"""Custom save method for repair orders that handles system fields properly."""
	doc_dict = json.loads(doc_json) if isinstance(doc_json, str) else doc_json
	
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
	orders = frappe.get_all(
		"DW Repair Order",
		fields=["name", "customer", "status", "priority", "received_date"],
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
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})
	
	invoice.insert()
	
	# Update payment amount to match grand_total after insert (which calculates taxes/discount etc)
	if invoice.payments and len(invoice.payments) > 0:
		invoice.payments[0].amount = invoice.grand_total
		invoice.save()
	
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
	
	# Add items
	for item in items:
		invoice.append("items", {
			"item_code": item.get("item_code"),
			"qty": item.get("qty", 1),
			"rate": item.get("rate", 0)
		})
	
	invoice.insert()
	frappe.db.commit()
	
	return {
		"invoice_name": invoice.name,
		"grand_total": invoice.grand_total,
		"customer": customer
	}


@frappe.whitelist()
def get_pos_drafts(limit: int = 20):
	"""Get draft POS invoices (held orders)."""
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
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
	
	if invoice.docstatus != 0:
		frappe.throw("Can only delete draft invoices")
	
	frappe.delete_doc("Sales Invoice", invoice_name)
	frappe.db.commit()
	
	return {"success": True}


@frappe.whitelist()
def submit_pos_draft(invoice_name: str, payment_mode: str = "Cash", discount_percent: float = 0):
	"""Submit a draft POS invoice with payment."""
	invoice = frappe.get_doc("Sales Invoice", invoice_name)
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
	
	invoice.save()
	
	# Update payment amount after save
	if invoice.payments and len(invoice.payments) > 0:
		invoice.payments[-1].amount = invoice.grand_total
		invoice.save()
	
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
	import datetime
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

	# Get active payment modes configured in scope
	active_modes = frappe.db.sql("""
		SELECT payment_mode
		FROM `tabDW Payment Mode Config`
		WHERE is_active = 1
	""", as_dict=True)
	active_mode_names = [m["payment_mode"] for m in active_modes]

	expense_entries = []

	if active_mode_names:
		pm_placeholders = ", ".join(["%s"] * len(active_mode_names))

		# 1) Payment Entry expenses — outgoing payments on configured modes
		pe_rows = frappe.db.sql(
			f"""SELECT
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
				AND pe.mode_of_payment IN ({pm_placeholders})
			ORDER BY pe.creation ASC""",
			tuple([report_date] + active_mode_names),
			as_dict=True
		)
		expense_entries.extend(pe_rows)

		# 2) Journal Entry debits — credit on payment-mode accounts = cash out
		default_company = frappe.defaults.get_defaults().get("company")
		mode_account_rows = frappe.db.sql(
			f"""SELECT mopa.default_account, mop.name AS mode_of_payment
			FROM `tabMode of Payment Account` mopa
			INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
			WHERE mop.name IN ({pm_placeholders})
				AND (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
			tuple(active_mode_names + [default_company or ""]),
			as_dict=True
		)
		account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}
		payment_accounts = list(account_to_mode.keys())

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
			expense_entries.extend(je_rows)

	# Aggregate by payment mode
	mode_expense_map = {}
	for e in expense_entries:
		mode = e.get("mode_of_payment", "Other")
		if mode not in mode_expense_map:
			mode_expense_map[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		mode_expense_map[mode]["total"] += float(e.get("amount") or 0)
		mode_expense_map[mode]["count"] += 1

	expense_breakdown = sorted(mode_expense_map.values(), key=lambda x: x["total"], reverse=True)
	total_expenses = sum(b["total"] for b in expense_breakdown)

	# ---- POS SECTION ----

	# Submitted POS invoices on report_date
	pos_invoices = frappe.db.sql("""
		SELECT name, grand_total, customer
		FROM `tabSales Invoice`
		WHERE is_pos = 1 AND docstatus = 1 AND posting_date = %s
	""", (report_date,), as_dict=True)

	pos_total = sum(inv["grand_total"] for inv in pos_invoices)
	pos_count = len(pos_invoices)
	pos_invoice_names = [inv["name"] for inv in pos_invoices]

	# Payment method breakdown
	payment_breakdown = []
	if pos_invoice_names:
		placeholders = ", ".join(["%s"] * len(pos_invoice_names))
		payment_rows = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total, COUNT(DISTINCT parent) as txn_count "
			f"FROM `tabSales Invoice Payment` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(pos_invoice_names), as_dict=True
		)
		payment_breakdown = payment_rows

	# Items sold
	items_sold = []
	if pos_invoice_names:
		placeholders = ", ".join(["%s"] * len(pos_invoice_names))
		item_rows = frappe.db.sql(
			f"SELECT item_code, item_name, SUM(qty) as total_qty, SUM(amount) as total_amount "
			f"FROM `tabSales Invoice Item` "
			f"WHERE parent IN ({placeholders}) "
			f"GROUP BY item_code, item_name ORDER BY total_qty DESC",
			tuple(pos_invoice_names), as_dict=True
		)
		items_sold = item_rows

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
			"total_sales": pos_total,
			"transaction_count": pos_count,
			"payment_breakdown": payment_breakdown,
			"items_sold": items_sold,
		},
		"financial": {
			"total_expenses": total_expenses,
			"expense_breakdown": expense_breakdown,
			"expense_entries": expense_entries,
			"repair_payment_breakdown": repair_payment_breakdown,
		}
	}
