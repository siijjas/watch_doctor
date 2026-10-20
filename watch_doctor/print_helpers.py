"""Helpers available inside print formats (hooks.py `jinja`)."""

import io

import frappe


def order_url(order_name):
	"""Staff deep link to an order; opening it needs a login (spec B5.10)."""
	return frappe.utils.get_url(f"/repair/orders/{order_name}")


def order_qr_svg(order_name, size="0.82in"):
	"""Inline SVG QR code of the order's staff link, sized for the bag label."""
	import pyqrcode

	qr = pyqrcode.create(order_url(order_name), error="M")
	buffer = io.BytesIO()
	qr.svg(buffer, scale=1, omithw=True, xmldecl=False, svgns=True, quiet_zone=1)
	svg = buffer.getvalue().decode()
	return svg.replace("<svg ", f'<svg width="{size}" height="{size}" shape-rendering="crispEdges" ', 1)
