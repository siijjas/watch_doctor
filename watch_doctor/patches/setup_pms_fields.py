"""Patch: ensure the PMS schema and settings singleton exist."""

import frappe


def execute():
    from watch_doctor.setup_pms import execute as setup_pms
    setup_pms()
