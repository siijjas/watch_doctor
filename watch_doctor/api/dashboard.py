"""Dashboard/reporting endpoints split from watch_doctor/api.py (API_PY_AUDIT.md item 5)."""

import frappe
from frappe import _  # noqa: F401

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE, ROLE_DATA_ENTRY


@frappe.whitelist()
def get_dashboard_stats(days: int = 7):
	"""Get summary statistics for dashboard KPI cards."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	from datetime import timedelta
	from frappe.utils import getdate, nowdate

	today = getdate(nowdate())
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
	from datetime import timedelta
	from frappe.utils import getdate, nowdate

	today = getdate(nowdate())
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
def get_outstanding_invoices(days_overdue: int = 0):
	"""Return submitted Sales Invoices with outstanding (unpaid) amounts.

	Args:
		days_overdue: Only include invoices at least this many days old (0 = all outstanding).
	"""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	rows = frappe.db.sql(
		"""
		SELECT
			si.name,
			si.customer,
			c.customer_name,
			c.mobile_no,
			si.grand_total,
			si.outstanding_amount,
			si.posting_date,
			DATEDIFF(CURDATE(), si.posting_date) AS days_outstanding,
			ro.name AS repair_order
		FROM `tabSales Invoice` si
		LEFT JOIN `tabCustomer` c ON c.name = si.customer
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
		  AND si.outstanding_amount > 0
		  AND DATEDIFF(CURDATE(), si.posting_date) >= %s
		ORDER BY si.posting_date ASC
		""",
		(int(days_overdue),),
		as_dict=True,
	)
	return rows


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
