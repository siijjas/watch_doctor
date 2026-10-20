"""Intake endpoints (UI_REDESIGN_SPEC.md D7 / M6).

Phone numbers are stored in mixed shapes ("39406370", "+97338855202",
"3940 6370"), so lookups compare digits only, without the country code.
"""

import re

import frappe
from frappe import _

from watch_doctor.permissions import ROLE_DATA_ENTRY, ROLE_EXECUTIVE, require_roles

FIND_LIMIT = 20
# Shortest digit run that is treated as a phone number rather than a name.
MIN_PHONE_DIGITS = 4


def phone_digits(value):
	"""Digits only, without a leading 00 / + country prefix for Bahrain."""
	digits = re.sub(r"\D", "", value or "")
	if digits.startswith("00"):
		digits = digits[2:]
	if digits.startswith("973") and len(digits) > 8:
		digits = digits[3:]
	return digits


def _digits_sql(column):
	return f"REPLACE(REPLACE(REPLACE(REPLACE(IFNULL({column}, ''), ' ', ''), '-', ''), '+', ''), '(', '')"


def _has_whatsapp():
	return frappe.db.has_column("Customer", "whatsapp_no")


@frappe.whitelist()
def find_customers(txt: str = ""):
	"""Customers by name, mobile or WhatsApp number, with their repair history count."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	txt = (txt or "").strip()
	if not txt:
		return []

	values = {"needle": f"%{txt}%"}
	clauses = ["c.customer_name LIKE %(needle)s", "c.name LIKE %(needle)s"]
	digits = phone_digits(txt)
	if len(digits) >= MIN_PHONE_DIGITS and len(digits) >= len(re.sub(r"\s", "", txt)) - 4:
		values["digits"] = f"%{digits}%"
		clauses.append(f"{_digits_sql('c.mobile_no')} LIKE %(digits)s")
		if _has_whatsapp():
			clauses.append(f"{_digits_sql('c.whatsapp_no')} LIKE %(digits)s")

	whatsapp = "c.whatsapp_no" if _has_whatsapp() else "NULL"
	rows = frappe.db.sql(
		f"""
		SELECT c.name, c.customer_name, c.mobile_no, {whatsapp} AS whatsapp_no,
			(SELECT COUNT(*) FROM `tabDW Repair Order` o WHERE o.customer = c.name AND o.docstatus < 2) AS orders,
			(SELECT COUNT(*) FROM `tabDW Repair Order` o WHERE o.customer = c.name AND o.docstatus = 0) AS open_orders,
			(SELECT MAX(o.received_date) FROM `tabDW Repair Order` o WHERE o.customer = c.name AND o.docstatus < 2) AS last_order
		FROM `tabCustomer` c
		WHERE c.disabled = 0 AND ({' OR '.join(clauses)})
		ORDER BY orders DESC, c.customer_name ASC
		LIMIT {FIND_LIMIT}
		""",
		values,
		as_dict=True,
	)
	return rows


def customers_with_phone(number, exclude=None):
	"""Existing customers whose mobile or WhatsApp number is the same number."""
	digits = phone_digits(number)
	if len(digits) < 7:
		return []
	cols = [_digits_sql("mobile_no")]
	if _has_whatsapp():
		cols.append(_digits_sql("whatsapp_no"))
	# Match on the last 8 digits so "+973 3885 5202" and "38855202" collide.
	tail = digits[-8:]
	rows = frappe.db.sql(
		f"""
		SELECT name, customer_name, mobile_no
		FROM `tabCustomer`
		WHERE disabled = 0 AND ({' OR '.join(f'RIGHT({c}, 8) = %(tail)s' for c in cols)})
		LIMIT 5
		""",
		{"tail": tail},
		as_dict=True,
	)
	return [r for r in rows if r.name != exclude]


@frappe.whitelist()
def check_phone(number: str = ""):
	"""Live duplicate warning while typing a new customer's number."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	return customers_with_phone(number)


@frappe.whitelist()
def create_customer(customer_name: str, mobile: str = "", whatsapp: str = "", email: str = ""):
	"""New customer from intake. Refuses a number another customer already has."""
	require_roles(ROLE_EXECUTIVE, ROLE_DATA_ENTRY)
	customer_name = " ".join((customer_name or "").split())
	mobile = re.sub(r"[^\d+]", "", mobile or "")
	whatsapp = re.sub(r"[^\d+]", "", whatsapp or "")
	email = (email or "").strip()
	if not customer_name:
		frappe.throw(_("Enter the customer's name."))
	if not mobile:
		frappe.throw(_("Enter a mobile number so we can tell the customer when the watch is ready."))
	if email and not frappe.utils.validate_email_address(email, throw=False):
		frappe.throw(_("That email address does not look right."))

	for number in filter(None, [mobile, whatsapp]):
		same = customers_with_phone(number)
		if same:
			frappe.throw(
				_("{0} already has this number. Pick that customer instead.").format(same[0].customer_name),
				title=_("Number already used"),
			)

	doc = frappe.get_doc({
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Individual",
		"customer_group": frappe.db.exists("Customer Group", "Individual") and "Individual" or None,
		"territory": frappe.db.exists("Territory", "All Territories") and "All Territories" or None,
		"mobile_no": mobile,
		"email_id": email,
	})
	if whatsapp and _has_whatsapp():
		doc.set("whatsapp_no", whatsapp)
	doc.insert(ignore_permissions=True)
	return {
		"name": doc.name,
		"customer_name": doc.customer_name,
		"mobile_no": doc.mobile_no,
		"whatsapp_no": doc.get("whatsapp_no"),
		"orders": 0,
		"open_orders": 0,
		"last_order": None,
	}
