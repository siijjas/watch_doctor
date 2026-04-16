// sales_invoice_pms.js — Desk integration for Profit Margin Scheme.
// Shows an internal PMS summary banner for invoices with PMS items.

frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		_show_pms_banner(frm);
		_add_pms_print_button(frm);
	},

	validate(frm) {
		// Warn if a PMS item is added with a Sales Taxes row
		// (PMS invoices should NOT have a standard tax template)
		if (!frm.doc.dw_has_pms_items) return;

		var tax_rows = (frm.doc.taxes || []).filter(function(t) {
			return t.rate && t.rate > 0;
		});
		if (tax_rows.length > 0) {
			frappe.msgprint({
				title: __("PMS Tax Warning"),
				indicator: "orange",
				message: __(
					"This invoice contains Profit Margin Scheme items. " +
					"Standard Sales Taxes should NOT be applied. " +
					"PMS VAT is calculated automatically on the profit margin. " +
					"Please remove the Sales Taxes and Charges rows for PMS items."
				),
			});
		}
	},
});


function _show_pms_banner(frm) {
	// Remove any previous banner
	frm.$wrapper.find(".dw-pms-banner").remove();

	if (!frm.doc.dw_has_pms_items) return;

	var total_vat = frm.doc.dw_pms_total_vat || 0;
	var disclaimer = frm.doc.dw_pms_disclaimer || "";

	var html =
		'<div class="dw-pms-banner" style="' +
		"background:#fff3cd;border:1px solid #ffc107;border-radius:6px;" +
		"padding:10px 14px;margin:8px 0 12px;font-size:12px;" +
		'">' +
		'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
		'<span style="font-size:16px;">&#9888;&#65039;</span>' +
		"<strong>Profit Margin Scheme</strong>" +
		'<span style="margin-left:auto;font-weight:600;">' +
		"PMS VAT: " + format_currency(total_vat, frm.doc.currency) +
		"</span>" +
		"</div>";

	// Per-item breakdown
	var pms_items = (frm.doc.items || []).filter(function(d) {
		return d.dw_is_pms_item;
	});
	if (pms_items.length > 0) {
		html +=
			'<table style="width:100%;margin-top:8px;font-size:11px;border-collapse:collapse;">' +
			"<tr style='background:#f8f0d0;'>" +
			"<th style='padding:3px 6px;text-align:left;'>Item</th>" +
			"<th style='padding:3px 6px;text-align:right;'>Selling</th>" +
			"<th style='padding:3px 6px;text-align:right;'>Cost</th>" +
			"<th style='padding:3px 6px;text-align:right;'>Margin</th>" +
			"<th style='padding:3px 6px;text-align:right;'>VAT</th>" +
			"</tr>";
		pms_items.forEach(function(d) {
			html +=
				"<tr>" +
				"<td style='padding:2px 6px;'>" + (d.item_name || d.item_code) + "</td>" +
				"<td style='padding:2px 6px;text-align:right;'>" +
				format_currency(d.amount, frm.doc.currency) + "</td>" +
				"<td style='padding:2px 6px;text-align:right;'>" +
				format_currency(d.dw_pms_purchase_cost, frm.doc.currency) + "</td>" +
				"<td style='padding:2px 6px;text-align:right;'>" +
				format_currency(d.dw_pms_margin, frm.doc.currency) + "</td>" +
				"<td style='padding:2px 6px;text-align:right;font-weight:600;'>" +
				format_currency(d.dw_pms_vat, frm.doc.currency) + "</td>" +
				"</tr>";
		});
		html += "</table>";
	}

	if (disclaimer) {
		html +=
			'<div style="margin-top:6px;font-size:10px;color:#856404;font-style:italic;">' +
			disclaimer +
			"</div>";
	}
	html += "</div>";

	frm.layout.prepend_message(html);
}


function _add_pms_print_button(frm) {
	if (!frm.doc.dw_has_pms_items) return;
	if (frm.doc.docstatus !== 1) return;

	frm.add_custom_button(__("PMS Tax Invoice"), function() {
		frappe.call({
			method: "watch_doctor.api.get_app_config",
			args: {},
			callback: function(r) {
				var printFormat = (r.message && r.message.pms_print_format) || "";
				if (!printFormat) {
					frappe.msgprint({
						title: __("PMS Print Format Missing"),
						indicator: "orange",
						message: __("Configure the PMS Print Format in DW PMS Settings before printing a PMS invoice."),
					});
					return;
				}
				var url = frappe.urllib.get_full_url(
					"/api/method/frappe.utils.print_format.download_pdf?" +
					"doctype=Sales%20Invoice" +
					"&name=" + encodeURIComponent(frm.doc.name) +
					"&format=" + encodeURIComponent(printFormat) +
					"&no_letterhead=0"
				);
				window.open(url, "_blank");
			}
		});
	}, __("Print"));
}
