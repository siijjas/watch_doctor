# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from watch_doctor.pms import CF_HAS_PMS, CF_PMS_TOTAL_VAT


def execute(filters=None):
	filters = frappe._dict(filters or {})
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": _("Invoice"), "fieldname": "invoice", "fieldtype": "Link", "options": "Sales Invoice", "width": 130},
		{"label": _("Posting Date"), "fieldname": "posting_date", "fieldtype": "Date", "width": 100},
		{"label": _("Customer"), "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 130},
		{"label": _("Customer Name"), "fieldname": "customer_name", "fieldtype": "Data", "width": 160},
		{"label": _("Customer TRN"), "fieldname": "tax_id", "fieldtype": "Data", "width": 120},
		{"label": _("Is PMS"), "fieldname": "is_pms", "fieldtype": "Data", "width": 80},
		{"label": _("Is Return"), "fieldname": "is_return", "fieldtype": "Data", "width": 90},
		{"label": _("Net Total"), "fieldname": "net_total", "fieldtype": "Currency", "width": 110},
		{"label": _("VAT Amount"), "fieldname": "vat_amount", "fieldtype": "Currency", "width": 100},
		{"label": _("Grand Total"), "fieldname": "grand_total", "fieldtype": "Currency", "width": 120},
		{"label": _("Currency"), "fieldname": "currency", "fieldtype": "Data", "width": 80},
		{"label": _("Payment Status"), "fieldname": "payment_status", "fieldtype": "Data", "width": 100},
		{"label": _("Mode of Payment"), "fieldname": "mode_of_payment", "fieldtype": "Data", "width": 140},
	]


def get_data(filters):
	conditions = ["si.docstatus = 1"]

	if filters.company:
		conditions.append("si.company = %(company)s")

	if filters.customer:
		conditions.append("si.customer = %(customer)s")

	if filters.from_date:
		conditions.append("si.posting_date >= %(from_date)s")

	if filters.to_date:
		conditions.append("si.posting_date <= %(to_date)s")

	if filters.is_pms == "Yes":
		conditions.append(f"si.{CF_HAS_PMS} = 1")
	elif filters.is_pms == "No":
		conditions.append(f"(si.{CF_HAS_PMS} = 0 OR si.{CF_HAS_PMS} IS NULL)")

	where_clause = " AND ".join(conditions)

	rows = frappe.db.sql(
		f"""
		SELECT
			si.name AS invoice,
			si.posting_date,
			si.customer,
			si.customer_name,
			si.tax_id,
			si.currency,
			si.is_return,
			si.{CF_HAS_PMS} AS has_pms,
			si.net_total,
			si.total_taxes_and_charges,
			si.{CF_PMS_TOTAL_VAT} AS pms_total_vat,
			si.grand_total,
			si.status AS payment_status
		FROM `tabSales Invoice` si
		WHERE {where_clause}
		ORDER BY si.posting_date, si.name
		""",
		filters,
		as_dict=True,
	)

	for row in rows:
		row["is_pms"] = _("Yes") if row.pop("has_pms") else _("No")
		row["is_return"] = _("Yes") if row.pop("is_return") else _("No")
		row["vat_amount"] = float(row.pop("total_taxes_and_charges") or 0) + float(row.pop("pms_total_vat") or 0)

	invoice_names = [row["invoice"] for row in rows]
	payment_modes = _get_payment_modes(invoice_names)
	for row in rows:
		row["mode_of_payment"] = payment_modes.get(row["invoice"], "")

	return rows


def _get_payment_modes(invoice_names):
	"""Map invoice name -> comma-separated modes of payment, combining immediate POS
	payments (`Sales Invoice Payment`) with later bank/cash reconciliations
	(`Payment Entry` via `Payment Entry Reference`) — a non-POS invoice has no
	`Sales Invoice Payment` row at all, and a POS invoice can also be topped up by a
	separate Payment Entry, so neither source alone is complete."""
	if not invoice_names:
		return {}

	placeholders = ", ".join(["%s"] * len(invoice_names))
	modes_by_invoice = {}

	pos_rows = frappe.db.sql(
		f"""
		SELECT parent, GROUP_CONCAT(DISTINCT mode_of_payment ORDER BY mode_of_payment SEPARATOR ', ') AS modes
		FROM `tabSales Invoice Payment`
		WHERE parent IN ({placeholders}) AND mode_of_payment IS NOT NULL AND mode_of_payment != ''
		GROUP BY parent
		""",
		tuple(invoice_names),
		as_dict=True,
	)
	for r in pos_rows:
		modes_by_invoice[r["parent"]] = {m.strip() for m in r["modes"].split(",")}

	pe_rows = frappe.db.sql(
		f"""
		SELECT per.reference_name AS invoice, pe.mode_of_payment AS mode
		FROM `tabPayment Entry Reference` per
		INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
		WHERE per.reference_doctype = 'Sales Invoice'
			AND per.reference_name IN ({placeholders})
			AND pe.docstatus = 1
			AND pe.mode_of_payment IS NOT NULL AND pe.mode_of_payment != ''
		""",
		tuple(invoice_names),
		as_dict=True,
	)
	for r in pe_rows:
		modes_by_invoice.setdefault(r["invoice"], set()).add(r["mode"])

	return {invoice: ", ".join(sorted(modes)) for invoice, modes in modes_by_invoice.items()}
