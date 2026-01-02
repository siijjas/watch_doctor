// Copyright (c) 2025, Watch Doctor and contributors
// For license information, please see license.txt

frappe.ui.form.on("DW Repair Order", {
    refresh(frm) {
        // Auto-set promised delivery date
        if (frm.is_new() && frm.doc.received_date && !frm.doc.promised_delivery_date) {
            frm.set_value("promised_delivery_date", frappe.datetime.add_days(frm.doc.received_date, 7));
        }

        // Add custom buttons for quotation and billing
        if (!frm.is_new()) {
            add_quotation_buttons(frm);
            add_billing_buttons(frm);
        }
    },

    received_date(frm) {
        if (frm.doc.received_date) {
            frm.set_value("promised_delivery_date", frappe.datetime.add_days(frm.doc.received_date, 7));
        }
    },
});

// ==================== Quotation Functions ====================

function add_quotation_buttons(frm) {
    // Create Quotation button
    frm.add_custom_button(__('Create Quotation'), () => {
        show_quotation_dialog(frm);
    }, __('Actions'));

    // View Quotation button
    if (frm.doc.quotation) {
        frm.add_custom_button(__('View Quotation'), () => {
            frappe.set_route('Form', 'Quotation', frm.doc.quotation);
        }, __('View'));
    }
}

function show_quotation_dialog(frm) {
    const dialog = new frappe.ui.Dialog({
        title: __('Create Quotation'),
        fields: [
            {
                fieldname: 'quotation_type',
                fieldtype: 'Select',
                label: __('Quotation Type'),
                options: ['Estimate', 'Final'],
                default: 'Estimate',
                reqd: 1,
                description: __('Estimate: Before repairs | Final: After repairs')
            },
            {
                fieldname: 'selection_mode',
                fieldtype: 'Select',
                label: __('Watch Selection'),
                options: ['All Watches', 'Specific Watches'],
                default: 'All Watches',
                reqd: 1
            },
            {
                fieldname: 'watches',
                fieldtype: 'MultiSelect',
                label: __('Select Watches'),
                options: frm.doc.items.map((item, idx) =>
                    `${idx}:::${item.watch_brand} ${item.watch_model} (S/N: ${item.serial_number})`
                ).join('\n'),
                depends_on: 'eval:doc.selection_mode=="Specific Watches"'
            }
        ],
        primary_action_label: __('Create Quotation'),
        primary_action(values) {
            let watch_indices = null;

            if (values.selection_mode === 'Specific Watches') {
                if (!values.watches || values.watches.length === 0) {
                    frappe.msgprint(__('Please select at least one watch'));
                    return;
                }
                // Extract indices from the multiselect values
                watch_indices = values.watches.map(v => parseInt(v.split(':::')[0]));
            }

            frappe.call({
                method: 'watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.create_quotation',
                args: {
                    repair_order_name: frm.doc.name,
                    quotation_type: values.quotation_type,
                    watch_indices: watch_indices
                },
                freeze: true,
                freeze_message: __('Creating Quotation...'),
                callback: function (r) {
                    if (r.message) {
                        frappe.msgprint({
                            title: __('Success'),
                            message: __('Quotation {0} created successfully', [r.message]),
                            indicator: 'green'
                        });
                        frm.reload_doc();
                    }
                }
            });

            dialog.hide();
        }
    });

    dialog.show();
}

// ==================== Billing Functions ====================

function add_billing_buttons(frm) {
    // Create Invoice button
    frm.add_custom_button(__('Create Invoice'), () => {
        show_invoice_dialog(frm);
    }, __('Actions'));

    // View Invoice button
    if (frm.doc.sales_invoice) {
        frm.add_custom_button(__('View Invoice'), () => {
            frappe.set_route('Form', 'Sales Invoice', frm.doc.sales_invoice);
        }, __('View'));
    }
}

function show_invoice_dialog(frm) {
    const has_quotation = frm.doc.quotation ? true : false;
    const quotation_amount = frm.doc.quotation_amount || 0;
    const paid_amount = frm.doc.paid_amount || 0;
    const balance_amount = quotation_amount - paid_amount;

    const dialog = new frappe.ui.Dialog({
        title: __('Create Sales Invoice'),
        fields: [
            {
                fieldname: 'source_type',
                fieldtype: 'Select',
                label: __('Invoice Source'),
                options: has_quotation ? ['From Quotation', 'Direct from Order'] : ['Direct from Order'],
                default: has_quotation ? 'From Quotation' : 'Direct from Order',
                reqd: 1
            },
            {
                fieldname: 'payment_type',
                fieldtype: 'Select',
                label: __('Payment Type'),
                options: paid_amount > 0 ? ['Full Payment', 'Advance Payment', 'Balance Payment'] : ['Full Payment', 'Advance Payment'],
                default: 'Full Payment',
                reqd: 1
            },
            {
                fieldname: 'amount',
                fieldtype: 'Currency',
                label: __('Amount'),
                depends_on: 'eval:doc.payment_type!="Full Payment"',
                description: __('Enter the payment amount')
            },
            {
                fieldname: 'section_break',
                fieldtype: 'Section Break'
            },
            {
                fieldname: 'total_amount_html',
                fieldtype: 'HTML',
                options: `
                    <div class="payment-summary" style="padding: 15px; background: #f8f9fa; border-radius: 5px; margin-top: 10px;">
                        <h4 style="margin-bottom: 10px; color: #333;">Payment Summary</h4>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 5px 0;">Total Amount:</td>
                                <td style="text-align: right; font-weight: bold;">$${quotation_amount.toFixed(2)}</td>
                            </tr>
                            ${paid_amount > 0 ? `
                            <tr>
                                <td style="padding: 5px 0;">Paid Amount:</td>
                                <td style="text-align: right; font-weight: bold; color: #0066cc;">$${paid_amount.toFixed(2)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 5px 0;">Balance Due:</td>
                                <td style="text-align: right; font-weight: bold; color: #ff6600;">$${balance_amount.toFixed(2)}</td>
                            </tr>
                            ` : ''}
                        </table>
                    </div>
                `
            }
        ],
        primary_action_label: __('Create Invoice'),
        primary_action(values) {
            let amount = null;

            if (values.payment_type !== 'Full Payment') {
                if (!values.amount || values.amount <= 0) {
                    frappe.msgprint(__('Please enter a valid amount'));
                    return;
                }
                if (values.amount > balance_amount) {
                    frappe.msgprint(__('Amount cannot exceed balance due ({0})', [balance_amount.toFixed(2)]));
                    return;
                }
                amount = values.amount;
            }

            const source_type = values.source_type === 'From Quotation' ? 'quotation' : 'order';
            const payment_type = values.payment_type === 'Full Payment' ? 'full' :
                values.payment_type === 'Advance Payment' ? 'advance' : 'balance';

            frappe.call({
                method: 'watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.create_sales_invoice',
                args: {
                    repair_order_name: frm.doc.name,
                    source_type: source_type,
                    payment_type: payment_type,
                    amount: amount
                },
                freeze: true,
                freeze_message: __('Creating Invoice...'),
                callback: function (r) {
                    if (r.message) {
                        frappe.msgprint({
                            title: __('Success'),
                            message: __('Sales Invoice {0} created successfully', [r.message]),
                            indicator: 'green'
                        });
                        frm.reload_doc();
                    }
                }
            });

            dialog.hide();
        }
    });

    dialog.show();
}
