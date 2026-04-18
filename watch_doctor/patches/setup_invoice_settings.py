"""Patch: ensure the centralized invoice settings singleton exists."""


def execute():
	from watch_doctor.setup_invoice_settings import execute as setup_invoice_settings

	setup_invoice_settings()