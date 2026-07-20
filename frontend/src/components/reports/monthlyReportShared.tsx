// Shared types + helpers for the Monthly Executive Summary / Monthly Sales & Purchase
// reports. Mirrors reportShared.tsx but for watch_doctor.monthly_executive_report and
// watch_doctor.monthly_sales_purchase_report, which return a {current, previous, ...}
// shape (period-over-period comparison) rather than a single day's snapshot.

import type { PaymentBreakdown, CategoryBreakdown, CashierBreakdown, PeModeBreakdown, CreditInvoice, CustomerRefundRow } from './reportShared';

export interface ExpenseByAccount {
    account: string;
    total: number;
}

export interface ItemGroupBreakdownRow {
    item_group: string;
    qty_sold: number;
    sales_amount: number;
    cogs_amount: number;
    gross_profit: number;
}

export interface MonthlyExecutivePeriod {
    from_date: string;
    to_date: string;
    repair_revenue: number;
    repair_revenue_gross: number;
    retail_sales: number;
    retail_sales_gross: number;
    b2b_sales: number;
    b2b_sales_gross: number;
    returns: number;
    returns_gross: number;
    net_revenue: number;
    vat_collected: number;
    gross_revenue: number;
    cogs_amount: number;
    gross_profit: number;
    gross_margin_pct: number;
    item_group_breakdown: ItemGroupBreakdownRow[];
    operating_expenses_total: number;
    expense_by_account: ExpenseByAccount[];
    net_profit: number;
    net_margin_pct: number;
}

export interface MonthlyComparisonRow {
    metric: string;
    label: string;
    current: number;
    previous: number;
    delta: number;
    delta_pct: number;
}

export interface MonthlyExecutiveSummaryData {
    current: MonthlyExecutivePeriod;
    previous: MonthlyExecutivePeriod;
    comparison: MonthlyComparisonRow[];
}

export interface TopTechnicianRow {
    technician_name: string;
    watches_completed: number;
}

export interface TopBrandRow {
    watch_brand: string;
    watches_serviced: number;
}

export interface TopItemSoldRow {
    item_name: string;
    qty_sold: number;
    total_amount: number;
}

export interface TopSupplierRow {
    supplier_name: string;
    total_spend: number;
}

export interface TopItemPurchasedRow {
    item_name: string;
    qty_purchased: number;
    total_amount: number;
}

export interface MonthlySalesPurchasePeriod {
    from_date: string;
    to_date: string;
    period_days: number;
    repair_invoice_count: number;
    retail_invoice_count: number;
    b2b_invoice_count: number;
    avg_repair_order_value: number;
    avg_retail_order_value: number;
    avg_b2b_order_value: number;
    orders_received: number;
    orders_delivered: number;
    backlog_open: number;
    quoted_orders: number;
    quoted_and_invoiced: number;
    conversion_rate_pct: number;
    top_technicians: TopTechnicianRow[];
    top_brands: TopBrandRow[];
    top_items_sold: TopItemSoldRow[];
    cogs_amount: number;
    total_procurement_spend: number;
    procurement_cogs_gap: number;
    top_suppliers: TopSupplierRow[];
    top_items_purchased: TopItemPurchasedRow[];
}

export interface MonthlySalesPurchaseSummaryData {
    current: MonthlySalesPurchasePeriod;
    previous: MonthlySalesPurchasePeriod;
    stock_value: number;
    days_inventory_outstanding: number;
    ar_outstanding: number;
    ap_outstanding: number;
}

export interface TopSalesInvoiceRow {
    name: string;
    party_name: string;
    amount: number;
    payment_status: string;
    payment_mode: string;
}

export interface TopPurchaseInvoiceRow {
    name: string;
    party_name: string;
    amount: number;
    payment_status: string;
}

export interface UnpaidInvoiceRow {
    name: string;
    party_name: string;
    grand_total: number;
    outstanding_amount: number;
}

/** watch_doctor.monthly_sales_report.get_monthly_sales_report — the daily Sales &
 * Purchase report's sales/purchase mix aggregated over a date range. Item-level
 * lists are omitted (too long for a month); invoice ledgers are capped to the
 * highest-value entries plus a separate always-shown unpaid list. */
export interface MonthlySalesReportData {
    from_date: string;
    to_date: string;
    net_sales: number;
    total_retail_sales: number;
    total_b2b_sales: number;
    total_returns: number;
    transaction_count: number;
    payment_breakdown: PaymentBreakdown[];
    category_breakdown: CategoryBreakdown[];
    cashier_breakdown: CashierBreakdown[];
    top_sales_invoices: TopSalesInvoiceRow[];
    unpaid_sales_invoices: UnpaidInvoiceRow[];
    total_unpaid_sales: number;
    total_pe_purchases: number;
    pe_purchases_by_mode: PeModeBreakdown[];
    total_paid_purchases: number;
    paid_purchases_by_mode: PeModeBreakdown[];
    top_purchase_invoices: TopPurchaseInvoiceRow[];
    unpaid_purchase_invoices: UnpaidInvoiceRow[];
    total_unpaid_purchases: number;
}

// ---- Helpers ----

/** First day of the given "YYYY-MM" month, as "YYYY-MM-DD". */
export const monthStart = (monthValue: string) => `${monthValue}-01`;

/** Last day of the given "YYYY-MM" month, as "YYYY-MM-DD". */
export const monthEnd = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    // Day 0 of next month = last day of this month.
    const last = new Date(year, month, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
};

export const currentMonthISO = () => new Date().toISOString().slice(0, 7);

export const formatMonthLabel = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const deltaColor = (deltaPct: number | null, higherIsBetter: boolean = true) => {
    if (deltaPct === null || deltaPct === 0) return 'text-gray-400 dark:text-gray-500';
    const improved = higherIsBetter ? deltaPct > 0 : deltaPct < 0;
    return improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
};

export const formatDeltaPct = (deltaPct: number | null) => {
    if (deltaPct === null) return '—';
    const sign = deltaPct > 0 ? '+' : '';
    return `${sign}${deltaPct.toFixed(1)}%`;
};

export interface GLModeRow {
    mode_of_payment: string;
    total_debit: number;
    total_credit: number;
    net: number;
}

export interface GLAccountRow {
    account: string;
    total_debit: number;
    total_credit: number;
    net: number;
}

export interface InternalTransferRow {
    voucher: string;
    from: string;
    to: string;
    amount: number;
}

export interface TopOutflowEntryRow {
    name: string;
    category: string;
    party_or_account: string;
    mode_of_payment: string;
    amount: number;
}

export interface IncomeModeRow {
    mode_of_payment: string;
    total: number;
}

/** watch_doctor.monthly_financial_report.get_monthly_financial_report — the daily
 * Financial Summary's GL/PE/JE cash-position reconstruction aggregated over a date
 * range. Entry-level detail is capped to the highest-value rows (see
 * top_outflow_entries / internal_transfers); unpaid invoices are always shown in
 * full via credit_sales_invoices / credit_purchase_invoices. */
export interface MonthlyFinancialReportData {
    from_date: string;
    to_date: string;
    kpi_income: number;
    kpi_outflow: number;
    net_cash: number;
    total_income: number;
    total_retail_sales: number;
    total_b2b_sales: number;
    repair_revenue: number;
    total_returns: number;
    cash_refunded_returns?: number;
    non_cash_returns?: number;
    total_customer_collections: number;
    je_receipt_total: number;
    total_other_receipts: number;
    unpaid_credit_sales: number;
    // Non-cash Journal Entry write-offs applying to this period's invoices — reduces what's
    // still owed (already reflected in total_credit_sales / unpaid_credit_sales) but is not
    // collected cash, so it's also netted out of total_income server-side.
    total_written_off?: number;
    income_mode_breakdown: IncomeModeRow[];
    credit_sales_invoices: CreditInvoice[];
    total_credit_sales: number;
    credit_purchase_invoices: CreditInvoice[];
    total_credit_purchases: number;
    purchase_total: number;
    pe_purchases_by_mode: PeModeBreakdown[];
    other_expenses_total: number;
    pe_operating_by_mode: PeModeBreakdown[];
    je_by_mode: PeModeBreakdown[];
    total_outflow: number;
    gl_mode_summary: GLModeRow[];
    gl_account_summary: GLAccountRow[];
    gl_total_cash_in: number;
    gl_total_cash_out: number;
    internal_transfers: InternalTransferRow[];
    internal_transfers_count: number;
    gl_transfer_total: number;
    top_outflow_entries: TopOutflowEntryRow[];
    // Customer cash refunds — netted out of gl_external_cash_in/out (not new income, not
    // a business expense) but surfaced here for visibility, same pattern as internal transfers.
    customer_refunds?: CustomerRefundRow[];
    customer_refunds_count?: number;
}
