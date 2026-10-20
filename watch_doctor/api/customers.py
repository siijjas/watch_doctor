"""Customer profile (UI_REDESIGN_SPEC.md D8).

Until now customers were only reachable through search boxes. The profile
brings their repairs, retail invoices, messages, known watches, money owed
and a note into one place.
"""

import re

import frappe
from frappe import _
from frappe.utils import flt

from watch_doctor.api.intake import _has_whatsapp, customers_with_phone, find_customers
from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles

# Retail sales carry a POS profile; repair invoices never do.
RETAIL = "IFNULL(si.dw_pos_profile, '') != ''"


@frappe.whitelist()
def list_customers(search: str = "", limit: int = 40):
	"""Search, or the customers seen most recently when there is no search."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if (search or "").strip():
		return find_customers(search)
	whatsapp = "c.whatsapp_no" if _has_whatsapp() else "NULL"
	return frappe.db.sql(
		f"""
		SELECT c.name, c.customer_name, c.mobile_no, {whatsapp} AS whatsapp_no,
			COUNT(o.name) AS orders, SUM(o.docstatus = 0) AS open_orders, MAX(o.received_date) AS last_order
		FROM `tabDW Repair Order` o
		INNER JOIN `tabCustomer` c ON c.name = o.customer
		WHERE o.docstatus < 2
		GROUP BY c.name
		ORDER BY last_order DESC
		LIMIT %(limit)s
		""",
		{"limit": min(int(limit or 40), 200)},
		as_dict=True,
	)


@frappe.whitelist()
def get_customer_profile(name: str):
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	if not frappe.db.exists("Customer", name):
		frappe.throw(_("Customer not found"), frappe.DoesNotExistError)
	c = frappe.get_doc("Customer", name)

	orders = frappe.db.sql(
		"""
		SELECT o.name, o.reference_number, o.status, o.docstatus, o.received_date, o.delivery_date,
			o.quotation_amount, o.invoiced_amount, o.balance_amount
		FROM `tabDW Repair Order` o
		WHERE o.customer = %s AND o.docstatus < 2
		ORDER BY o.received_date DESC, o.name DESC
		LIMIT 100
		""",
		name,
		as_dict=True,
	)
	watches = {}
	if orders:
		for row in frappe.db.sql(
			"""
			SELECT i.parent, i.name, i.watch_brand, COALESCE(m.model_name, i.watch_model) AS watch_model,
				i.serial_number, i.status, i.awaiting_parts
			FROM `tabDW Repair Item` i
			LEFT JOIN `tabDW Watch Model` m ON m.name = i.watch_model
			WHERE i.parenttype = 'DW Repair Order' AND i.parent IN %(names)s
			ORDER BY i.idx
			""",
			{"names": tuple(o.name for o in orders)},
			as_dict=True,
		):
			watches.setdefault(row.parent, []).append(row)
	for o in orders:
		o.watches = watches.get(o.name, [])

	# Watches this customer has brought in, most repaired first.
	known = {}
	for o in orders:
		for w in o.watches:
			key = (w.watch_brand or "", w.watch_model or "", (w.serial_number or "").strip().upper())
			entry = known.setdefault(key, {"watch": " ".join(x for x in key[:2] if x), "serial": w.serial_number or "", "repairs": 0, "last": o.received_date})
			entry["repairs"] += 1

	retail = frappe.db.sql(
		f"""
		SELECT si.name, si.posting_date, si.grand_total, si.outstanding_amount, si.is_return,
			si.dw_is_credit_sale, si.dw_has_pms_items
		FROM `tabSales Invoice` si
		WHERE si.customer = %s AND si.docstatus = 1 AND {RETAIL}
		ORDER BY si.posting_date DESC, si.creation DESC
		LIMIT 50
		""",
		name,
		as_dict=True,
	)
	if retail:
		lines = frappe.get_all(
			"Sales Invoice Item",
			filters={"parent": ["in", [r.name for r in retail]]},
			fields=["parent", "item_name"],
			order_by="idx asc",
		)
		by_parent = {}
		for line in lines:
			by_parent.setdefault(line.parent, []).append(line.item_name)
		modes = frappe.get_all(
			"Sales Invoice Payment",
			filters={"parent": ["in", [r.name for r in retail]], "amount": ["!=", 0]},
			fields=["parent", "mode_of_payment"],
		)
		mode_by = {}
		for m in modes:
			mode_by.setdefault(m.parent, []).append(m.mode_of_payment)
		for r in retail:
			r["items"] = by_parent.get(r.name, [])
			r["modes"] = sorted(set(mode_by.get(r.name, [])))

	totals = frappe.db.sql(
		f"""
		SELECT
			SUM(CASE WHEN {RETAIL} THEN 0 ELSE si.grand_total END) AS repairs_billed,
			SUM(CASE WHEN {RETAIL} THEN si.grand_total ELSE 0 END) AS retail,
			SUM(si.outstanding_amount) AS outstanding
		FROM `tabSales Invoice` si
		WHERE si.customer = %s AND si.docstatus = 1
		""",
		name,
		as_dict=True,
	)[0]

	messages = frappe.get_all(
		"DW WhatsApp Log",
		filters={"customer": name},
		fields=["name", "repair_order", "notification_key", "status", "sent_at", "creation", "message_body", "sent_by"],
		order_by="creation desc",
		limit_page_length=30,
	)
	if messages:
		labels = dict(frappe.get_all("DW WhatsApp Template", fields=["name", "label"], as_list=True))
		users = dict(frappe.get_all("User", filters={"name": ["in", list({m.sent_by for m in messages if m.sent_by})]}, fields=["name", "full_name"], as_list=True))
		for m in messages:
			m.label = labels.get(m.notification_key) or m.notification_key
			m.by = users.get(m.sent_by) or m.sent_by

	return {
		"name": c.name,
		"customer_name": c.customer_name,
		"mobile_no": c.mobile_no or "",
		"whatsapp_no": (c.get("whatsapp_no") or "") if _has_whatsapp() else "",
		"email_id": c.email_id or "",
		"notes": c.get("customer_details") or "",
		"since": c.creation,
		"disabled": c.disabled,
		"stats": {
			"orders": len(orders),
			"open_orders": sum(1 for o in orders if o.docstatus == 0),
			"repairs_billed": flt(totals.repairs_billed),
			"retail": flt(totals.retail),
			"outstanding": flt(totals.outstanding),
		},
		"orders": orders,
		"retail": retail,
		"messages": messages,
		"watches": sorted(known.values(), key=lambda w: (-w["repairs"], str(w["last"] or "")), reverse=False),
		"whatsapp_enabled": bool(frappe.conf.get("whatsapp_enabled")),
	}


@frappe.whitelist()
def update_customer(name: str, customer_name: str | None = None, mobile: str | None = None, whatsapp: str | None = None, email: str | None = None, notes: str | None = None):
	"""Edit contact details or the staff note. Refuses a number another customer has."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	c = frappe.get_doc("Customer", name)
	if customer_name is not None:
		customer_name = " ".join(customer_name.split())
		if not customer_name:
			frappe.throw(_("The name cannot be empty."))
		c.customer_name = customer_name
	for field, value in (("mobile_no", mobile), ("whatsapp_no", whatsapp)):
		if value is None or (field == "whatsapp_no" and not _has_whatsapp()):
			continue
		value = re.sub(r"[^\d+]", "", value)
		if value:
			same = customers_with_phone(value, exclude=name)
			if same:
				frappe.throw(_("{0} already has this number.").format(same[0].customer_name), title=_("Number already used"))
		c.set(field, value)
	if email is not None:
		email = email.strip()
		if email and not frappe.utils.validate_email_address(email, throw=False):
			frappe.throw(_("That email address does not look right."))
		c.email_id = email
	if notes is not None:
		c.customer_details = notes.strip()
	c.flags.ignore_permissions = True
	c.save(ignore_permissions=True)
	return {"name": c.name}
