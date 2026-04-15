// customer.js — PATH B handler
// Fires when the user saves a Customer on the full Customer form after having
// navigated there from a DW Repair Order via the link field's "+ Create" button.
// (PATH A — quick entry dialog — is handled entirely within dw_repair_order.js.)

var _WD_CUST_KEY = "wd:pending_customer_link";
var _WD_CUST_TTL = 15 * 60 * 1000;

function _wd_cust_get_pending() {
	try {
		var raw = sessionStorage.getItem(_WD_CUST_KEY);
		if (!raw) return null;
		var d = JSON.parse(raw);
		if (!d || !d.repair_order) { sessionStorage.removeItem(_WD_CUST_KEY); return null; }
		if (Date.now() - (d.ts || 0) > _WD_CUST_TTL) { sessionStorage.removeItem(_WD_CUST_KEY); return null; }
		return d;
	} catch (_) { return null; }
}

frappe.ui.form.on("Customer", {
	after_save(frm) {
		var pending = _wd_cust_get_pending();
		// Only act when a Repair Order initiated this customer creation
		if (!pending || !pending.repair_order) return;
		// Do not act if the quick-entry path already cleared the key
		// (pending.customer would already be set in that case, but quick-entry
		// never reaches this handler — this is defensive)
		if (pending.customer) return;

		// Write the new customer name so apply_pending_customer_link can read it
		try {
			sessionStorage.setItem(_WD_CUST_KEY, JSON.stringify({
				repair_order: pending.repair_order,
				customer: frm.doc.name,
				ts: Date.now(),
			}));
		} catch (_) {}

		// Navigate back — apply_pending_customer_link fires on refresh
		frappe.set_route("Form", "DW Repair Order", pending.repair_order);
	},
});
