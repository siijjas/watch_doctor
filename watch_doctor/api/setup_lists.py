"""Settings lists (UI_REDESIGN_SPEC.md D13): one allow-listed endpoint set
behind every editable list, replacing 13 copies of the same screen.

Only the fields named here can be written. A record named by one of its
fields (e.g. a complaint named after its text) is renamed when that field
changes, so links from existing orders follow it.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, nowdate

from watch_doctor.permissions import ROLE_EXECUTIVE, require_roles

CONDITION_CATEGORIES = ["Case & Exterior", "Crystal & Water Resistance", "Bracelet & Strap", "History & Other"]

LISTS = {
	"complaints": {"doctype": "DW Issue Template", "fields": ["issue_name", "suggested_task", "description", "is_active", "display_order"], "order": "display_order asc, issue_name asc"},
	"conditions": {"doctype": "DW Watch Condition Template", "fields": ["condition_name", "category", "description", "is_active", "display_order"], "order": "display_order asc, condition_name asc"},
	"findings": {"doctype": "DW Diagnosis Summary Template", "fields": ["summary_name", "description", "is_active"], "order": "summary_name asc"},
	"work": {"doctype": "DW Recommended Work Template", "fields": ["work_name", "description", "is_active"], "order": "work_name asc"},
	"movements": {"doctype": "DW Movement Type Template", "fields": ["movement_type", "description", "is_active"], "order": "movement_type asc"},
	"calibers": {"doctype": "DW Movement Caliber Template", "fields": ["caliber_code", "description", "is_active"], "order": "caliber_code asc"},
	"services": {"doctype": "DW Task Template", "fields": ["task_name", "default_rate", "description"], "order": "task_name asc"},
	"brands": {"doctype": "DW Watch Brand", "fields": ["brand_name", "description"], "order": "brand_name asc"},
	"models": {"doctype": "DW Watch Model", "fields": ["brand", "model_name", "description"], "order": "brand asc, model_name asc"},
	"payment_modes": {"doctype": "DW Payment Mode Config", "fields": ["payment_mode", "display_order", "is_active"], "order": "display_order asc"},
	"technicians": {"doctype": "DW Technician", "fields": ["technician_name", "user", "email", "phone", "notes"], "order": "technician_name asc"},
	"sales_persons": {"doctype": "Sales Person", "fields": ["sales_person_name", "parent_sales_person", "commission_rate", "enabled"], "order": "sales_person_name asc", "filters": {"is_group": 0}, "defaults": {"is_group": 0}},
	"country_codes": {"doctype": "DW Country Code", "fields": ["country_name", "code", "display_order", "is_active"], "order": "display_order asc, country_name asc"},
}


def _spec(key):
	spec = LISTS.get(key)
	if not spec:
		frappe.throw(_("Unknown list"))
	return spec


def _existing_fields(doctype, fields):
	meta = frappe.get_meta(doctype)
	return [f for f in fields if meta.has_field(f)]


@frappe.whitelist()
def setup_list(key: str):
	require_roles(ROLE_EXECUTIVE)
	spec = _spec(key)
	fields = _existing_fields(spec["doctype"], spec["fields"])
	order = ", ".join(p for p in spec["order"].split(", ") if p.split()[0] in fields + ["name"]) or "name asc"
	rows = frappe.get_all(spec["doctype"], fields=["name", *fields], filters=spec.get("filters") or {}, order_by=order, limit_page_length=2000)

	since = add_days(nowdate(), -90)
	if key == "services" and rows:
		used = dict(frappe.db.sql(
			"""SELECT t.service, COUNT(*) FROM `tabDW Repair Task` t INNER JOIN `tabDW Repair Order` o ON o.name = t.parent
			WHERE o.received_date >= %s GROUP BY t.service""",
			since,
		))
		for r in rows:
			r.used_90d = int(used.get(r.name, 0))
	elif key == "brands" and rows:
		models = dict(frappe.db.sql("SELECT brand, COUNT(*) FROM `tabDW Watch Model` GROUP BY brand"))
		seen = dict(frappe.db.sql("SELECT watch_brand, COUNT(*) FROM `tabDW Repair Item` WHERE parenttype = 'DW Repair Order' GROUP BY watch_brand"))
		for r in rows:
			r.models = int(models.get(r.name, 0))
			r.watches = int(seen.get(r.name, 0))
	elif key == "models" and rows:
		seen = dict(frappe.db.sql("SELECT watch_model, COUNT(*) FROM `tabDW Repair Item` WHERE parenttype = 'DW Repair Order' GROUP BY watch_model"))
		for r in rows:
			r.watches = int(seen.get(r.name, 0))
	elif key == "technicians" and rows:
		open_ = dict(frappe.db.sql(
			"""SELECT i.technician, COUNT(*) FROM `tabDW Repair Item` i INNER JOIN `tabDW Repair Order` o ON o.name = i.parent
			WHERE o.docstatus = 0 AND i.status NOT IN ('Completed', 'Delivered', 'Not Repairable', 'Declined') GROUP BY i.technician"""
		))
		for r in rows:
			r.open_watches = int(open_.get(r.name, 0))
	return rows


@frappe.whitelist()
def setup_options():
	"""Choices for the select fields of every list."""
	require_roles(ROLE_EXECUTIVE)
	from frappe.utils.user import get_users_with_role
	tech_users = set(get_users_with_role("DW Technician"))
	return {
		"services": [{"value": r.name, "label": r.task_name} for r in frappe.get_all("DW Task Template", fields=["name", "task_name"], order_by="task_name asc", limit_page_length=2000)],
		"categories": CONDITION_CATEGORIES,
		"brands": frappe.get_all("DW Watch Brand", pluck="name", order_by="name asc", limit_page_length=5000),
		"modes_of_payment": frappe.get_all("Mode of Payment", filters={"enabled": 1}, pluck="name", order_by="name asc"),
		"sales_person_groups": frappe.get_all("Sales Person", filters={"is_group": 1}, pluck="name", order_by="name asc"),
		"users": [
			{"value": u.name, "label": f"{u.full_name or u.name} · {u.name}" + (" (technician role)" if u.name in tech_users else "")}
			for u in frappe.get_all("User", filters={"enabled": 1, "user_type": "System User", "name": ["not in", ["Administrator", "Guest"]]}, fields=["name", "full_name"], order_by="full_name asc", limit_page_length=500)
		],
	}


def _clean(spec, data):
	allowed = set(_existing_fields(spec["doctype"], spec["fields"]))
	out = {}
	for k, v in (data or {}).items():
		if k not in allowed:
			continue
		if isinstance(v, str):
			v = v.strip()
		out[k] = v
	return out


@frappe.whitelist()
def setup_save(key: str, doc: str | dict, name: str = ""):
	"""Create (no name) or update a row. Returns the saved row's name."""
	require_roles(ROLE_EXECUTIVE)
	spec = _spec(key)
	data = _clean(spec, json.loads(doc) if isinstance(doc, str) else doc)
	doctype = spec["doctype"]
	meta = frappe.get_meta(doctype)

	if not name:
		new = frappe.get_doc({"doctype": doctype, **(spec.get("defaults") or {}), **data})
		new.insert()
		return {"name": new.name}

	existing = frappe.get_doc(doctype, name)
	autoname = str(meta.autoname or "")
	if autoname.startswith("field:"):
		key_field = autoname.split(":", 1)[1]
		new_name = data.get(key_field)
		if new_name and new_name != name:
			if frappe.db.exists(doctype, new_name):
				frappe.throw(_("{0} already exists.").format(new_name))
			# Renaming updates every link to it (orders, templates).
			frappe.rename_doc(doctype, name, new_name, force=True)
			existing = frappe.get_doc(doctype, new_name)
	existing.update(data)
	existing.save()
	return {"name": existing.name}


@frappe.whitelist()
def setup_delete(key: str, name: str):
	require_roles(ROLE_EXECUTIVE)
	spec = _spec(key)
	try:
		frappe.delete_doc(spec["doctype"], name)
	except frappe.LinkExistsError:
		frappe.db.rollback()
		has_active = frappe.get_meta(spec["doctype"]).has_field("is_active") or frappe.get_meta(spec["doctype"]).has_field("enabled")
		frappe.throw(
			_("{0} is used on existing records, so it cannot be deleted.").format(name)
			+ (" " + _("Switch it off instead; old orders keep it and new ones will not offer it.") if has_active else "")
		)
	return {"deleted": name}


# ---------------------------------------------------------------- POS profiles

POS_PROFILE_FIELDS = ["dw_default_customer", "dw_enable_auto_print", "dw_default_sales_person", "dw_default_commission_rate"]


@frappe.whitelist()
def pos_profiles():
	require_roles(ROLE_EXECUTIVE)
	fields = _existing_fields("POS Profile", POS_PROFILE_FIELDS)
	rows = frappe.get_all("POS Profile", fields=["name", "company", "warehouse", *fields], order_by="name asc")
	for r in rows:
		if r.get("dw_default_customer"):
			r.customer_name = frappe.db.get_value("Customer", r.dw_default_customer, "customer_name") or r.dw_default_customer
	return rows


@frappe.whitelist()
def save_pos_profile(name: str, fields: str | dict):
	require_roles(ROLE_EXECUTIVE)
	data = json.loads(fields) if isinstance(fields, str) else fields
	doc = frappe.get_doc("POS Profile", name)
	for k in _existing_fields("POS Profile", POS_PROFILE_FIELDS):
		if k in data:
			v = data[k]
			if k == "dw_enable_auto_print":
				v = cint(v)
			elif k == "dw_default_commission_rate":
				v = flt(v)
			doc.set(k, v or (0 if k in ("dw_enable_auto_print", "dw_default_commission_rate") else None))
	doc.save()
	return {"name": doc.name}


# ---------------------------------------------------------------- WhatsApp centre

@frappe.whitelist()
def whatsapp_log(search: str = "", key: str = "", days: int = 30, limit: int = 200):
	"""Messages sent (or tried) from the app, newest first."""
	require_roles(ROLE_EXECUTIVE)
	conditions = ["l.creation >= %(since)s"]
	values = {"since": add_days(nowdate(), -int(days or 30)), "limit": min(int(limit or 200), 500)}
	if key:
		conditions.append("l.notification_key = %(key)s")
		values["key"] = key
	if search:
		values["needle"] = f"%{search.strip()}%"
		conditions.append("(l.repair_order LIKE %(needle)s OR l.customer_name LIKE %(needle)s OR l.phone_number LIKE %(needle)s)")
	return frappe.db.sql(
		f"""
		SELECT l.name, l.creation, l.sent_at, l.repair_order, l.customer, l.customer_name, l.phone_number,
			l.notification_key, COALESCE(t.label, l.notification_key) AS label, l.status, l.error_detail,
			l.message_body, COALESCE(u.full_name, l.sent_by) AS sent_by
		FROM `tabDW WhatsApp Log` l
		LEFT JOIN `tabDW WhatsApp Template` t ON t.name = l.notification_key
		LEFT JOIN `tabUser` u ON u.name = l.sent_by
		WHERE {' AND '.join(conditions)}
		ORDER BY l.creation DESC
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)


@frappe.whitelist()
def daily_summary_preview():
	"""Today's owner summary text, exactly as the 08:00 message would read."""
	require_roles(ROLE_EXECUTIVE)
	from watch_doctor.whatsapp.summary import build_daily_summary
	return {"text": build_daily_summary()}
