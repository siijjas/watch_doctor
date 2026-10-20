/** Point of sale (D9 / D10) and customer profile (D8) calls. */
import { apiFetchRaw } from './apiService';
import type { POSRuntimeConfig } from './apiService';

const call = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T> => {
    const res = await apiFetchRaw(`/api/method/watch_doctor.api.${method}`, { method: 'POST', body: JSON.stringify(args) });
    return res.message as T;
};

export interface TillItem {
    name: string;
    item_name: string;
    item_code: string;
    item_group: string;
    standard_rate: number;
    image?: string | null;
    stock_qty: number;
    is_pms: number;
}

export interface CartLine {
    item_code: string;
    item_name: string;
    qty: number;
    rate: number;
    standard_rate: number;
    stock_qty: number;
    is_pms: number;
}

export interface TillOptions {
    pos_profile?: string;
    sales_person?: string;
    commission_rate?: number;
    receipt_format?: string;
    naming_series?: string;
}

export type DiscountType = 'amount' | 'percent';

export interface TillPreview {
    mixed?: number;
    pms_items?: string[];
    standard_items?: string[];
    net_total: number;
    taxes: number;
    discount: number;
    grand_total: number;
    has_pms_items: number;
    pms_total_vat: number;
    receipt_format: string;
    lines: Array<{ item_code: string; is_pms: number; cost: number; margin: number; vat: number }>;
}

export interface ChargeResult {
    invoice_name: string;
    grand_total: number;
    rounded_total: number;
    outstanding_amount: number;
    is_credit_sale: number;
    has_pms_items: number;
    auto_print: number;
    print_format: string;
    print_url: string;
    replayed?: number;
}

export interface HeldSale {
    name: string;
    customer: string;
    customer_name: string;
    grand_total: number;
    owner: string;
    by: string;
    modified: string;
    items: string[];
}

const cartJson = (lines: CartLine[]) => JSON.stringify(lines.map(l => ({ item_code: l.item_code, qty: l.qty, rate: l.rate })));

export const tillConfig = () => call<POSRuntimeConfig>('get_pos_runtime_config');
export const tillCategories = () => call<Array<{ name: string; items: number }>>('till_categories');
export const tillItems = (search: string, group = '') => call<TillItem[]>('till_items', { search, item_group: group });
export const tillPreview = (customer: string, lines: CartLine[], discount: number, type: DiscountType, options: TillOptions) =>
    call<TillPreview>('till_preview', { customer, items_json: cartJson(lines), discount, discount_type: type, options_json: JSON.stringify(options) });

export interface ChargeInput {
    customer: string;
    lines: CartLine[];
    discount: number;
    discountType: DiscountType;
    mode?: string;
    payments?: Array<{ mode_of_payment: string; amount: number }>;
    credit?: { dueDate: string } | null;
    options: TillOptions;
    heldName?: string | null;
    /** Same value on every retry of one sale, so it is charged once. */
    clientRef?: string;
}
export const tillCharge = (c: ChargeInput) => call<ChargeResult>('till_charge', {
    customer: c.customer,
    items_json: cartJson(c.lines),
    discount: c.discount,
    discount_type: c.discountType,
    payment_mode: c.mode || '',
    payments_json: c.payments?.length ? JSON.stringify(c.payments) : '',
    is_credit_sale: c.credit ? 1 : 0,
    due_date: c.credit?.dueDate || '',
    options_json: JSON.stringify(c.options),
    held_name: c.heldName || '',
    client_ref: c.clientRef || '',
});
export const tillHold = (customer: string, lines: CartLine[], discount: number, type: DiscountType, options: TillOptions, heldName?: string | null) =>
    call<{ held_name: string; grand_total: number }>('till_hold', {
        customer, items_json: cartJson(lines), discount, discount_type: type, options_json: JSON.stringify(options), held_name: heldName || '',
    });
export const tillHeld = () => call<HeldSale[]>('till_held');
export const tillLoad = (heldName: string) => call<{
    held_name: string; customer: string; customer_name: string; discount_amount: number; discount_percent: number;
    items: CartLine[]; options: TillOptions;
}>('till_load', { held_name: heldName });
export const tillDeleteHeld = (heldName: string) => call('delete_pos_draft', { invoice_name: heldName });
export const tillLastReceipt = () => call<{ name: string; grand_total: number; customer_name: string; print_url: string } | null>('till_last_receipt');

export interface OutstandingInvoice {
    name: string;
    customer: string;
    customer_name: string;
    mobile_no: string | null;
    posting_date: string;
    due_date: string;
    grand_total: number;
    outstanding_amount: number;
    dw_is_credit_sale: number;
}
export const tillOutstanding = (search: string) => call<OutstandingInvoice[]>('get_pos_outstanding_invoices', { search, limit: 40 });
export const tillCollect = (invoice: string, mode: string, amount: number, reference: string) =>
    call<{ payment_entry: string; outstanding_amount: number; amount_collected: number }>('till_collect', { invoice_name: invoice, mode_of_payment: mode, amount, reference });

export interface ReturnCandidate { name: string; customer: string; customer_name: string; mobile_no: string | null; posting_date: string; grand_total: number; is_pos: number }
export const tillReturnCandidates = (search: string) => call<ReturnCandidate[]>('get_pos_return_candidates', { search, limit: 30 });
export interface ReturnDetail {
    invoice_name: string;
    customer: string;
    customer_name: string;
    posting_date: string;
    grand_total: number;
    is_pos: number;
    amount_paid: number;
    items: Array<{ row_name: string; item_code: string; item_name: string; rate: number; returnable_qty: number }>;
    paid_modes: string[];
    has_pms_items: number;
}
export const tillReturnDetails = (invoice: string) => call<ReturnDetail>('till_return_details', { invoice_name: invoice });
export const tillReturn = (invoice: string, items: Array<{ row_name: string; qty: number }>, refund: Array<{ mode_of_payment: string; amount: number }>) =>
    call<{ return_invoice: string; grand_total: number; refunded_amount: number }>('create_pos_return', {
        invoice_name: invoice, items_json: JSON.stringify(items), payments_json: JSON.stringify(refund),
    });

// ---------------------------------------------------------------- Customers

export interface CustomerRow { name: string; customer_name: string; mobile_no: string | null; whatsapp_no: string | null; orders: number; open_orders: number; last_order: string | null }
export const listCustomers = (search: string) => call<CustomerRow[]>('list_customers', { search });

export interface CustomerProfile {
    name: string;
    customer_name: string;
    mobile_no: string;
    whatsapp_no: string;
    email_id: string;
    notes: string;
    since: string;
    disabled: number;
    stats: { orders: number; open_orders: number; repairs_billed: number; retail: number; outstanding: number };
    orders: Array<{
        name: string; reference_number: string | null; status: string; docstatus: number; received_date: string; delivery_date: string | null;
        quotation_amount: number; invoiced_amount: number; balance_amount: number;
        watches: Array<{ name: string; watch_brand: string; watch_model: string; serial_number: string | null; status: string; awaiting_parts: number }>;
    }>;
    retail: Array<{ name: string; posting_date: string; grand_total: number; outstanding_amount: number; is_return: number; dw_is_credit_sale: number; dw_has_pms_items: number; items: string[]; modes: string[] }>;
    messages: Array<{ name: string; repair_order: string; label: string; status: string; sent_at: string | null; creation: string; message_body: string; by: string }>;
    watches: Array<{ watch: string; serial: string; repairs: number; last: string }>;
    whatsapp_enabled: boolean;
}
export const getCustomerProfile = (name: string) => call<CustomerProfile>('get_customer_profile', { name });
export const updateCustomer = (name: string, f: { customer_name?: string; mobile?: string; whatsapp?: string; email?: string; notes?: string }) =>
    call('update_customer', { name, ...f });
