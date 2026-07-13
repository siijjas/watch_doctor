# Copyright (c) 2026, Watch Doctor and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from watch_doctor.pms import CF_HAS_PMS, CF_IS_PMS, CF_PMS_MARGIN, CF_PMS_PURCHASE_COST, CF_PMS_VAT


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
		{"label": _("Item Code"), "fieldname": "item_code", "fieldtype": "Link", "options": "Item", "width": 120},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 160},
		{"label": _("Selling Price"), "fieldname": "selling_price", "fieldtype": "Currency", "width": 110},
		{"label": _("Purchase Cost"), "fieldname": "purchase_cost", "fieldtype": "Currency", "width": 110},
		{"label": _("Margin"), "fieldname": "margin", "fieldtype": "Currency", "width": 100},
		{"label": _("VAT Amount"), "fieldname": "vat_amount", "fieldtype": "Currency", "width": 100},
		{"label": _("Net Sales (Excl. VAT)"), "fieldname": "net_sales", "fieldtype": "Currency", "width": 140},
		{"label": _("Currency"), "fieldname": "currency", "fieldtype": "Data", "width": 80},
	]


def get_data(filters):
	conditions = ["si.docstatus = 1", f"si.{CF_HAS_PMS} = 1", f"sii.{CF_IS_PMS} = 1"]

	if filters.company:
		conditions.append("si.company = %(company)s")

	if filters.customer:
		conditions.append("si.customer = %(customer)s")

	if filters.from_date:
		conditions.append("si.posting_date >= %(from_date)s")

	if filters.to_date:
		conditions.append("si.posting_date <= %(to_date)s")

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
			si.return_against,
			sii.item_code,
			sii.item_name,
			sii.amount AS selling_price,
			sii.{CF_PMS_PURCHASE_COST} AS purchase_cost,
			sii.{CF_PMS_MARGIN} AS margin,
			sii.{CF_PMS_VAT} AS vat_amount
		FROM `tabSales Invoice Item` sii
		INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
		WHERE {where_clause}
		ORDER BY si.posting_date, si.name
		""",
		filters,
		as_dict=True,
	)

	_mirror_return_vat(rows)

	for row in rows:
		row["net_sales"] = float(row["selling_price"] or 0) - float(row["vat_amount"] or 0)
		row.pop("is_return", None)
		row.pop("return_against", None)

	return rows


def _mirror_return_vat(rows):
	"""
	Backfill for return invoices submitted before the pms.py fix that made si_validate
	compute return VAT correctly (as the negated original sale's VAT). Those older
	documents have dw_pms_vat/dw_pms_margin stuck at 0 — the old calculation treated
	the negative selling price against a (always positive) purchase cost as "sold
	below cost". Invoices submitted after the fix already carry the correct (nonzero)
	values, so we only recompute here when the stored VAT is still exactly 0.

	Since this is display-only (no invoice data or GL entries are touched), we
	recompute purchase_cost/margin/vat_amount for those rows by finding the original
	PMS sale line and negating it. Items are qty=1 unique serialized watches, so
	matching by item_code is unambiguous.
	"""
	return_rows = [r for r in rows if r.get("is_return") and not r.get("vat_amount")]
	if not return_rows:
		return

	# Attempt 1: exact match via return_against, when the credit note was created
	# through the standard "Create > Return" flow that links it to its source invoice.
	linked_rows = [r for r in return_rows if r.get("return_against")]
	if linked_rows:
		parents = list({r["return_against"] for r in linked_rows})
		placeholders = ", ".join(["%s"] * len(parents))
		originals = frappe.db.sql(
			f"""
			SELECT parent, item_code, {CF_PMS_PURCHASE_COST} AS purchase_cost,
				{CF_PMS_MARGIN} AS margin, {CF_PMS_VAT} AS vat_amount
			FROM `tabSales Invoice Item`
			WHERE parent IN ({placeholders}) AND {CF_IS_PMS} = 1
			""",
			tuple(parents),
			as_dict=True,
		)
		original_map = {(o["parent"], o["item_code"]): o for o in originals}
		for row in linked_rows:
			original = original_map.get((row["return_against"], row["item_code"]))
			if original:
				row["_pms_original"] = original

	# Attempt 2: no return_against link (the common case in this shop's data — credit
	# notes are entered standalone, not via the linked Return flow). Fall back to the
	# most recent non-return PMS sale of the same item_code on or before the return's
	# posting date — the sale this credit note is reversing.
	for row in return_rows:
		if row.get("_pms_original"):
			continue
		original = frappe.db.sql(
			f"""
			SELECT sii.{CF_PMS_PURCHASE_COST} AS purchase_cost,
				sii.{CF_PMS_MARGIN} AS margin, sii.{CF_PMS_VAT} AS vat_amount
			FROM `tabSales Invoice Item` sii
			INNER JOIN `tabSales Invoice` si ON sii.parent = si.name
			WHERE sii.item_code = %(item_code)s AND sii.{CF_IS_PMS} = 1
				AND si.docstatus = 1 AND si.is_return = 0
				AND si.posting_date <= %(posting_date)s
				AND si.name != %(invoice)s
			ORDER BY si.posting_date DESC, si.creation DESC
			LIMIT 1
			""",
			{
				"item_code": row["item_code"],
				"posting_date": row["posting_date"],
				"invoice": row["invoice"],
			},
			as_dict=True,
		)
		if original:
			row["_pms_original"] = original[0]

	for row in return_rows:
		original = row.pop("_pms_original", None)
		if not original:
			continue
		row["purchase_cost"] = -float(original["purchase_cost"] or 0)
		row["margin"] = -float(original["margin"] or 0)
		row["vat_amount"] = -float(original["vat_amount"] or 0)
