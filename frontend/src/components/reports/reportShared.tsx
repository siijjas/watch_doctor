import React from 'react';

// ---- Shared Types ----
export interface ReceivedOrder {
    name: string;
    customer: string;
    customer_name: string;
    status: string;
    priority: string;
    received_date: string;
    promised_delivery_date: string;
    invoiced_amount: number;
}

export interface CompletedOrder {
    name: string;
    customer: string;
    customer_name: string;
    status: string;
    received_date: string;
    invoiced_amount: number;
}

export interface TechnicianTask {
    technician: string;
    technician_name: string;
    tasks_completed: number;
}

export interface TopIssue {
    issue_name: string;
    count: number;
}

export interface PartUsed {
    part: string;
    item_name: string;
    total_qty: number;
    total_amount: number;
}

export interface PaymentBreakdown {
    mode_of_payment: string;
    total: number;
    txn_count: number;
}

export interface ItemSold {
    item_code: string;
    item_name: string;
    total_qty: number;
    rate?: number;
    total_amount: number;
}

export interface RepairReportData {
    received_count: number;
    received_orders: ReceivedOrder[];
    completed_count: number;
    completed_orders: CompletedOrder[];
    pending_count: number;
    inprogress_count: number;
    revenue: number;
    invoice_count: number;
    technician_tasks: TechnicianTask[];
    top_issues: TopIssue[];
    parts_used: PartUsed[];
}

export interface CategoryBreakdown {
    item_group: string;
    total_qty: number;
    total_amount: number;
}

export interface CashierBreakdown {
    owner: string;
    total: number;
    count: number;
}

export interface PosReportData {
    total_sales: number;
    total_retail_sales: number;
    total_b2b_sales: number;
    total_returns: number;
    cash_refunded_returns?: number;
    non_cash_returns?: number;
    net_sales: number;
    transaction_count: number;
    payment_breakdown: PaymentBreakdown[];
    items_sold: ItemSold[];
    category_breakdown: CategoryBreakdown[];
    cashier_breakdown: CashierBreakdown[];
}

export interface ExpenseEntry {
    name: string;
    mode_of_payment: string;
    amount: number;
    remarks: string;
    debit_account?: string;
    party_type?: string;
    party?: string;
}

export interface ExpenseBreakdown {
    mode_of_payment: string;
    total: number;
    count: number;
}

export interface ModeBalance {
    mode_of_payment: string;
    income: number;
    expenses: number;
    balance: number;
}

export interface PaymentEntryRow {
    name: string;
    payment_type: 'Receive' | 'Pay';
    mode_of_payment: string;
    party_type: string;
    party: string;
    party_name: string;
    amount: number;
    remarks: string;
    reference_no?: string;
}

export interface PeModeBreakdown {
    mode_of_payment: string;
    total: number;
    count: number;
}

export interface JournalEntryRow {
    name: string;
    mode_of_payment: string;
    against_account: string;
    amount: number;
    remarks: string;
}

export interface CustomerCollectionRow {
    pe_name: string;
    customer: string;
    customer_name: string;
    invoice: string;
    amount: number;
    mode_of_payment: string;
}

export interface CreditInvoice {
    name: string;
    customer?: string;
    customer_name?: string;
    supplier?: string;
    supplier_name?: string;
    grand_total: number;
    outstanding_amount: number;
}

export interface SalesPurchaseEntry {
    id: string;
    party_name: string;
    amount: number;
    payment_status: string;
    payment_mode: string;
    source: string;
}

export interface FinancialReportData {
    total_expenses: number;
    expense_breakdown: ExpenseBreakdown[];
    expense_entries: ExpenseEntry[];
    repair_payment_breakdown: { mode_of_payment: string; total: number }[];
    pe_entries?: PaymentEntryRow[];
    pe_receive?: PaymentEntryRow[];
    pe_pay?: PaymentEntryRow[];
    total_pe_received?: number;
    total_pe_paid?: number;
    net_pe_cash?: number;
    pe_receive_by_mode?: PeModeBreakdown[];
    pe_pay_by_mode?: PeModeBreakdown[];
    // Purchase vs Operating split
    pe_purchases?: PaymentEntryRow[];
    pe_operating?: PaymentEntryRow[];
    total_pe_purchases?: number;
    total_pe_operating?: number;
    pe_purchases_by_mode?: PeModeBreakdown[];
    pe_operating_by_mode?: PeModeBreakdown[];
    // Journal Entry detail
    je_entries?: JournalEntryRow[];
    je_count?: number;
    je_total?: number;
    je_by_mode?: PeModeBreakdown[];
    // Customer collections (PE Receive against credit SI)
    pe_customer_collections?: CustomerCollectionRow[];
    total_customer_collections?: number;
    // Same-period settlements of this period's own invoices — excluded from
    // total_customer_collections (already in the sales figure) but needed for the
    // by-payment-mode income breakdown, since it's otherwise the only record of that
    // payment's mode (non-POS invoices have no Sales Invoice Payment row).
    same_period_settlements?: { mode_of_payment: string; amount: number }[];
    // Credit invoices
    credit_sales_invoices?: CreditInvoice[];
    total_credit_sales?: number;
    // Non-cash Journal Entry write-offs applying to this period's invoices — reduces what's
    // still owed (already reflected in total_credit_sales) but is not collected cash, so it
    // must also be netted out of Total Income, or a write-off would silently count as income.
    total_written_off?: number;
    credit_purchase_invoices?: CreditInvoice[];
    total_credit_purchases?: number;
    paid_purchase_invoices?: Array<{ name: string; supplier: string; supplier_name: string; grand_total: number; paid_amount?: number; cash_paid?: number; cash_bank_account: string }>;
    total_paid_purchases?: number;
    paid_purchases_by_mode?: PeModeBreakdown[];
    items_purchased?: ItemSold[];
    item_group_profit_summary?: ItemGroupProfitRow[];
    item_profit_summary?: ItemProfitRow[];
    sales_entries?: SalesPurchaseEntry[];
    purchase_entries?: SalesPurchaseEntry[];
    // JE debits on cash/bank:
    //   je_receipt_by_mode    = proportional external portion per mode → adds to income KPI
    //   je_all_debits_by_mode = all JE debits incl. corrections → kept for detail reference
    je_receipts?: (JournalEntryRow & { is_correction?: boolean; external_amount?: number })[];
    je_receipt_total?: number;
    je_receipt_by_mode?: PeModeBreakdown[];
    je_all_debits_by_mode?: PeModeBreakdown[];
    // Non-Customer PE Receives (owner deposits, supplier refunds received, etc.)
    pe_other_receipts?: PaymentEntryRow[];
    total_other_receipts?: number;
    // GL ground-truth cash position (matches "Day Report")
    gl_total_cash_in?: number;
    gl_total_cash_out?: number;
    gl_net_cash?: number;
    gl_account_summary?: Array<{ account: string; total_debit: number; total_credit: number; net: number }>;
    // GL aggregated by payment mode — most accurate per-mode table (all voucher types)
    gl_mode_summary?: Array<{ mode_of_payment: string; total_debit: number; total_credit: number; net: number }>;
    // External cash flow = GL totals minus internal (cash↔cash) transfers — drives KPI cards
    gl_external_cash_in?: number;
    gl_external_cash_out?: number;
    gl_external_net_cash?: number;
    gl_transfer_total?: number;
    internal_transfers?: Array<{ voucher: string; from: string; to: string; amount: number }>;
    // Customer cash refunds — netted out of gl_external_cash_in/out (not new income, not
    // a business expense) but surfaced here for visibility, same pattern as internal_transfers.
    cash_refunded_returns?: number;
    cash_refunded_by_mode?: Record<string, number>;
    non_cash_returns?: number;
    customer_refunds?: CustomerRefundRow[];
}

export interface CustomerRefundRow {
    voucher: string;
    customer: string;
    mode_of_payment: string;
    amount: number;
}

export interface ItemGroupProfitRow {
    item_group: string;
    qty_sold: number;
    sales_amount: number;
    cogs_amount: number;
    gross_profit: number;
    gross_margin_pct: number;
}

export interface ItemProfitRow {
    item_code: string;
    item_name: string;
    item_group: string;
    qty_sold: number;
    selling_rate: number;
    sales_amount: number;
    cogs_rate: number;
    cogs_amount: number;
    gross_profit: number;
    gross_margin_pct: number;
}

export interface DailyReportData {
    date: string;
    repair: RepairReportData;
    pos: PosReportData;
    financial?: FinancialReportData;
}

// ---- Helpers ----
export const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const todayISO = () => new Date().toISOString().slice(0, 10);

// ---- Shared UI Components ----
export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
        {children}
    </h2>
);

export const EmptyState: React.FC<{ label: string }> = ({ label }) => (
    <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-6">{label}</p>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const colors: Record<string, string> = {
        Pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
        'In Progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        Completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        Cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    };
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
            {status}
        </span>
    );
};

type StatColor = 'purple' | 'green' | 'blue' | 'amber' | 'teal' | 'indigo' | 'pink' | 'emerald' | 'rose' | 'sky';

const colorMap: Record<StatColor, string> = {
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    blue: 'from-blue-500 to-blue-600',
    amber: 'from-amber-500 to-amber-600',
    teal: 'from-teal-500 to-teal-600',
    indigo: 'from-indigo-500 to-indigo-600',
    pink: 'from-pink-500 to-pink-600',
    emerald: 'from-emerald-500 to-emerald-600',
    rose: 'from-rose-500 to-rose-600',
    sky: 'from-sky-500 to-sky-600',
};

export interface StatCardProps {
    label: string;
    value: string | number;
    subLabel?: string;
    color: StatColor;
    icon: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subLabel, color, icon }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center text-white shrink-0`}>
            {icon}
        </div>
        <div className="min-w-0">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium truncate">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
            {subLabel && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{subLabel}</p>}
        </div>
    </div>
);

// ---- Shared Icons ----
const i = 'w-5 h-5';

export const InboxIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
);

export const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
);

export const CurrencyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ClockIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const POSIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

export const ReceiptIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
);

export const DocumentIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
);

export const TrendingIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
);

export const UserGroupIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const IssueIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

export const WrenchIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const TagIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`${i} ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
);
