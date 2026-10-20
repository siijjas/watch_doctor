/**
 * Calls for the v2 desk, order page and bench (spec B5.1, B5.4).
 * Every edit changes one thing on one watch; screens reload the order after.
 */
import { apiFetchRaw } from './apiService';
import type { TrackerRow } from './apiService';
import type { StageId } from '../design/stages';

const call = async <T>(method: string, args: Record<string, unknown> = {}): Promise<T> => {
    const res = await apiFetchRaw(`/api/method/watch_doctor.api.${method}`, {
        method: 'POST',
        body: JSON.stringify(args),
    });
    return res.message as T;
};

export type DeskRow = TrackerRow & {
    technician_id: string | null;
    item_idx: number;
    quotation_amount: number | null;
    docstatus: number;
};

export interface DeskQueue {
    rows: DeskRow[];
    attention_after_days: Record<string, number>;
    whatsapp_enabled: boolean;
    truncated: boolean;
}

export const getDeskQueue = (search = '') => call<DeskQueue>('get_order_tracker', { search });

export type StageAction = 'approve' | 'decline' | 'start' | 'complete' | 'parts_wait' | 'parts_arrived';

export const runStageAction = (itemName: string, action: StageAction, parts?: { expectedDate: string; note?: string }) =>
    call<{ watch_status: string }>('update_watch_stage', {
        item_name: itemName, action, expected_date: parts?.expectedDate, note: parts?.note,
    });

export const setWatchStage = (itemName: string, stage: StageId, reason?: string, returnAs?: 'Not Repairable' | 'Declined') =>
    call<{ watch_status: string; stage: StageId }>('set_watch_stage', {
        item_name: itemName, stage, reason, return_as: returnAs,
    });

export interface Technician { name: string; technician_name: string; open_watches: number }
export interface TaskTemplate { name: string; task_name: string; default_rate: number }
export interface PartInfo { name: string; item_name: string; standard_rate: number; stock_uom: string; stock_qty?: number }
export interface ActivityLine { text: string; by: string; at: string }

export interface OrderContext {
    customer: { name: string; customer_name: string; mobile: string; previous_orders: number } | null;
    /** Watch model id → model name, for the watches on this order. */
    models: Record<string, string>;
    received_by: string;
    task_templates: TaskTemplate[];
    technicians: Technician[];
    parts: Record<string, PartInfo>;
    activity: ActivityLine[];
    last_message: { label: string; status: string; sent_at: string | null } | null;
    whatsapp_enabled: boolean;
    quotation: { name: string; status: string; grand_total: number; transaction_date: string; valid_till?: string; docstatus: number } | null;
    quotations: Array<{ name: string; status: string; grand_total: number; transaction_date: string; valid_till?: string }>;
    invoice: { name: string; status: string; grand_total: number; outstanding_amount: number; docstatus: number; posting_date: string } | null;
    invoice_print_format: string | null;
    quotation_print_format: string | null;
    paid_amount: number;
    invoiced_amount: number;
}

export const getOrderContext = (name: string) => call<OrderContext>('get_order_context', { name });

export const assignTechnician = (itemName: string, technician: string) => call('assign_technician', { item_name: itemName, technician });
export const addTask = (itemName: string, service: string) => call('add_task', { item_name: itemName, service });
export const setTaskStatus = (itemName: string, service: string, status: 'Pending' | 'In Progress' | 'Completed') =>
    call('set_task_status', { item_name: itemName, service, status });
export const removeTask = (itemName: string, service: string) => call('remove_task', { item_name: itemName, service });
export const addPart = (itemName: string, part: string, quantity: number, task?: string) =>
    call('add_part', { item_name: itemName, part, quantity, task: task || '' });
export const removePart = (itemName: string, partRow: string) => call('remove_part', { item_name: itemName, part_row: partRow });
export const setAwaitingParts = (itemName: string, waiting: boolean, expectedDate?: string, note?: string) =>
    call('set_awaiting_parts', { item_name: itemName, waiting: waiting ? 1 : 0, expected_date: expectedDate || null, note: note || null });
export const setInternalNote = (itemName: string, note: string) => call('set_internal_note', { item_name: itemName, note });
export type IssueEntry = string | { issue: 'Other'; other_description: string };
export const setWatchIssues = (itemName: string, issues: IssueEntry[]) =>
    call('set_watch_issues', { item_name: itemName, issues: JSON.stringify(issues) });
export const updateOrderDetails = (name: string, fields: { promised_delivery_date?: string; priority?: string; reference_number?: string }) =>
    call('update_order_details', { name, ...fields });

export interface BenchRow {
    item_name: string;
    item_idx: number;
    watch_brand: string;
    watch_model: string;
    serial_number: string | null;
    watch_status: string;
    status_changed_on: string | null;
    awaiting_parts: boolean;
    parts_expected_date: string | null;
    parts_note: string | null;
    technician: string | null;
    repair_order: string;
    reference_number: string | null;
    docstatus: number;
    priority: string;
    received_date: string | null;
    promised_delivery_date: string | null;
    customer_name: string | null;
    tasks_total: number;
    tasks_done: number;
    overdue_days: number;
    stage: StageId;
}

export const getMyBench = () => call<{ technician: string | null; open: BenchRow[]; done_today: BenchRow[] }>('get_my_bench');

export interface HistoryWatch { name: string; watch_brand: string; watch_model: string; status: string; awaiting_parts: number; technician: string | null }
export interface HistoryOrder {
    name: string;
    reference_number: string | null;
    customer: string;
    customer_name: string;
    customer_mobile: string;
    priority: string;
    status: string;
    docstatus: number;
    received_date: string | null;
    promised_delivery_date: string | null;
    delivery_date: string | null;
    quotation: string | null;
    quotation_amount: number | null;
    sales_invoice: string | null;
    invoiced_amount: number | null;
    paid_amount: number | null;
    balance_amount: number | null;
    watches: HistoryWatch[];
}
export interface HistoryFilters {
    search?: string;
    stage?: string;
    technician?: string;
    from_date?: string;
    to_date?: string;
    money?: string;
    show_collected?: boolean;
}

export const listOrderHistory = (start: number, pageLength: number, f: HistoryFilters) =>
    call<{ orders: HistoryOrder[]; total_count: number }>('list_order_history', {
        start, page_length: pageLength, ...f, show_collected: f.show_collected === false ? 0 : 1,
    });

export const setTaskRate = (itemName: string, service: string, rate: number | null) =>
    call('set_task_rate', { item_name: itemName, service, rate: rate == null ? '' : rate });
export const setPartLine = (itemName: string, partRow: string, change: { rate?: number | null; quantity?: number }) =>
    call('set_part_line', {
        item_name: itemName,
        part_row: partRow,
        rate: change.rate === undefined ? undefined : change.rate === null ? '' : change.rate,
        quantity: change.quantity,
    });

export const createEstimate = (name: string, itemNames: string[], type: 'Estimate' | 'Final', validTill: string, note: string) =>
    call<{ quotation: string; grand_total: number }>('create_estimate', {
        name, item_names: JSON.stringify(itemNames), quotation_type: type, valid_till: validTill, note,
    });

export interface CollectInput {
    itemNames: string[];
    discount: number;
    /** One mode: the server charges the exact invoice total. */
    mode?: string;
    /** Split: rows that add up to the previewed total. */
    payments?: Array<{ mode_of_payment: string; amount: number }>;
    credit: { dueDate: string } | null;
    note: string;
}
export interface CollectResult {
    invoice_name: string;
    invoice_total: number;
    outstanding_amount: number;
    is_credit_sale: number;
    order_closed: boolean;
    print_format: string;
}
export const collectWatches = (name: string, c: CollectInput) =>
    call<CollectResult>('collect_watches', {
        name,
        item_names: JSON.stringify(c.itemNames),
        discount: c.discount,
        payments_json: c.payments?.length ? JSON.stringify(c.payments) : '',
        payment_mode: c.mode || '',
        is_credit_sale: c.credit ? 1 : 0,
        due_date: c.credit?.dueDate || '',
        invoice_note: c.note,
    });

export interface CollectPreview { net_total: number; taxes: number; discount: number; grand_total: number }
export const previewCollect = (name: string, itemNames: string[], discount: number) =>
    call<CollectPreview>('preview_collect', { name, item_names: JSON.stringify(itemNames), discount });

export interface WatchFields {
    watch_brand: string;
    watch_model: string;
    serial_number?: string;
    case_type?: string;
    strap_bracelet?: string;
    watch_type?: string;
    dial?: string;
    pre_existing_condition?: string[];
}
export const updateWatchDetails = (itemName: string, fields: Partial<WatchFields>) =>
    call('update_watch_details', { item_name: itemName, fields: JSON.stringify(fields) });
export const addWatch = (name: string, fields: WatchFields) => call('add_watch', { name, fields: JSON.stringify(fields) });

export interface CustomerHit {
    name: string;
    customer_name: string;
    mobile_no: string | null;
    whatsapp_no: string | null;
    orders: number;
    open_orders: number;
    last_order: string | null;
}
export const findCustomers = (txt: string) => call<CustomerHit[]>('find_customers', { txt });
export const checkPhone = (number: string) => call<Array<{ name: string; customer_name: string; mobile_no: string }>>('check_phone', { number });
export const createCustomer = (f: { customer_name: string; mobile: string; whatsapp?: string; email?: string }) =>
    call<CustomerHit>('create_customer', f);

/** Print or PDF of any document in a new tab, without opening Desk. */
export const printUrl = (doctype: string, name: string, format: string, pdf = false) => pdf
    ? `/api/method/frappe.utils.print_format.download_pdf?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&no_letterhead=0`
    : `/printview?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}&format=${encodeURIComponent(format)}&no_letterhead=0`;

/** Opens a Frappe print format in a new tab; `autoPrint` sends it straight to the printer dialog. */
export const openPrint = (orderName: string, format: string, autoPrint = false, size?: { w: number; h: number }) => {
    const url = `/printview?doctype=DW%20Repair%20Order&name=${encodeURIComponent(orderName)}&format=${encodeURIComponent(format)}&no_letterhead=1`;
    const features = size ? `width=${size.w},height=${size.h},menubar=no,toolbar=no,location=no,status=no` : undefined;
    const win = window.open(url, '_blank', features);
    if (win && autoPrint) win.addEventListener('load', () => win.print(), { once: true });
    return !!win;
};
