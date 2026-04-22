"""Patch: ensure the centralized general configuration singleton exists."""


def execute():
	from watch_doctor.setup_general_configuration import execute as setup_general_configuration

	setup_general_configuration()