"""Daily order summary for the shop owner, sent over WhatsApp.

Built from the same rows and follow-up rules as the front-desk Order Tracker
(watch_doctor.api.tracker), so the numbers match what the receptionist sees.
Goes only to the number saved in Settings -> General; never to customers.
"""

import frappe
from frappe import _
from frappe.utils import cint, formatdate, nowdate

from watch_doctor.api.tracker import (
	ATTENTION_AFTER_DAYS,
	STAGE_APPROVAL,
	STAGE_ESTIMATE,
	STAGE_NOT_STARTED,
	STAGE_PARTS,
	STAGE_READY,
	STAGE_WORKSHOP,
	get_tracker_rows,
)
from watch_doctor.general_configuration import get_general_configuration
from watch_doctor.permissions import require_roles, ROLE_EXECUTIVE
from watch_doctor.whatsapp.service import normalize_phone, send_text

LONGEST_WAITING_LIMIT = 5

# (stage, line shown in the follow-up breakdown)
FOLLOW_UP_LINES = [
	(STAGE_READY, "Ready but not collected for {days}+ days"),
	(STAGE_APPROVAL, "No answer on the estimate for {days}+ days"),
	(STAGE_ESTIMATE, "Estimate not sent for {days}+ days"),
	(STAGE_NOT_STARTED, "Not started for {days}+ days"),
	(STAGE_WORKSHOP, "In the workshop for {days}+ days"),
	(STAGE_PARTS, "Parts late"),
]

STAGE_WORDS = {
	STAGE_READY: "ready, not collected",
	STAGE_APPROVAL: "waiting for customer",
	STAGE_ESTIMATE: "estimate to send",
	STAGE_NOT_STARTED: "not started",
	STAGE_WORKSHOP: "in workshop",
	STAGE_PARTS: "waiting for parts",
}


def build_daily_summary() -> str:
	"""Return the summary message text."""
	rows, _truncated = get_tracker_rows()
	config = get_general_configuration()

	def count(stage):
		return sum(1 for row in rows if row.stage == stage)

	lines = [
		f"*{config.get('company_name') or 'Watch Doctor'} - daily order summary*",
		formatdate(nowdate(), "EEE, d MMM yyyy"),
		"",
		f"In the shop: {len(rows)} {'watch' if len(rows) == 1 else 'watches'}",
		f"Ready for collection: {count(STAGE_READY)}",
		f"Waiting for customer approval: {count(STAGE_APPROVAL)}",
		f"Waiting for parts: {count(STAGE_PARTS)}",
		"",
	]

	follow_up = [row for row in rows if row.needs_attention]
	if not follow_up:
		lines.append("Nothing needs follow-up today.")
	else:
		lines.append(f"*Needs follow-up: {len(follow_up)}*")
		for stage, label in FOLLOW_UP_LINES:
			stage_count = sum(1 for row in follow_up if row.stage == stage)
			if stage_count:
				lines.append(f"- {label.format(days=ATTENTION_AFTER_DAYS.get(stage, ''))}: {stage_count}")

	overdue = sum(1 for row in rows if row.overdue_days > 0)
	if overdue:
		lines.extend(["", f"Past promised date: {overdue}"])

	if follow_up:
		lines.extend(["", "*Longest waiting*"])
		longest = sorted(follow_up, key=lambda row: row.days_in_stage, reverse=True)[:LONGEST_WAITING_LIMIT]
		for row in longest:
			watch = " ".join(part for part in (row.watch_brand, row.watch_model) if part)
			days = f"{row.days_in_stage} day{'' if row.days_in_stage == 1 else 's'}"
			lines.append(
				f"- {row.repair_order} | {row.customer_name} | {watch} | {STAGE_WORDS.get(row.stage, row.stage)}, {days}"
			)

	return "\n".join(lines)


def _get_recipient(config) -> str:
	number = str(config.get("daily_summary_whatsapp_no") or "").strip()
	return normalize_phone(number) if number else ""


def send_daily_summary():
	"""Scheduler entry point (see hooks.scheduler_events). Sends only when switched on in Settings."""
	if not frappe.conf.get("whatsapp_enabled"):
		return

	config = get_general_configuration()
	if not cint(config.get("daily_summary_enabled")):
		return

	try:
		recipient = _get_recipient(config)
		if not recipient:
			return
		send_text(recipient, build_daily_summary())
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Daily order summary failed")


@frappe.whitelist()
def send_daily_summary_now():
	"""Send the summary immediately to the saved number (Settings "Send now" button)."""
	require_roles(ROLE_EXECUTIVE)

	if not frappe.conf.get("whatsapp_enabled"):
		frappe.throw(_("WhatsApp notifications are not enabled."))

	recipient = _get_recipient(get_general_configuration())
	if not recipient:
		frappe.throw(_("Save a WhatsApp number for the daily summary first."))

	send_text(recipient, build_daily_summary())
	return {"sent_to": recipient}
