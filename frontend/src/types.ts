export enum OrderStatus {
    Pending = 'Pending',
    InProgress = 'In Progress',
    CreateEstimate = 'Create Estimate',
    AwaitingParts = 'Awaiting Parts',
    Repaired = 'Repaired',
    Delivered = 'Delivered',
}

export type DWRole = 'executive' | 'data_entry' | 'technician';

export interface UserInfo {
    user: string;
    roles: DWRole[];
    technician?: {
        name: string;
        technician_name: string;
        email?: string;
    } | null;
}

export enum Priority {
    Normal = 'Normal',
    Urgent = 'Urgent',
    VIP = 'VIP',
}

export enum WatchStatus {
    Pending = 'Pending',
    UnderDiagnosis = 'Under Diagnosis',
    Diagnosed = 'Diagnosed',
    CreateEstimate = 'Create Estimate',
    Quoted = 'Quoted',
    InRepair = 'In Repair',
    Completed = 'Completed',
    NotRepairable = 'Not Repairable',
    Declined = 'Declined',
    Delivered = 'Delivered',
}

export enum TaskStatus {
    Pending = 'Pending',
    InProgress = 'In Progress',
    Completed = 'Completed'
}

export type DiagnosisStatus =
    | 'Pending Diagnosis'
    | 'Diagnosed'
    | 'Not Repairable'
    | 'Awaiting Approval'
    | 'Quoted'
    | 'Declined';

export interface DiagnosisContentFields {
    diagnosis_summary?: string[];
    movement_type?: string[];
    movement_caliber?: string[];
    recommended_work?: string[];
}

const DIAGNOSIS_MANUAL_STATUSES: DiagnosisStatus[] = [
    'Not Repairable',
    'Awaiting Approval',
    'Quoted',
    'Declined',
];

export const hasDiagnosisContent = (fields: DiagnosisContentFields): boolean => {
    const listFields = [
        fields.diagnosis_summary,
        fields.movement_type,
        fields.movement_caliber,
    ];

    if (listFields.some((entries) => Array.isArray(entries) && entries.some((entry) => entry.trim()))) {
        return true;
    }

    return (fields.recommended_work || []).some(e => e.trim());
};

export const resolveDiagnosisStatus = (
    currentStatus: DiagnosisStatus | '' | undefined,
    fields: DiagnosisContentFields,
): DiagnosisStatus => {
    if (!hasDiagnosisContent(fields)) {
        return 'Pending Diagnosis';
    }

    if (currentStatus && DIAGNOSIS_MANUAL_STATUSES.includes(currentStatus as DiagnosisStatus)) {
        return currentStatus as DiagnosisStatus;
    }

    return 'Diagnosed';
};

// Represents a DocType record from Frappe
interface FrappeDoc {
    name: string; // Primary key in Frappe
    [key: string]: any; // Allow other fields
}

export interface Customer extends FrappeDoc {
    customer_name: string;
    customer_primary_contact: string;
    email: string;
    phone: string;
}

export interface Employee extends FrappeDoc {
    employee_name: string;
}

export interface Item extends FrappeDoc {
    item_code?: string;
    item_name: string;
    item_group: 'Repair Service' | 'Spare Part';
    standard_rate: number;
    stock_uom: string; // Unit of Measure
    description?: string;
    stock_qty?: number; // Actual stock balance
}

export interface RepairPartUsed {
    name?: string; // Child table records have names too
    part: string; // Link to Item name
    quantity: number;
    uom: string;
    task?: string; // Optional: Link to specific repair task
    // Pricing fields
    rate?: number; // Manual rate override
    auto_rate?: number; // Auto-fetched from item
    amount?: number; // Calculated: quantity × rate
    price_manually_set?: boolean; // Audit flag
    // For frontend display
    part_name?: string;
    part_price?: number;
}

export interface RepairTask {
    name?: string;
    service: string; // Link to DW Task Template name
    technician: string; // Link to Employee name
    notes: string;
    status: TaskStatus;
    // Pricing fields
    rate?: number; // Manual rate override
    auto_rate?: number; // Auto-fetched from template
    price_manually_set?: boolean; // Audit flag
    // For frontend display
    service_name?: string;
    service_price?: number;
}

export interface RepairItem {
    name?: string;
    watch_brand: string;
    watch_model: string;
    serial_number: string;
    issues: RepairItemIssue[];
    issue_description: string;
    pre_existing_condition: string[];
    diagnosis_status: DiagnosisStatus;
    diagnosis_summary: string[];
    movement_type: string[];
    movement_caliber: string[];
    movement_information: string[];
    recommended_work: string[];
    diagnosed_by?: string;
    diagnosis_date?: string;
    technician: string; // Link to Employee name
    status: WatchStatus;
    // Frappe doesn't have a direct checklist field like this,
    // This would typically be implemented as custom Check fields (e.g., 'has_scratches')
    // We'll keep it as a JSON object client-side for now.
    intake_checklist: {
        scratches: boolean;
        water_resistance: boolean;
        missing_parts: boolean;
        other_observations: string;
    };
    tasks: RepairTask[];
    parts_used: RepairPartUsed[];
}

export interface RepairOrder extends FrappeDoc {
    customer: string; // Link to Customer name
    contact_person: string;
    reference_number?: string;
    status: OrderStatus;
    received_date: string;
    promised_delivery_date: string;

    delivery_date?: string;
    priority: Priority;
    items: RepairItem[];
    // Billing fields
    quotation?: string;
    quotation_type?: 'Estimate' | 'Final';
    quotation_amount?: number;
    sales_invoice?: string;
    invoiced_amount?: number;
    paid_amount?: number;
    balance_amount?: number;
    // For frontend display
    customer_name?: string;
    customer_mobile?: string;
}

export interface QuotationSummary {
    quotation_name: string;
    quotation_type: 'Estimate' | 'Final';
    quotation_amount: number;
    status: string;
    created_date: string;
    valid_till?: string;
}

export interface InvoiceSummary {
    invoice_name: string;
    invoice_amount: number;
    paid_amount: number;
    balance_amount: number;
    status: string;
    payment_status: 'Paid' | 'Unpaid';
}

export interface RepairTaskTemplate {
    name: string;
    task_name: string;
    default_rate?: number;
    description?: string;
}

export interface WatchBrand {
    name: string;
    brand_name: string;
    description?: string;
}

export interface WatchModel {
    name: string;
    brand: string;
    model_name: string;
    description?: string;
}

export interface IssueTemplate {
    name: string;
    issue_name: string;
    description?: string;
    suggested_task?: string;
}

export interface WatchConditionTemplate {
    name: string;
    condition_name: string;
    description?: string;
}

export interface DiagnosisSummaryTemplate {
    name: string;
    summary_name: string;
    description?: string;
}

export interface MovementInfoTemplate {
    name: string;
    movement_info: string;
    description?: string;
}

export interface MovementTypeTemplate {
    name: string;
    movement_type: string;
    description?: string;
}

export interface MovementCaliberTemplate {
    name: string;
    caliber_code: string;
    description?: string;
}

export interface RepairItemIssue {
    name?: string;
    issue: string;
    is_other: boolean;
    other_description?: string;
}


