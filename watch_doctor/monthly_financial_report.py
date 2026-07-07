"""
Monthly Financial Report — the daily "Financial Summary" report (see get_daily_report
in api.py: cash position reconstructed from GL Entry, Payment Entry and Journal Entry,
handling internal cash<->cash transfers and mixed-mode JE splits), aggregated across
an arbitrary date range instead of a single day.

Entry-level detail (every Payment/Journal Entry, every internal transfer voucher) is
capped to the TOP_N highest-value rows instead of dumped in full — for a month that
list can run into the hundreds and stops being useful. Aggregated by-mode/by-account
breakdowns are kept in full since they are always small (bounded by the number of
payment modes / cash-bank accounts, not by transaction volume). Outstanding (unpaid)
invoices are always shown in full, uncapped, since nothing owed should be hidden
behind a value cutoff.
"""

import frappe

from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE

TOP_N = 20


def _mode_breakdown_dicts(rows):
	m = {}
	for r in rows:
		mode = r.get("mode_of_payment") or "Other"
		if mode not in m:
			m[mode] = {"mode_of_payment": mode, "total": 0.0, "count": 0}
		m[mode]["total"] += float(r.get("amount") or 0)
		m[mode]["count"] += 1
	return sorted(m.values(), key=lambda x: x["total"], reverse=True)


@frappe.whitelist()
def get_monthly_financial_report(from_date, to_date):
	"""Aggregate the daily Financial Summary's cash-position reconstruction across
	[from_date, to_date]."""
	require_roles(ROLE_EXECUTIVE)

	default_company = frappe.defaults.get_defaults().get("company")

	# ---- Revenue streams (for the Total Income breakdown) ----
	repair_revenue_rows = frappe.db.sql("""
		SELECT si.grand_total
		FROM `tabSales Invoice` si
		INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s
	""", (from_date, to_date), as_dict=True)
	repair_revenue = sum(r["grand_total"] for r in repair_revenue_rows)

	all_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.grand_total, si.outstanding_amount, si.is_pos, si.is_return, si.customer,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		LEFT JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name
		WHERE si.docstatus = 1
			AND si.posting_date BETWEEN %s AND %s
			AND ro.name IS NULL
	""", (from_date, to_date), as_dict=True)
	total_retail_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 1 and inv["is_return"] == 0)
	total_b2b_sales = sum(inv["grand_total"] for inv in all_sales_invoices if inv["is_pos"] == 0 and inv["is_return"] == 0)
	total_returns = sum(abs(inv["grand_total"]) for inv in all_sales_invoices if inv["is_return"] == 1)
	return_invoice_names = [inv["name"] for inv in all_sales_invoices if inv["is_return"] == 1]
	return_invoice_customers = {inv["name"]: (inv.get("customer_name") or inv.get("customer") or "") for inv in all_sales_invoices}

	sales_inv_names = [inv["name"] for inv in all_sales_invoices]
	repair_payment_breakdown = []
	if repair_revenue_rows:
		ri_names = frappe.db.sql_list(
			"SELECT si.name FROM `tabSales Invoice` si "
			"INNER JOIN `tabDW Repair Order` ro ON ro.sales_invoice = si.name "
			"WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s",
			(from_date, to_date),
		)
		if ri_names:
			ri_ph = ", ".join(["%s"] * len(ri_names))
			repair_payment_breakdown = frappe.db.sql(
				f"SELECT mode_of_payment, SUM(amount) as total FROM `tabSales Invoice Payment` "
				f"WHERE parent IN ({ri_ph}) GROUP BY mode_of_payment ORDER BY total DESC",
				tuple(ri_names), as_dict=True,
			)

	sales_payment_breakdown = []
	if sales_inv_names:
		si_ph = ", ".join(["%s"] * len(sales_inv_names))
		sales_payment_breakdown = frappe.db.sql(
			f"SELECT mode_of_payment, SUM(amount) as total, COUNT(DISTINCT parent) as txn_count "
			f"FROM `tabSales Invoice Payment` WHERE parent IN ({si_ph}) "
			f"GROUP BY mode_of_payment ORDER BY total DESC",
			tuple(sales_inv_names), as_dict=True,
		)

	# ---- Mode-of-payment -> GL account map ----
	mode_account_rows = frappe.db.sql(
		"""SELECT mopa.default_account, mop.name AS mode_of_payment
		FROM `tabMode of Payment Account` mopa
		INNER JOIN `tabMode of Payment` mop ON mopa.parent = mop.name
		WHERE (mopa.company = %s OR mopa.company IS NULL OR mopa.company = '')""",
		(default_company or "",), as_dict=True,
	)
	account_to_mode = {r["default_account"]: r["mode_of_payment"] for r in mode_account_rows}
	payment_accounts = list(account_to_mode.keys())

	# ---- Journal Entry credits/debits on cash/bank accounts ----
	je_detail_rows = []
	je_receipt_rows = []
	if payment_accounts:
		pa_ph = ", ".join(["%s"] * len(payment_accounts))

		je_credit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.credit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name AND jea2.debit_in_account_currency > 0
				 LIMIT 1) AS debit_account,
				(SELECT COALESCE(SUM(jea3.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name AND jea3.debit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_ph})) AS external_debit_amount,
				(SELECT COALESCE(SUM(jea4.debit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name AND jea4.debit_in_account_currency > 0
				   AND jea4.account IN ({pa_ph})) AS internal_debit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date BETWEEN %s AND %s
				AND jea.account IN ({pa_ph})
				AND jea.credit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [from_date, to_date] + payment_accounts),
			as_dict=True,
		)
		for row in je_credit_rows:
			mode = account_to_mode.get(row["account"], row["account"])
			ext_dr = float(row.get("external_debit_amount") or 0)
			int_dr = float(row.get("internal_debit_amount") or 0)
			total_dr = ext_dr + int_dr
			ext_fraction = (ext_dr / total_dr) if total_dr > 0 else 0.0
			amount = float(row["amount"] or 0)
			expense_amt = amount * ext_fraction
			if expense_amt > 0:
				je_detail_rows.append({
					"name": row["name"],
					"mode_of_payment": mode,
					"against_account": row.get("debit_account") or "",
					"amount": expense_amt,
					"remarks": row.get("remarks") or "",
				})

		je_debit_rows = frappe.db.sql(
			f"""SELECT
				je.name,
				jea.account,
				jea.debit_in_account_currency AS amount,
				COALESCE(jea.user_remark, je.user_remark, '') AS remarks,
				(SELECT GROUP_CONCAT(DISTINCT jea2.account ORDER BY jea2.idx SEPARATOR ', ')
				 FROM `tabJournal Entry Account` jea2
				 WHERE jea2.parent = je.name AND jea2.credit_in_account_currency > 0
				 LIMIT 1) AS credit_account,
				(SELECT COALESCE(SUM(jea3.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea3
				 WHERE jea3.parent = je.name AND jea3.credit_in_account_currency > 0
				   AND jea3.account NOT IN ({pa_ph})) AS external_credit_amount,
				(SELECT COALESCE(SUM(jea4.credit_in_account_currency), 0)
				 FROM `tabJournal Entry Account` jea4
				 WHERE jea4.parent = je.name AND jea4.credit_in_account_currency > 0
				   AND jea4.account IN ({pa_ph})) AS internal_credit_amount
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1
				AND je.posting_date BETWEEN %s AND %s
				AND jea.account IN ({pa_ph})
				AND jea.debit_in_account_currency > 0
			ORDER BY je.creation ASC""",
			tuple(payment_accounts * 2 + [from_date, to_date] + payment_accounts),
			as_dict=True,
		)
		for row in je_debit_rows:
			mode = account_to_mode.get(row["account"], row["account"])
			ext_cr = float(row.get("external_credit_amount") or 0)
			int_cr = float(row.get("internal_credit_amount") or 0)
			total_cr = ext_cr + int_cr
			ext_fraction = (ext_cr / total_cr) if total_cr > 0 else 0.0
			amount = float(row["amount"] or 0)
			external_amount = amount * ext_fraction
			je_receipt_rows.append({
				"name": row["name"],
				"mode_of_payment": mode,
				"against_account": row.get("credit_account") or "",
				"amount": amount,
				"external_amount": external_amount,
				"remarks": row.get("remarks") or "",
			})

	je_count = len(je_detail_rows)
	je_total = sum(r["amount"] for r in je_detail_rows)
	je_by_mode = _mode_breakdown_dicts(je_detail_rows)
	je_receipt_total = sum(r.get("external_amount", 0) for r in je_receipt_rows)
	_je_ext_mode = {}
	for _r in je_receipt_rows:
		_ext = _r.get("external_amount", 0)
		if _ext <= 0:
			continue
		_m = _r["mode_of_payment"]
		if _m not in _je_ext_mode:
			_je_ext_mode[_m] = {"mode_of_payment": _m, "total": 0.0, "count": 0}
		_je_ext_mode[_m]["total"] += _ext
		_je_ext_mode[_m]["count"] += 1
	je_receipt_by_mode = sorted(_je_ext_mode.values(), key=lambda x: x["total"], reverse=True)

	def _account_to_payment_mode(acct):
		return account_to_mode.get(acct) or acct or "Cash"

	# ---- Paid purchase invoices (is_paid = 1) ----
	paid_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.paid_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name,
			COALESCE(pi.cash_bank_account, '') AS cash_bank_account
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s AND pi.is_paid = 1
		ORDER BY pi.grand_total DESC
	""", (from_date, to_date), as_dict=True)
	for inv in paid_purchase_invoices:
		pa = inv.get("paid_amount")
		inv["cash_paid"] = float(pa if pa not in (None, 0) else (inv.get("grand_total") or 0))
	total_paid_purchases = sum(inv["cash_paid"] for inv in paid_purchase_invoices)

	# ---- Payment Entries overview (Receive + Pay) ----
	pe_all = frappe.db.sql("""
		SELECT
			pe.name, pe.payment_type, pe.mode_of_payment, pe.party_type, pe.party,
			COALESCE(pe.party_name, '') AS party_name,
			pe.paid_amount AS amount,
			COALESCE(pe.remarks, '') AS remarks
		FROM `tabPayment Entry` pe
		WHERE pe.docstatus = 1 AND pe.posting_date BETWEEN %s AND %s
		ORDER BY pe.payment_type DESC, pe.creation ASC
	""", (from_date, to_date), as_dict=True)
	pe_receive = [p for p in pe_all if p["payment_type"] == "Receive"]
	pe_pay_all = [p for p in pe_all if p["payment_type"] == "Pay"]

	pe_purchases = [p for p in pe_pay_all if p.get("party_type") == "Supplier"]
	pe_operating = [p for p in pe_pay_all if p.get("party_type") != "Supplier"]
	total_pe_purchases = sum(float(p["amount"] or 0) for p in pe_purchases)
	total_pe_operating = sum(float(p["amount"] or 0) for p in pe_operating)
	pe_purchases_by_mode = _mode_breakdown_dicts(pe_purchases)
	pe_operating_by_mode = _mode_breakdown_dicts(pe_operating)

	# ---- Customer collections (PE Receive against credit Sales Invoices posted BEFORE this period) ----
	pe_customer_collections = []
	for p in pe_receive:
		if p.get("party_type") != "Customer":
			continue
		refs = frappe.db.sql("""
			SELECT per.reference_name, per.allocated_amount, si.posting_date
			FROM `tabPayment Entry Reference` per INNER JOIN `tabSales Invoice` si ON si.name = per.reference_name
			WHERE per.parent = %s AND per.reference_doctype = 'Sales Invoice'
		""", (p["name"],), as_dict=True)
		if refs:
			for ref in refs:
				# Skip settlements of invoices posted within this same period: their paid
				# portion is already reflected in this period's sales figure (grand_total
				# minus outstanding). Only prior-period receivable collections are new income.
				if ref["posting_date"] and frappe.utils.getdate(ref["posting_date"]) >= frappe.utils.getdate(from_date):
					continue
				pe_customer_collections.append({
					"pe_name": p["name"],
					"customer_name": p.get("party_name") or p.get("party") or "",
					"invoice": ref["reference_name"],
					"amount": float(ref["allocated_amount"] or 0),
					"mode_of_payment": p.get("mode_of_payment") or "",
				})
		else:
			pe_customer_collections.append({
				"pe_name": p["name"],
				"customer_name": p.get("party_name") or p.get("party") or "",
				"invoice": "",
				"amount": float(p.get("amount") or 0),
				"mode_of_payment": p.get("mode_of_payment") or "",
			})
	total_customer_collections = sum(c["amount"] for c in pe_customer_collections)

	pe_other_receipts = [p for p in pe_receive if p.get("party_type") != "Customer"]
	total_other_receipts = sum(float(p.get("amount") or 0) for p in pe_other_receipts)

	# ---- Credit invoices outstanding (submitted within this period, still owing) ----
	credit_sales_invoices = frappe.db.sql("""
		SELECT si.name, si.customer, si.grand_total, si.outstanding_amount,
			COALESCE(si.customer_name, '') AS customer_name
		FROM `tabSales Invoice` si
		WHERE si.docstatus = 1 AND si.posting_date BETWEEN %s AND %s
			AND si.outstanding_amount > 0
		ORDER BY si.outstanding_amount DESC
	""", (from_date, to_date), as_dict=True)
	total_credit_sales = sum(float(inv["outstanding_amount"] or 0) for inv in credit_sales_invoices)

	credit_purchase_invoices = frappe.db.sql("""
		SELECT pi.name, pi.supplier, pi.grand_total, pi.outstanding_amount,
			COALESCE(pi.supplier_name, '') AS supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE pi.docstatus = 1 AND pi.posting_date BETWEEN %s AND %s
			AND pi.outstanding_amount > 0
		ORDER BY pi.outstanding_amount DESC
	""", (from_date, to_date), as_dict=True)
	total_credit_purchases = sum(float(inv["outstanding_amount"] or 0) for inv in credit_purchase_invoices)

	# ---- GL-based cash position (ground truth) ----
	cash_bank_accounts = frappe.db.sql("""
		SELECT name FROM `tabAccount`
		WHERE is_group = 0
		  AND company = %s
		  AND (account_type IN ('Cash', 'Bank') OR name IN (
				SELECT mopa.default_account
				FROM `tabMode of Payment Account` mopa
				WHERE mopa.default_account IS NOT NULL AND mopa.default_account != ''
		  ))
	""", (default_company,), pluck="name")

	gl_total_cash_in = 0.0
	gl_total_cash_out = 0.0
	gl_account_summary = []
	if cash_bank_accounts:
		cb_ph = ", ".join(["%s"] * len(cash_bank_accounts))
		gl_rows = frappe.db.sql(
			f"""SELECT
				gle.account,
				SUM(gle.debit) AS total_debit,
				SUM(gle.credit) AS total_credit
			FROM `tabGL Entry` gle
			WHERE gle.posting_date BETWEEN %s AND %s
			  AND gle.docstatus = 1
			  AND gle.is_cancelled = 0
			  AND gle.account IN ({cb_ph})
			GROUP BY gle.account
			ORDER BY (SUM(gle.debit) + SUM(gle.credit)) DESC""",
			tuple([from_date, to_date] + list(cash_bank_accounts)),
			as_dict=True,
		)
		for row in gl_rows:
			d = float(row.get("total_debit") or 0)
			c = float(row.get("total_credit") or 0)
			gl_total_cash_in += d
			gl_total_cash_out += c
			gl_account_summary.append({"account": row["account"], "total_debit": d, "total_credit": c, "net": d - c})

	_gl_mode_map = {}
	for _row in gl_account_summary:
		_mode = account_to_mode.get(_row["account"]) or _row["account"]
		if _mode not in _gl_mode_map:
			_gl_mode_map[_mode] = {"mode_of_payment": _mode, "total_debit": 0.0, "total_credit": 0.0, "net": 0.0}
		_gl_mode_map[_mode]["total_debit"] += _row["total_debit"]
		_gl_mode_map[_mode]["total_credit"] += _row["total_credit"]
		_gl_mode_map[_mode]["net"] += _row["net"]
	gl_mode_summary = sorted(_gl_mode_map.values(), key=lambda x: abs(x["total_debit"] + x["total_credit"]), reverse=True)

	# ---- Internal transfers (cash <-> cash), excluded from income/expense ----
	cash_bank_set = set(cash_bank_accounts)
	transfer_mode_in = {}
	transfer_mode_out = {}
	internal_transfers = []
	gl_transfer_total = 0.0
	if cash_bank_set:
		_je_lines = frappe.db.sql(
			"""SELECT jea.parent AS je, jea.account,
				jea.debit_in_account_currency AS dr,
				jea.credit_in_account_currency AS cr
			FROM `tabJournal Entry Account` jea
			INNER JOIN `tabJournal Entry` je ON jea.parent = je.name
			WHERE je.docstatus = 1 AND je.posting_date BETWEEN %s AND %s""",
			(from_date, to_date), as_dict=True,
		)
		_by_je = {}
		for _l in _je_lines:
			_by_je.setdefault(_l["je"], []).append(_l)
		for _je, _lines in _by_je.items():
			if not _lines or not all(l["account"] in cash_bank_set for l in _lines):
				continue
			for _l in _lines:
				_mode = account_to_mode.get(_l["account"], _l["account"])
				_cr = float(_l["cr"] or 0)
				_dr = float(_l["dr"] or 0)
				if _cr > 0:
					transfer_mode_out[_mode] = transfer_mode_out.get(_mode, 0.0) + _cr
					gl_transfer_total += _cr
				if _dr > 0:
					transfer_mode_in[_mode] = transfer_mode_in.get(_mode, 0.0) + _dr
			_outs = [l for l in _lines if float(l["cr"] or 0) > 0]
			_ins = [l for l in _lines if float(l["dr"] or 0) > 0]
			internal_transfers.append({
				"voucher": _je,
				"from": ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _outs),
				"to": ", ".join(account_to_mode.get(l["account"], l["account"]) for l in _ins),
				"amount": sum(float(l["cr"] or 0) for l in _outs),
			})
		_pe_xfers = frappe.db.sql(
			"""SELECT name, paid_from, paid_to, paid_amount
			FROM `tabPayment Entry`
			WHERE docstatus = 1 AND posting_date BETWEEN %s AND %s AND payment_type = 'Internal Transfer'""",
			(from_date, to_date), as_dict=True,
		)
		for _t in _pe_xfers:
			if _t["paid_from"] in cash_bank_set and _t["paid_to"] in cash_bank_set:
				_om = account_to_mode.get(_t["paid_from"], _t["paid_from"])
				_im = account_to_mode.get(_t["paid_to"], _t["paid_to"])
				_amt = float(_t["paid_amount"] or 0)
				transfer_mode_out[_om] = transfer_mode_out.get(_om, 0.0) + _amt
				transfer_mode_in[_im] = transfer_mode_in.get(_im, 0.0) + _amt
				gl_transfer_total += _amt
				internal_transfers.append({"voucher": _t["name"], "from": _om, "to": _im, "amount": _amt})

	gl_external_cash_in = gl_total_cash_in - gl_transfer_total
	gl_external_cash_out = gl_total_cash_out - gl_transfer_total

	_net_mode_summary = []
	for _m in gl_mode_summary:
		_md = _m["mode_of_payment"]
		_d = _m["total_debit"] - transfer_mode_in.get(_md, 0.0)
		_c = _m["total_credit"] - transfer_mode_out.get(_md, 0.0)
		_d = _d if _d > 0.0001 else 0.0
		_c = _c if _c > 0.0001 else 0.0
		if _d == 0.0 and _c == 0.0:
			continue
		_net_mode_summary.append({"mode_of_payment": _md, "total_debit": _d, "total_credit": _c, "net": _d - _c})
	gl_mode_summary = _net_mode_summary

	# Only the portion of a return actually refunded in cash should reduce collected
	# income; a credit note with no cash paid back (store credit, unsettled B2B
	# adjustment) has zero GL cash impact. Read this straight from the GL (credits on a
	# cash/bank account posted against the return voucher) so it is denominated in
	# exactly the same figures used to adjust gl_external_cash_in/out below —
	# guaranteeing "Net Collected Income" and the "Cash In" KPI reconcile exactly.
	cash_refunded_returns = 0.0
	cash_refunded_by_mode: dict = {}
	customer_refunds = []  # visible list, like internal_transfers: one row per refund voucher/mode
	if return_invoice_names and cash_bank_set:
		ri_ph = ", ".join(["%s"] * len(return_invoice_names))
		refund_gl_rows = frappe.db.sql(
			f"""SELECT gle.voucher_no, gle.account, SUM(gle.credit) AS amount
			FROM `tabGL Entry` gle
			WHERE gle.voucher_no IN ({ri_ph})
				AND gle.docstatus = 1
				AND gle.is_cancelled = 0
				AND gle.account IN ({cb_ph})
			GROUP BY gle.voucher_no, gle.account
			ORDER BY gle.voucher_no""",
			tuple(return_invoice_names + list(cash_bank_accounts)),
			as_dict=True,
		)
		for row in refund_gl_rows:
			amt = float(row.get("amount") or 0)
			if amt <= 0:
				continue
			mode = account_to_mode.get(row["account"], row["account"])
			cash_refunded_by_mode[mode] = cash_refunded_by_mode.get(mode, 0.0) + amt
			cash_refunded_returns += amt
			customer_refunds.append({
				"voucher": row["voucher_no"],
				"customer": return_invoice_customers.get(row["voucher_no"], ""),
				"mode_of_payment": mode,
				"amount": amt,
			})
	non_cash_returns = total_returns - cash_refunded_returns
	customer_refunds_top = sorted(customer_refunds, key=lambda r: r["amount"], reverse=True)[:TOP_N]

	# Customer refunds are a return of previously collected income, not a new business
	# expense — net them out of both sides of the external GL totals (same treatment as
	# internal transfers above) so the KPI cards and per-mode table stay in the same
	# "external, collected-income" basis as the doc-based Total Income calc.
	gl_external_cash_in  -= cash_refunded_returns
	gl_external_cash_out -= cash_refunded_returns
	if cash_refunded_by_mode:
		_refund_adjusted_mode_summary = []
		for _m in gl_mode_summary:
			_md = _m["mode_of_payment"]
			_refund = cash_refunded_by_mode.get(_md, 0.0)
			_c = _m["total_credit"] - _refund
			_c = _c if _c > 0.0001 else 0.0
			_d = _m["total_debit"] - _refund
			_d = _d if _d > 0.0001 else 0.0
			if _d == 0.0 and _c == 0.0:
				continue
			_refund_adjusted_mode_summary.append({
				"mode_of_payment": _md,
				"total_debit": _d,
				"total_credit": _c,
				"net": _d - _c,
			})
		gl_mode_summary = _refund_adjusted_mode_summary

	internal_transfers_top = sorted(internal_transfers, key=lambda t: t["amount"], reverse=True)[:TOP_N]

	# ---- Top high-value outflow entries (PE purchases + PE operating + JE + paid PIs) ----
	outflow_entries = []
	for p in pe_purchases:
		outflow_entries.append({
			"name": p["name"], "category": "Purchase Payment",
			"party_or_account": p.get("party_name") or p.get("party") or "",
			"mode_of_payment": p.get("mode_of_payment") or "", "amount": float(p.get("amount") or 0),
		})
	for p in pe_operating:
		outflow_entries.append({
			"name": p["name"], "category": "Operating Expense",
			"party_or_account": p.get("party_name") or p.get("party") or "",
			"mode_of_payment": p.get("mode_of_payment") or "", "amount": float(p.get("amount") or 0),
		})
	for je in je_detail_rows:
		outflow_entries.append({
			"name": je["name"], "category": "Journal Entry",
			"party_or_account": je.get("against_account") or "",
			"mode_of_payment": je.get("mode_of_payment") or "", "amount": float(je.get("amount") or 0),
		})
	for inv in paid_purchase_invoices:
		outflow_entries.append({
			"name": inv["name"], "category": "Cash Purchase Invoice",
			"party_or_account": inv.get("supplier_name") or inv.get("supplier") or "",
			"mode_of_payment": _account_to_payment_mode(inv.get("cash_bank_account") or ""),
			"amount": inv["cash_paid"],
		})
	top_outflow_entries = sorted(outflow_entries, key=lambda e: e["amount"], reverse=True)[:TOP_N]

	total_pe_operating_out = total_pe_operating
	purchase_total = total_pe_purchases + total_paid_purchases
	other_expenses_total = total_pe_operating_out + je_total
	total_outflow = purchase_total + other_expenses_total

	# all_sales_invoices excludes Repair Order-linked invoices (ro.name IS NULL above),
	# so repair_revenue must be added back explicitly — it is never inside
	# total_retail_sales/total_b2b_sales. Only cash_refunded_returns (not the full
	# total_returns) is netted out — see cash_refunded_returns comment above.
	repair_sales_revenue = total_retail_sales + total_b2b_sales + repair_revenue - cash_refunded_returns
	unpaid_credit_sales = total_credit_sales
	total_income = repair_sales_revenue + total_customer_collections + je_receipt_total + total_other_receipts - unpaid_credit_sales

	kpi_income = gl_external_cash_in
	kpi_outflow = gl_external_cash_out
	net_cash = kpi_income - kpi_outflow

	# By-mode breakdown for the income card
	income_mode_map = {}
	for pm in sales_payment_breakdown:
		income_mode_map[pm["mode_of_payment"]] = income_mode_map.get(pm["mode_of_payment"], 0.0) + float(pm["total"] or 0)
	for rm in repair_payment_breakdown:
		income_mode_map[rm["mode_of_payment"]] = income_mode_map.get(rm["mode_of_payment"], 0.0) + float(rm["total"] or 0)
	for c in pe_customer_collections:
		income_mode_map[c["mode_of_payment"]] = income_mode_map.get(c["mode_of_payment"], 0.0) + c["amount"]
	for j in je_receipt_by_mode:
		income_mode_map[j["mode_of_payment"]] = income_mode_map.get(j["mode_of_payment"], 0.0) + j["total"]
	for p in pe_other_receipts:
		mode = p.get("mode_of_payment") or "Other"
		income_mode_map[mode] = income_mode_map.get(mode, 0.0) + float(p.get("amount") or 0)
	income_mode_breakdown = sorted(
		[{"mode_of_payment": k, "total": v} for k, v in income_mode_map.items()],
		key=lambda x: x["total"], reverse=True,
	)

	return {
		"from_date": from_date,
		"to_date": to_date,
		"kpi_income": kpi_income,
		"kpi_outflow": kpi_outflow,
		"net_cash": net_cash,
		"total_income": total_income,
		"total_retail_sales": total_retail_sales,
		"total_b2b_sales": total_b2b_sales,
		"repair_revenue": repair_revenue,
		"total_returns": total_returns,
		"cash_refunded_returns": cash_refunded_returns,
		"non_cash_returns": non_cash_returns,
		"total_customer_collections": total_customer_collections,
		"je_receipt_total": je_receipt_total,
		"total_other_receipts": total_other_receipts,
		"unpaid_credit_sales": unpaid_credit_sales,
		"income_mode_breakdown": income_mode_breakdown,
		"credit_sales_invoices": credit_sales_invoices,
		"total_credit_sales": total_credit_sales,
		"credit_purchase_invoices": credit_purchase_invoices,
		"total_credit_purchases": total_credit_purchases,
		"purchase_total": purchase_total,
		"pe_purchases_by_mode": pe_purchases_by_mode,
		"other_expenses_total": other_expenses_total,
		"pe_operating_by_mode": pe_operating_by_mode,
		"je_by_mode": je_by_mode,
		"total_outflow": total_outflow,
		"gl_mode_summary": gl_mode_summary,
		"gl_account_summary": gl_account_summary,
		"gl_total_cash_in": gl_total_cash_in,
		"gl_total_cash_out": gl_total_cash_out,
		"internal_transfers": internal_transfers_top,
		"internal_transfers_count": len(internal_transfers),
		"gl_transfer_total": gl_transfer_total,
		"top_outflow_entries": top_outflow_entries,
		# Customer cash refunds — netted out of gl_external_cash_in/out above (same
		# treatment as internal transfers: not new income, not a business expense) but
		# surfaced here for visibility, same pattern as the Internal Transfers table.
		"customer_refunds": customer_refunds_top,
		"customer_refunds_count": len(customer_refunds),
	}
