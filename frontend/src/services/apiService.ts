import type { RepairOrder, Customer, Employee, Item, RepairTaskTemplate, WatchBrand, WatchModel, IssueTemplate, QuotationSummary, InvoiceSummary, UserInfo } from '../types';

declare const window: any;

export const isErpNext =
    typeof window !== 'undefined' &&
    (Boolean(window.csrf_token) || (typeof window.frappe !== 'undefined' && Boolean(window.frappe.csrf_token)));

const extractFrappeErrorMessage = (payload: unknown, fallback: string): string => {
    if (!payload || typeof payload !== 'object') {
        return fallback;
    }

    const data = payload as {
        _server_messages?: string;
        message?: string;
        exception?: string;
        exc_type?: string;
    };

    if (data._server_messages) {
        try {
            const messages = JSON.parse(data._server_messages);
            if (Array.isArray(messages) && messages.length > 0) {
                const first = typeof messages[0] === 'string' ? JSON.parse(messages[0]) : messages[0];
                if (first?.message) {
                    return first.message;
                }
            }
        } catch {
            return data._server_messages;
        }
    }

    if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
    }

    if (typeof data.exception === 'string' && data.exception.trim()) {
        const parts = data.exception.split(':');
        return parts.length > 1 ? parts.slice(1).join(':').trim() : data.exception;
    }

    return fallback;
};

const apiFetch = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': window.csrf_token || window.frappe?.csrf_token || '',
            ...(init.headers || {})
        },
        ...init,
    });
    if (!response.ok) {
        const text = await response.text();
        const fallback = text || `Request failed: ${response.status}`;
        let parsed: unknown = null;

        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = null;
        }

        if (parsed) {
            throw new Error(extractFrappeErrorMessage(parsed, fallback));
        }

        const plain = text.replace(/<[^>]*>?/gm, '').trim();
        throw new Error(plain || fallback);
    }
    const data = await response.json();
    return data;
};

// Public wrapper for raw API calls (e.g. email sending)
export const apiFetchRaw = apiFetch;

// Fetch a list of documents
export const getList = async (doctype: string, fields: string[], filters: any[] = [], limit: number = 20): Promise<any[]> => {
    const res = await apiFetch('/api/method/frappe.client.get_list', {
        method: 'POST',
        body: JSON.stringify({
            doctype,
            fields,
            filters,
            limit_page_length: limit,
        }),
    });
    return res.message || [];
};

// Fetch a single document
export const getDoc = async (doctype: string, name: string): Promise<any> => {
    const res = await apiFetch('/api/method/frappe.client.get', {
        method: 'POST',
        body: JSON.stringify({
            doctype,
            name,
        }),
    });
    return res.message;
};

// Helper to recursively remove system fields
const cleanPayload = (obj: any): any => {
    if (Array.isArray(obj)) {
        return obj.map(item => cleanPayload(item));
    }
    if (obj !== null && typeof obj === 'object') {
        // Remove ALL Frappe system fields that cannot be modified
        const {
            modified_by,
            simple_description,
            docstatus,
            __islocal,
            __unsaved,
            __onload,
            ...rest
        } = obj;
        const cleaned: any = {};
        for (const key in rest) {
            cleaned[key] = cleanPayload(rest[key]);
        }
        return cleaned;
    }
    return obj;
};

// Save a document (Create or Update)
export const saveDoc = async (doc: any): Promise<any> => {
    const doctype = doc.doctype;
    if (!doctype) {
        throw new Error('doctype is required on the document');
    }

    // Clean the entire payload recursively
    const docToSave = cleanPayload(doc);

    // Debug: log what we're sending (remove in production)
    console.log('Saving document:', doctype, docToSave);

    if (doc.name) {
        const res = await apiFetch('/api/method/frappe.client.save', {
            method: 'POST',
            body: JSON.stringify({ doc: docToSave }),
        });
        return res.message;
    }
    const res = await apiFetch('/api/method/frappe.client.insert', {
        method: 'POST',
        body: JSON.stringify({ doc: docToSave }),
    });
    return res.message;
};

// Delete a document
export const deleteDoc = async (doctype: string, name: string): Promise<any> => {
    return apiFetch('/api/method/frappe.client.delete', {
        method: 'POST',
        body: JSON.stringify({ doctype, name }),
    });
};

// Fetch current user's DW roles and technician info
export const getUserInfo = async (): Promise<UserInfo> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_user_info', { method: 'POST', body: JSON.stringify({}) });
    return res.message as UserInfo;
};

// Specific API functions for the Watch Repair App
// NOTE: We transform the frontend's nested structure into the backend's flat structure here.

const unflattenRepairOrder = (order: any): RepairOrder => {
    const items = (order.items || []).map((item: any, index: number) => {
        // CRITICAL: We use idx (1-based index) as the repair_item_key during save.
        // Frappe automatically assigns idx to child table rows (1, 2, 3...).
        // So we match tasks where repair_item_key == item.idx (or the index + 1).

        const itemKey = item.idx ? item.idx.toString() : (index + 1).toString();

        const tasks = (order.all_tasks || []).filter((t: any) => t.repair_item_key === itemKey).map((t: any) => ({ ...t, doctype: 'DW Repair Task' }));
        const parts_used = (order.all_parts || []).filter((p: any) => p.repair_item_key === itemKey).map((p: any) => ({ ...p, doctype: 'DW Repair Part Used' }));
        const issues = (order.all_issues || []).filter((i: any) => i.repair_item_key === itemKey).map((i: any) => ({ ...i, doctype: 'DW Repair Item Issue' }));

        return {
            ...item,
            tasks,
            parts_used,
            issues,
            doctype: 'DW Repair Item'
        };
    });

    return { ...order, items };
};

export const getRepairOrders = async (): Promise<RepairOrder[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.list_repair_orders', { method: 'POST', body: JSON.stringify({}) });
    const orders = res.message || [];
    return orders.map((o: any) => ({ ...o, items: [] })); // List view doesn't need details
};

export const getRepairOrder = async (name: string): Promise<RepairOrder> => {
    const doc = await getDoc('DW Repair Order', name);
    return unflattenRepairOrder(doc);
};

export const saveRepairOrder = async (order: RepairOrder): Promise<RepairOrder> => {
    // 1. Prepare flat lists
    const all_tasks: any[] = [];
    const all_parts: any[] = [];
    const all_issues: any[] = [];

    // 2. Map items
    const items = (order.items || []).map((item, index) => {
        // Determine key. If item has name, use it. If not, use index? 
        // Problem: If it's a new item, it has no name.
        // If we save a new item, we need a key that persists or allows reconstruction?
        // Actually, if we use a temporary key (like "new_0", "new_1"), we can't search by it later unless we save that key in the item too?
        // OR: We entrust the backend to assign names?
        // Wait, if we use `idx` (1-based index) as key.
        // Frappe maintains `idx` for child tables.
        // So if we save `repair_item_key` = `item.idx` (or simply the loop index + 1),
        // and when we fetch, we match `repair_item_key` == `item.idx`.

        // However, `idx` can shift if we insert/delete in the middle.
        // But for a single save operation, it's consistent.
        // The issue is subsequent fetches.
        // The backend `idx` is reliable for ordering.
        // Let's assume we use the ITEM NAME as the key for existing items.
        // For NEW items, we can't use name.
        // But wait! If we save the parent, the children get saved and named in the same transaction.
        // But how do we link the parallel "all_tasks" list to the "items" list *in the database*?
        // We can't easily link new records to new records in one pass if they depend on generated IDs.

        // SOLUTION: Use a temporary GUID or unique string for the link if name is missing?
        // We can add `temp_id` to `DW Repair Item`? No schema change if possible.
        // We can use `repair_item_key` on the Item too? (Abuse a field or add one).

        // Alternative: Use the `idx`.
        // If we rely on `idx`, we must ensure `items` are saved with correct `idx`.
        // The frontend array index + 1 IS the `idx`.
        // So we save `repair_item_key` = (index + 1).toString() in tasks.
        // And when searching, we match `repair_item_key` == `item.idx`.
        // This is robust enough for "Save -> Load".
        // Warning: If user deletes item 2, item 3 becomes item 2.
        // We must ensure that tasks for old item 3 are updated to key 2.
        // Since we RE-GENERATE the full list on every save, this IS consistent!
        // We are wiping and replacing the lists basically (from the perspective of the mapper).

        const listIndex = index + 1;
        const key = item.name ? item.name : `idx_${listIndex}`;
        // Actually, mixing name and idx is dangerous.
        // Let's stick to ONE strategy if possible.
        // If we use `item.name` for existing, we are good.
        // If we use a specialized key for new items...
        // Fetching relies on `item.name`.
        // But `item.idx` is always available on fetch.

        // Let's use `name` if available, otherwise how to link?
        // We can't link new rows in `all_tasks` to new rows in `items` easily in standard API 
        // unless we use `doc.items[i].name` which doesn't exist yet.

        // Ok, Strategy change: Use `idx` strictly.
        // BUT `get_doc` returning `items` might not correspond perfectly to our logic if we aren't careful?
        // `item.idx` is standard.
        // Let's use `item.name` if it exists.
        // If it does NOT exist (new item), we use a placeholder?
        // No, that won't save.

        // WAIT. If we use `idx`, we can query `all_tasks` where `repair_item_key` == `item.idx`.
        // This works perfectly fine even for new items, assuming Frappe saves them with the order we provide.
        // Yes it does.

        // Verification: If I delete item 1, item 2 becomes item 1.
        // My code generates new task list where tasks for "old item 2" now have key "1".
        // So it matches "new item 1".
        // This works!

        const itemKey = (index + 1).toString(); // Using 1-based index as key for now. 
        // But wait, if we load an EXISTING order, the item has a name.
        // We should PROBABLY prefer `item.name` to be safe against reordering if we used name before?
        // Actually, if we always rewriting the tasks list, `idx` is safe.
        // On load, we need to map back.
        // `item.idx` will be 1, 2, 3...
        // So `repair_item_key` should consistently use `idx`.

        // HOWEVER: `item.idx` property might be missing in frontend object.
        // But the loop index is reliable.

        (item.tasks || []).forEach(t => {
            all_tasks.push({
                ...t,
                name: t.name || undefined, // Keep existing ID if any? 
                // Careful: if we switch keys, we might want to let Frappe handle assignment?
                // If we keep IDs, we update existing rows. 
                // If we use idx, and the item moved, the task "moves" with it logically.
                repair_item_key: itemKey,
                doctype: 'DW Repair Task'
            });
        });

        (item.parts_used || []).forEach(p => {
            all_parts.push({
                ...p,
                name: p.name || undefined,
                repair_item_key: itemKey,
                doctype: 'DW Repair Part Used'
            });
        });

        (item.issues || []).forEach(i => {
            all_issues.push({
                ...i,
                name: i.name || undefined,
                repair_item_key: itemKey,
                doctype: 'DW Repair Item Issue'
            });
        });

        return {
            name: item.name || undefined,
            idx: index + 1, // Include idx for proper child table row matching
            watch_brand: item.watch_brand,
            watch_model: item.watch_model,
            serial_number: item.serial_number,
            issue_description: item.issue_description,
            technician: item.technician,
            status: item.status,
            intake_checklist: item.intake_checklist,
            // Keep nested structures for backend flattening
            tasks: item.tasks || [],
            parts_used: item.parts_used || [],
            issues: item.issues || [],
            doctype: 'DW Repair Item'
        };
    });

    const docToSave = {
        name: order.name || undefined,
        customer: order.customer,
        contact_person: order.contact_person,
        reference_number: order.reference_number,
        status: order.status,
        priority: order.priority,
        received_date: order.received_date,
        promised_delivery_date: order.promised_delivery_date,
        delivery_date: order.delivery_date,
        doctype: 'DW Repair Order',
        modified: order.modified, // Pass the modified timestamp to handle concurrency checks
        items: items,
        all_tasks: all_tasks,
        all_parts: all_parts,
        all_issues: all_issues
    };

    // Use custom save API that handles system fields server-side
    const res = await apiFetch('/api/method/watch_doctor.api.save_repair_order', {
        method: 'POST',
        body: JSON.stringify({ doc_json: JSON.stringify(docToSave) }),
    });
    // Unflatten so callers get items with nested issues/tasks/parts
    return unflattenRepairOrder(res.message);
};

export const deleteRepairOrder = (name: string): Promise<any> => {
    return apiFetch(`/api/resource/DW Repair Order/${name}`, {
        method: 'DELETE',
    });
};

export const submitRepairOrder = async (name: string): Promise<void> => {
    // First, get the latest version of the document
    const doc = await getDoc('DW Repair Order', name);

    // Then submit it with the latest modified timestamp
    await apiFetch('/api/method/frappe.client.submit', {
        method: 'POST',
        body: JSON.stringify({
            doc: JSON.stringify(doc)
        }),
    });
};

export const cancelRepairOrder = async (name: string): Promise<void> => {
    await apiFetch('/api/method/frappe.client.cancel', {
        method: 'POST',
        body: JSON.stringify({
            doctype: 'DW Repair Order',
            name: name
        }),
    });
};

// --- Dependency Fetchers for Forms ---

export const getCustomers = async (search: string = ''): Promise<Customer[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.search_customers', {
        method: 'POST',
        body: JSON.stringify({ txt: search }),
    });
    return res.message || [];
};

export const createCustomer = async (data: { customer_name: string; mobile_no?: string; email_id?: string }): Promise<Customer> => {
    const customer = {
        doctype: 'Customer',
        customer_name: data.customer_name,
        customer_type: 'Individual',
        customer_group: 'Individual',
        territory: 'All Territories',
        mobile_no: data.mobile_no,
        email_id: data.email_id
    };
    return await saveDoc(customer);
};

export const getEmployees = (): Promise<Employee[]> => {
    // Use DW Technician custom doctype for technician selection
    return getList('DW Technician', ['name', 'technician_name as employee_name']);
};

export const getItems = async (): Promise<Item[]> => {
    // Fetch all items (not just spare parts) for flexibility
    return getList('Item', ['name', 'item_code', 'item_name', 'item_group', 'standard_rate', 'stock_uom', 'description'], [], 500);
};


export const searchItems = async (query: string = '', itemGroup: string = ''): Promise<Item[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.search_items', {
        method: 'POST',
        body: JSON.stringify({ txt: query, item_group: itemGroup }),
    });
    return res.message || [];
};

export const getItemsByIds = async (itemIds: string[]): Promise<Item[]> => {
    if (itemIds.length === 0) return [];

    // Fetch specific items by their IDs
    const items = await Promise.all(
        itemIds.map(id =>
            apiFetch('/api/method/frappe.client.get', {
                method: 'POST',
                body: JSON.stringify({ doctype: 'Item', name: id })
            }).then(res => res.message).catch(() => null)
        )
    );

    return items.filter(item => item !== null);
};


export const getTaskTemplates = async (): Promise<RepairTaskTemplate[]> => {
    return getList('DW Task Template', ['name', 'task_name', 'default_rate', 'description'], [], 500);
};

export const getWatchBrands = async (search: string = ''): Promise<WatchBrand[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_watch_brands', {
        method: 'POST',
        body: JSON.stringify({ txt: search }),
    });
    return res.message || [];
};

export const createWatchBrand = async (brandName: string, description: string = ''): Promise<WatchBrand> => {
    const res = await apiFetch('/api/method/watch_doctor.api.create_watch_brand', {
        method: 'POST',
        body: JSON.stringify({ brand_name: brandName, description }),
    });
    return res.message;
};

export const getWatchModels = async (brand: string, search: string = ''): Promise<WatchModel[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_watch_models', {
        method: 'POST',
        body: JSON.stringify({ brand, txt: search }),
    });
    return res.message || [];
};

export const getWatchModelsByIds = async (modelIds: string[]): Promise<WatchModel[]> => {
    if (!modelIds.length) {
        return [];
    }

    const models = await Promise.all(
        modelIds.map(id =>
            apiFetch('/api/method/frappe.client.get', {
                method: 'POST',
                body: JSON.stringify({ doctype: 'DW Watch Model', name: id })
            }).then(res => res.message).catch(() => null)
        )
    );

    return models.filter(model => model !== null);
};

export const createWatchModel = async (brand: string, modelName: string, description: string = ''): Promise<WatchModel> => {
    const res = await apiFetch('/api/method/watch_doctor.api.create_watch_model', {
        method: 'POST',
        body: JSON.stringify({ brand, model_name: modelName, description }),
    });
    return res.message;
};

export const getIssueTemplates = async (): Promise<IssueTemplate[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_issue_templates', {
        method: 'POST',
    });
    return res.message || [];
};

export const getCountryCodes = async (): Promise<{ name: string, country_name: string, code: string }[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_country_codes', {
        method: 'POST',
    });
    return res.message || [];
};


// ============ DASHBOARD APIs ============

export interface DashboardStats {
    total_orders: number;
    pending: number;
    in_progress: number;
    awaiting_parts: number;
    repaired: number;
    delivered: number;
    orders_in_period: number;
    completed_in_period: number;
    revenue_this_month: number;
    avg_repair_days: number;
    period_days: number;
}

export interface OrdersTrendItem {
    date: string;
    label: string;
    received: number;
    completed: number;
}

export interface TechnicianStats {
    technician: string;
    technician_name: string;
    total_tasks: number;
    completed: number;
    in_progress: number;
    pending: number;
}

export interface TopIssue {
    issue_name: string;
    count: number;
    percentage: number;
}

export const getDashboardStats = async (days: number = 7): Promise<DashboardStats> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_dashboard_stats', {
        method: 'POST',
        body: JSON.stringify({ days }),
    });
    return res.message;
};

export const getOrdersTrend = async (days: number = 7): Promise<OrdersTrendItem[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_orders_trend', {
        method: 'POST',
        body: JSON.stringify({ days }),
    });
    return res.message || [];
};

export const getTechnicianStats = async (): Promise<TechnicianStats[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_technician_stats', {
        method: 'POST',
    });
    return res.message || [];
};

export const getTopIssues = async (limit: number = 10): Promise<TopIssue[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_top_issues', {
        method: 'POST',
        body: JSON.stringify({ limit }),
    });
    return res.message || [];
};

export interface PendingOrder {
    name: string;
    customer: string;
    customer_name: string;
    received_date: string;
    status: string;
    days_pending: number;
}

export const getAgedPendingOrders = async (limit: number = 5): Promise<PendingOrder[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_aged_pending_orders', {
        method: 'POST',
        body: JSON.stringify({ limit }),
    });
    return res.message || [];
};
// --- Quotation and Billing API Methods ---

export const createQuotation = async (
    repairOrderName: string,
    quotationType: 'Estimate' | 'Final',
    watchIndices?: number[]
): Promise<string> => {
    const payload: any = {
        repair_order_name: repairOrderName,
        quotation_type: quotationType
    };

    // Only include watch_indices if it's actually provided
    if (watchIndices && watchIndices.length > 0) {
        payload.watch_indices = JSON.stringify(watchIndices);
    }

    const res = await apiFetch('/api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.create_quotation', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    return res.message; // Returns quotation name
};

export const createInvoice = async (
    repairOrderName: string,
    sourceType: 'quotation' | 'order',
    paymentType: 'full' | 'advance' | 'balance',
    amount?: number
): Promise<{ invoice_name: string; invoice_amount: number }> => {
    const res = await apiFetch('/api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.create_sales_invoice', {
        method: 'POST',
        body: JSON.stringify({
            repair_order_name: repairOrderName,
            source_type: sourceType,
            payment_type: paymentType,
            amount: amount
        }),
    });
    return res.message;
};

export const getQuotationSummary = async (repairOrderName: string): Promise<any> => {
    const res = await apiFetch('/api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.get_quotation_summary', {
        method: 'POST',
        body: JSON.stringify({
            repair_order_name: repairOrderName
        }),
    });
    return res.message;
};

export const getInvoiceSummary = async (repairOrderName: string): Promise<any> => {
    const res = await apiFetch('/api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.get_invoice_summary', {
        method: 'POST',
        body: JSON.stringify({
            repair_order_name: repairOrderName
        }),
    });
    return res.message;
};

export const finalizeInvoice = async (
    repairOrderName: string,
    invoiceName: string,
    discount: number = 0,
    paymentMode: string = 'Cash',
    markAsDelivered: boolean = true
): Promise<any> => {
    const res = await apiFetch('/api/method/watch_doctor.repair_management.doctype.dw_repair_order.dw_repair_order.finalize_invoice', {
        method: 'POST',
        body: JSON.stringify({
            repair_order_name: repairOrderName,
            invoice_name: invoiceName,
            discount: discount,
            payment_mode: paymentMode,
            mark_as_delivered: markAsDelivered
        }),
    });
    return res.message;
};

export const getPaymentModes = async (): Promise<any[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_payment_modes', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message || [];
};

// ==================== App Config APIs ====================

export const getAppConfig = async (): Promise<{ logo_url: string; currency_code: string; currency_symbol: string; decimal_places: number }> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_app_config', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message || { logo_url: '', currency_code: '', currency_symbol: '', decimal_places: 0 };
};

export const saveLogoUrl = async (logoUrl: string): Promise<void> => {
    await apiFetch('/api/method/watch_doctor.api.save_logo_url', {
        method: 'POST',
        body: JSON.stringify({ logo_url: logoUrl }),
    });
};

export interface PmsConfiguration {
    pms_enabled: number;
    pms_item_group: string;
    pms_vat_account: string;
    pms_disclaimer: string;
    standard_sales_taxes_template: string;
    standard_item_tax_template: string;
    pms_print_format: string;
    pms_vat_divisor: number;
}

export interface PmsConfigurationOptions {
    item_groups: string[];
    tax_accounts: string[];
    sales_taxes_templates: string[];
    item_tax_templates: string[];
    print_formats: string[];
}

export const getPmsConfiguration = async (): Promise<{ config: PmsConfiguration; options: PmsConfigurationOptions }> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_pms_configuration', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message;
};

export const savePmsConfiguration = async (config: PmsConfiguration): Promise<{ success: boolean; config: PmsConfiguration }> => {
    const res = await apiFetch('/api/method/watch_doctor.api.save_pms_configuration', {
        method: 'POST',
        body: JSON.stringify(config),
    });
    return res.message;
};

export const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('is_private', '0');
    formData.append('folder', 'Home/Attachments');

    const response = await fetch('/api/method/upload_file', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'X-Frappe-CSRF-Token': window.csrf_token || window.frappe?.csrf_token || '',
        },
        body: formData,
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Upload failed: ${response.status}`);
    }
    const data = await response.json();
    return data.message?.file_url || '';
};

// ==================== POS APIs ====================

export interface POSItem {
    name: string;
    item_name: string;
    item_code: string;
    item_group: string;
    standard_rate: number;
    image: string | null;
    stock_qty: number;
}

export interface POSCustomer {
    name: string;
    customer_name: string;
}

export interface CartItem {
    item_code: string;
    item_name: string;
    qty: number;
    rate: number;
}

export interface POSPaymentSplit {
    mode_of_payment: string;
    amount: number;
}

export interface POSRuntimeConfig {
    pos_profile: string;
    default_customer: string;
    default_customer_name: string;
    default_receipt_format: string;
    auto_print: number;
    default_sales_person: string;
    default_commission_rate: number;
    allowed_naming_series: string[];
    available_naming_series?: string[];
    print_formats: string[];
    sales_persons: string[];
}

export interface POSOptions {
    company?: string;
    pos_profile?: string;
    sales_person?: string;
    commission_rate?: number;
    receipt_format?: string;
    naming_series?: string;
}

export interface POSDraft {
    name: string;
    customer: string;
    customer_name: string;
    grand_total: number;
    item_count: number;
    creation: string;
    modified: string;
}

export const getPosRuntimeConfig = async (company: string = '', posProfile: string = ''): Promise<POSRuntimeConfig> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_pos_runtime_config', {
        method: 'POST',
        body: JSON.stringify({ company, pos_profile: posProfile }),
    });
    return res.message || {
        pos_profile: '',
        default_customer: '',
        default_customer_name: '',
        default_receipt_format: '',
        auto_print: 0,
        default_sales_person: '',
        default_commission_rate: 0,
        allowed_naming_series: [],
        available_naming_series: [],
        print_formats: [],
        sales_persons: [],
    };
};

export const getPosItems = async (search: string = ""): Promise<POSItem[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_pos_items', {
        method: 'POST',
        body: JSON.stringify({ search, in_stock_only: 1 }),
    });
    return res.message || [];
};

export const getPosCustomers = async (search: string = ""): Promise<POSCustomer[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_pos_customers', {
        method: 'POST',
        body: JSON.stringify({ search }),
    });
    return res.message || [];
};

const normalizePosPayments = (payments: POSPaymentSplit[] | string): POSPaymentSplit[] => {
    if (typeof payments === 'string') {
        return [{ mode_of_payment: payments, amount: 0 }];
    }
    return payments;
};

export const createPosInvoice = async (
    customer: string,
    items: CartItem[],
    payments: POSPaymentSplit[] | string = "Cash",
    discountPercent: number = 0,
    options: POSOptions = {}
): Promise<{ invoice_name: string; grand_total: number; customer: string; auto_print: number; print_format?: string; print_url?: string }> => {
    const normalizedPayments = normalizePosPayments(payments);
    const primaryMode = typeof payments === 'string'
        ? payments
        : (normalizedPayments[0]?.mode_of_payment || 'Cash');

    const res = await apiFetch('/api/method/watch_doctor.api.create_pos_invoice', {
        method: 'POST',
        body: JSON.stringify({
            customer,
            items_json: JSON.stringify(items),
            payment_mode: primaryMode,
            payments_json: JSON.stringify(normalizedPayments),
            discount_percent: discountPercent,
            options_json: JSON.stringify(options),
        }),
    });
    return res.message;
};

export const savePosDraft = async (
    customer: string,
    items: CartItem[],
    options: POSOptions = {}
): Promise<{ invoice_name: string; grand_total: number; customer: string }> => {
    const res = await apiFetch('/api/method/watch_doctor.api.save_pos_draft', {
        method: 'POST',
        body: JSON.stringify({
            customer,
            items_json: JSON.stringify(items),
            options_json: JSON.stringify(options),
        }),
    });
    return res.message;
};

export const getPosDrafts = async (): Promise<POSDraft[]> => {
    const res = await apiFetch('/api/method/watch_doctor.api.get_pos_drafts', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message || [];
};

export const loadPosDraft = async (invoiceName: string): Promise<{
    invoice_name: string;
    customer: string;
    customer_name: string;
    items: CartItem[];
    grand_total: number;
    pos_profile: string;
    sales_person: string;
    commission_rate: number;
    receipt_format: string;
    naming_series: string;
}> => {
    const res = await apiFetch('/api/method/watch_doctor.api.load_pos_draft', {
        method: 'POST',
        body: JSON.stringify({ invoice_name: invoiceName }),
    });
    return res.message;
};

export const deletePosDraft = async (invoiceName: string): Promise<{ success: boolean }> => {
    const res = await apiFetch('/api/method/watch_doctor.api.delete_pos_draft', {
        method: 'POST',
        body: JSON.stringify({ invoice_name: invoiceName }),
    });
    return res.message;
};

export const submitPosDraft = async (
    invoiceName: string,
    payments: POSPaymentSplit[] | string = "Cash",
    discountPercent: number = 0,
    options: POSOptions = {}
): Promise<{ invoice_name: string; grand_total: number; customer: string; auto_print: number; print_format?: string; print_url?: string }> => {
    const normalizedPayments = normalizePosPayments(payments);
    const primaryMode = typeof payments === 'string'
        ? payments
        : (normalizedPayments[0]?.mode_of_payment || 'Cash');

    const res = await apiFetch('/api/method/watch_doctor.api.submit_pos_draft', {
        method: 'POST',
        body: JSON.stringify({
            invoice_name: invoiceName,
            payment_mode: primaryMode,
            payments_json: JSON.stringify(normalizedPayments),
            discount_percent: discountPercent,
            options_json: JSON.stringify(options),
        }),
    });
    return res.message;
};

// ==================== WhatsApp Notifications ====================

export interface WhatsAppConfig {
    enabled: boolean;
    cooldown_minutes: number;
}

export interface WhatsAppNotificationStatus {
    status: string;
    order_status: string;
    sent_at: string | null;
    creation: string;
    message_body: string;
}

export interface WhatsAppTemplate {
    name: string;
    notification_key: string;
    label: string;
    message_body: string;
    is_active: number;
}

export interface NotificationPreview {
    customer_name: string;
    phone_display: string;
    message_body: string;
}

export const previewNotification = async (orderName: string): Promise<NotificationPreview> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.preview_notification', {
        method: 'POST',
        body: JSON.stringify({ repair_order_name: orderName }),
    });
    return res.message;
};

export const notifyCustomer = async (orderName: string): Promise<{ status: string; log_name: string }> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.notify_customer', {
        method: 'POST',
        body: JSON.stringify({ repair_order_name: orderName }),
    });
    return res.message;
};

export const getNotificationStatus = async (orderName: string): Promise<WhatsAppNotificationStatus | null> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.get_notification_status', {
        method: 'POST',
        body: JSON.stringify({ repair_order_name: orderName }),
    });
    return res.message;
};

export const getWhatsAppConfig = async (): Promise<WhatsAppConfig> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.get_whatsapp_config', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message;
};

export const getWhatsAppTemplates = async (): Promise<WhatsAppTemplate[]> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.get_whatsapp_templates', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message || [];
};

export interface WhatsAppPlaceholder {
    token: string;
    label: string;
    sample: string;
}

export const getTemplatePlaceholders = async (): Promise<WhatsAppPlaceholder[]> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.get_template_placeholders', {
        method: 'POST',
        body: JSON.stringify({}),
    });
    return res.message || [];
};

export const saveWhatsAppTemplate = async (
    notificationKey: string,
    messageBody: string,
    isActive: number = 1
): Promise<{ status: string }> => {
    const res = await apiFetch('/api/method/watch_doctor.whatsapp.api.save_whatsapp_template', {
        method: 'POST',
        body: JSON.stringify({
            notification_key: notificationKey,
            message_body: messageBody,
            is_active: isActive,
        }),
    });
    return res.message;
};
