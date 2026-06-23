import React, { useState } from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    StatCard,
    EmptyState,
    SectionTitle,
    CurrencyIcon,
    POSIcon,
    TrendingIcon,
} from './reportShared';
import type {
    RepairReportData,
    PosReportData,
    FinancialReportData,
    PaymentEntryRow,
    PeModeBreakdown,
    JournalEntryRow,
    CustomerCollectionRow,
    CreditInvoice,
} from './reportShared';

// ── Icons ──────────────────────────────────────────────────────────
const ExpenseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const NetIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const PurchaseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
);

const CollectIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CreditIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
);

// ── Shared types ────────────────────────────────────────────────────
interface FinancialSummaryReportProps {
    repair: RepairReportData;
    pos: PosReportData;
    financial?: FinancialReportData;
}

const EMPTY_FINANCIAL: FinancialReportData = {
    total_expenses: 0, expense_breakdown: [], expense_entries: [], repair_payment_breakdown: [],
};

// ── Collapsible wrapper ─────────────────────────────────────────────
const Collapsible: React.FC<{ title: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }> = ({
    title, defaultOpen = false, children,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-5 text-left">
                <span className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">{title}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4">{children}</div>}
        </div>
    );
};

// ── Section heading ─────────────────────────────────────────────────
const SectionHeading: React.FC<{ children: string }> = ({ children }) => (
    <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{children}</h2>
);

// ── Stream card shell ───────────────────────────────────────────────
const StreamCard: React.FC<{
    icon: React.ReactNode;
    iconColor: string;
    title: string;
    total: string;
    totalColor: string;
    children: React.ReactNode;
}> = ({ icon, iconColor, title, total, totalColor, children }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
            <h3 className={`text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2`}>
                <span className={iconColor}>{icon}</span>
                {title}
            </h3>
            <span className={`text-lg font-bold ${totalColor}`}>{total}</span>
        </div>
        {children}
    </div>
);

// ── Row helper ─────────────────────────────────────────────────────
const Row: React.FC<{ label: string; value: React.ReactNode; muted?: boolean }> = ({ label, value, muted }) => (
    <div className="flex justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={muted ? 'text-gray-400 dark:text-gray-500' : 'font-medium text-gray-900 dark:text-white'}>{value}</span>
    </div>
);

// ── Mode list ──────────────────────────────────────────────────────
const ModeList: React.FC<{
    items: PeModeBreakdown[];
    dotColor: string;
    valueColor: string;
    formatCurrency: (n: number) => string;
}> = ({ items, dotColor, valueColor, formatCurrency }) => (
    <div className="space-y-1.5">
        {items.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                    <span className="text-gray-600 dark:text-gray-400">{m.mode_of_payment}</span>
                    <span className="text-xs text-gray-400">&times;{m.count}</span>
                </div>
                <span className={`font-medium ${valueColor}`}>{formatCurrency(m.total)}</span>
            </div>
        ))}
    </div>
);

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════
const FinancialSummaryReport: React.FC<FinancialSummaryReportProps> = ({ repair, pos, financial: fin$}) => {
    const { formatCurrency } = useAppConfig();
    const fin = fin$ ?? EMPTY_FINANCIAL;

    // Customer collections against credit invoices
    const customerCollections   = fin.pe_customer_collections ?? [] as CustomerCollectionRow[];
    const totalCollections      = fin.total_customer_collections ?? 0;

    // JE receipts: proportional external portion → counted in income KPI
    const jeReceipts         = fin.je_receipts          ?? [] as JournalEntryRow[];
    const jeReceiptTotal     = fin.je_receipt_total     ?? 0;
    const jeReceiptByMode    = fin.je_receipt_by_mode   ?? [] as PeModeBreakdown[];

    // Non-Customer PE Receives (owner deposits, supplier refunds, etc.)
    const totalOtherReceipts = fin.total_other_receipts ?? 0;

    // ── GL ground-truth totals (same source as "Day Report") ────
    const glCashIn  = fin.gl_total_cash_in  ?? null;
    const glCashOut = fin.gl_total_cash_out ?? null;
    const glAccountSummary = fin.gl_account_summary ?? [];
    // GL per-mode summary — covers ALL voucher types (PE Internal Transfer, SI returns, etc.)
    const glModeSummary = fin.gl_mode_summary ?? [];

    // ── Derived values ──────────────────────────────────────────
    const repairRevenue   = repair.revenue;
    // Include B2B (non-POS) sales alongside retail, then deduct returns
    const salesRevenue    = pos.total_retail_sales + pos.total_b2b_sales - pos.total_returns;
    const totalIncome     = repairRevenue + salesRevenue + totalCollections + jeReceiptTotal + totalOtherReceipts;

    const pePurchases         = fin.pe_purchases         ?? [];
    const paidPurchaseInvoices = fin.paid_purchase_invoices ?? [];
    const peOperating         = fin.pe_operating         ?? [];
    const peReceive       = fin.pe_receive        ?? [];
    const peEntries       = fin.pe_entries        ?? [];
    const jeEntries       = fin.je_entries        ?? [] as JournalEntryRow[];
    const jeTotal         = fin.je_total          ?? 0;
    const jeByMode        = fin.je_by_mode        ?? [] as PeModeBreakdown[];

    const totalPePurchases  = fin.total_pe_purchases  ?? 0;
    const totalPaidPurchases = fin.total_paid_purchases ?? 0;
    const totalPeOperating  = fin.total_pe_operating  ?? 0;
    const pePurchasesByMode = fin.pe_purchases_by_mode ?? [] as PeModeBreakdown[];
    const peOperatingByMode = fin.pe_operating_by_mode ?? [] as PeModeBreakdown[];

    const purchaseTotal      = totalPePurchases + totalPaidPurchases;
    const otherExpensesTotal = totalPeOperating + jeTotal;

    // KPI cards use GL totals when available (exact match with "Day Report");
    // fall back to doc-based sums only when GL data is absent.
    const kpiIncome  = glCashIn  ?? totalIncome;
    const kpiOutflow = glCashOut ?? (purchaseTotal + otherExpensesTotal);
    const balance    = kpiIncome - kpiOutflow;
    // Keep totalOutflow for internal breakdown consistency
    const totalOutflow = purchaseTotal + otherExpensesTotal;

    const creditSalesInvoices   = fin.credit_sales_invoices     ?? [] as CreditInvoice[];
    const totalCreditSales      = fin.total_credit_sales        ?? 0;
    const creditPurchaseInvoices = fin.credit_purchase_invoices ?? [] as CreditInvoice[];
    const totalCreditPurchases  = fin.total_credit_purchases    ?? 0;

    // ── Per-mode cash flow table (GL-based — ground truth) ──────
    // Uses GL debits/credits per account mapped to payment mode.
    // Automatically handles every voucher type: PE Internal Transfer, SI returns,
    // JE mode corrections, Expense Claims, Asset purchases — nothing is missed.
    const modeBalances = glModeSummary.map(row => ({
        mode:    row.mode_of_payment,
        income:  row.total_debit,
        outflow: row.total_credit,
        balance: row.net,
    }));

    // Prefer GL ground-truth for the S6 footer; fall back to PE Pay + JE + paid PIs
    const totalOutflowAll = glCashOut
        ?? (peEntries.filter(e => e.payment_type === 'Pay').reduce((s, e) => s + e.amount, 0)
            + jeTotal
            + (fin.total_paid_purchases ?? 0));

    // By-mode breakdown inside the income card.
    // Uses only the external (income-contributing) portions so the mode totals sum to totalIncome.
    const incomeModeMap = new Map<string, number>();
    pos.payment_breakdown.forEach(pm => {
        incomeModeMap.set(pm.mode_of_payment, (incomeModeMap.get(pm.mode_of_payment) ?? 0) + pm.total);
    });
    (fin.repair_payment_breakdown ?? []).forEach(rm => {
        incomeModeMap.set(rm.mode_of_payment, (incomeModeMap.get(rm.mode_of_payment) ?? 0) + rm.total);
    });
    customerCollections.forEach(c => {
        incomeModeMap.set(c.mode_of_payment, (incomeModeMap.get(c.mode_of_payment) ?? 0) + c.amount);
    });
    // External JE receipts only (proportional fraction — corrections excluded)
    jeReceiptByMode.forEach(j => {
        incomeModeMap.set(j.mode_of_payment, (incomeModeMap.get(j.mode_of_payment) ?? 0) + j.total);
    });
    // Non-Customer PE Receives
    (fin.pe_other_receipts ?? []).forEach(p => {
        const mode = p.mode_of_payment || 'Other';
        incomeModeMap.set(mode, (incomeModeMap.get(mode) ?? 0) + p.amount);
    });
    const incomeModeBreakdown = Array.from(incomeModeMap.entries())
        .map(([mode, total]) => ({ mode, total }))
        .sort((a, b) => b.total - a.total);

    return (
        <div className="space-y-6">

            {/* ══════════════════════════════════════════
                S1 — Executive KPIs (3 cards, no subLabel)
            ══════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Cash In"
                    value={formatCurrency(kpiIncome)}
                    subLabel={glCashIn != null ? 'From GL entries' : 'Estimated'}
                    color="emerald" icon={<TrendingIcon />}
                />
                <StatCard
                    label="Cash Out"
                    value={formatCurrency(kpiOutflow)}
                    subLabel={glCashOut != null ? 'From GL entries' : 'Estimated'}
                    color="rose" icon={<ExpenseIcon />}
                />
                <StatCard
                    label="Net Cash"
                    value={`${balance < 0 ? '\u2212' : ''}${formatCurrency(Math.abs(balance))}`}
                    subLabel={glCashIn != null ? 'From GL entries' : 'Estimated'}
                    color={balance >= 0 ? 'emerald' : 'rose'}
                    icon={<NetIcon />}
                />
            </div>

            {/* ══════════════════════════════════════════
                S2 — Total Income
            ══════════════════════════════════════════ */}
            <div>
                <SectionHeading>Total Income</SectionHeading>
                <div className="grid grid-cols-1 gap-4">
                    <StreamCard
                        icon={<TrendingIcon />} iconColor="text-emerald-500"
                        title="Total Income" total={formatCurrency(totalIncome)} totalColor="text-emerald-600 dark:text-emerald-400"
                    >
                        <div className="space-y-2">
                            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Sales Stream</p>
                            <Row label="Retail Sales (POS)" value={formatCurrency(pos.total_retail_sales)} />
                            {pos.total_b2b_sales > 0 && (
                                <Row label="B2B Sales" value={formatCurrency(pos.total_b2b_sales)} />
                            )}
                            <Row label="Repair Invoices" value={formatCurrency(repairRevenue)} />
                            <Row label="Collections" value={formatCurrency(totalCollections)} muted={totalCollections === 0} />
                            {jeReceiptTotal > 0 && (
                                <Row label="JE Receipts" value={formatCurrency(jeReceiptTotal)} />
                            )}
                            {totalOtherReceipts > 0 && (
                                <Row label="Other Receipts" value={formatCurrency(totalOtherReceipts)} />
                            )}
                            {pos.total_returns > 0 && (
                                <Row label="Returns" value={<span className="font-medium text-rose-600 dark:text-rose-400">&minus;{formatCurrency(pos.total_returns)}</span>} />
                            )}
                            <div className="border-t border-gray-100 dark:border-gray-700 pt-1">
                                <Row label="Net Sales" value={formatCurrency(pos.net_sales + repairRevenue + totalCollections)} />
                            </div>
                            {incomeModeBreakdown.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                    <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">By Payment Mode</p>
                                    <div className="space-y-1.5">
                                        {incomeModeBreakdown.map(({ mode, total }, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                                                    <span className="text-gray-600 dark:text-gray-400">{mode}</span>
                                                </div>
                                                <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(total)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex justify-end">
                                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">Total Income: {formatCurrency(totalIncome)}</span>
                            </div>
                        </div>
                    </StreamCard>
                </div>

            </div>

            {/* ══════════════════════════════════════════
                S3 — Credit Invoices Outstanding
            ══════════════════════════════════════════ */}
            {(creditSalesInvoices.length > 0 || creditPurchaseInvoices.length > 0) && (
                <div>
                    <SectionHeading>Credit Invoices</SectionHeading>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                        {/* Credit Sales */}
                        <Collapsible
                            title={<><CreditIcon className="text-amber-500" /> Credit Sales — {creditSalesInvoices.length} invoice{creditSalesInvoices.length !== 1 ? 's' : ''} &nbsp;<span className="font-normal text-amber-600 dark:text-amber-400">{formatCurrency(totalCreditSales)} outstanding</span></>}
                        >
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Invoice</th>
                                        <th className="text-left pb-2 pr-3">Customer</th>
                                        <th className="text-right pb-2 pr-3">Total</th>
                                        <th className="text-right pb-2">Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {creditSalesInvoices.map((inv: CreditInvoice, i: number) => (
                                        <tr key={i}>
                                            <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{inv.name}</td>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{inv.customer_name || inv.customer || '\u2014'}</td>
                                            <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(inv.grand_total)}</td>
                                            <td className="py-2 text-right font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(inv.outstanding_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                        <td colSpan={3} className="pt-2 text-sm text-gray-700 dark:text-gray-300">Total Outstanding</td>
                                        <td className="pt-2 text-right text-sm text-amber-600 dark:text-amber-400">{formatCurrency(totalCreditSales)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </Collapsible>

                        {/* Credit Purchases */}
                        <Collapsible
                            title={<><CreditIcon className="text-rose-500" /> Credit Purchases — {creditPurchaseInvoices.length} invoice{creditPurchaseInvoices.length !== 1 ? 's' : ''} &nbsp;<span className="font-normal text-rose-600 dark:text-rose-400">{formatCurrency(totalCreditPurchases)} payable</span></>}
                        >
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Invoice</th>
                                        <th className="text-left pb-2 pr-3">Supplier</th>
                                        <th className="text-right pb-2 pr-3">Total</th>
                                        <th className="text-right pb-2">Payable</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {creditPurchaseInvoices.map((inv: CreditInvoice, i: number) => (
                                        <tr key={i}>
                                            <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{inv.name}</td>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{inv.supplier_name || inv.supplier || '\u2014'}</td>
                                            <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">{formatCurrency(inv.grand_total)}</td>
                                            <td className="py-2 text-right font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(inv.outstanding_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                        <td colSpan={3} className="pt-2 text-sm text-gray-700 dark:text-gray-300">Total Payable</td>
                                        <td className="pt-2 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(totalCreditPurchases)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </Collapsible>

                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                S4 — Outflow Streams
            ══════════════════════════════════════════ */}
            <div>
                <SectionHeading>Outflow Streams</SectionHeading>
                <div className="grid grid-cols-1 gap-4">
                    <StreamCard
                        icon={<ExpenseIcon />} iconColor="text-rose-500"
                        title="Outflow Streams" total={formatCurrency(totalOutflow)} totalColor="text-rose-600 dark:text-rose-400"
                    >
                        <div className="space-y-4">
                            <div className="rounded-xl border border-orange-100 dark:border-orange-900/30 bg-orange-50/60 dark:bg-orange-900/10 p-4 space-y-3">
                                <p className="text-xs text-orange-700 dark:text-orange-300 uppercase tracking-wide font-semibold">Purchases</p>
                                {pePurchases.length === 0 && paidPurchaseInvoices.length === 0 ? (
                                    <EmptyState label="No purchase payments today" />
                                ) : (
                                    <>
                                        <Row label="Total Purchases" value={formatCurrency(purchaseTotal)} />
                                        {pePurchasesByMode.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">By Payment Mode</p>
                                                <ModeList items={pePurchasesByMode} dotColor="bg-orange-400" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                                            </div>
                                        )}
                                        {pePurchases.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-orange-200/70 dark:border-orange-800/40">
                                                <p className="text-xs text-orange-700 dark:text-orange-300 uppercase tracking-wide font-semibold mb-2">Supplier Payment Entries</p>
                                                <div className="space-y-1.5">
                                                    {pePurchases.map((p, i) => (
                                                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded-md bg-white/80 dark:bg-gray-800/70">
                                                            <span className="text-gray-700 dark:text-gray-300 truncate max-w-[65%]">{p.party_name || p.party || '\u2014'}</span>
                                                            <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(p.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {paidPurchaseInvoices.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-orange-200/70 dark:border-orange-800/40">
                                                <p className="text-xs text-orange-700 dark:text-orange-300 uppercase tracking-wide font-semibold mb-2">Cash Purchase Invoices</p>
                                                <div className="space-y-1.5">
                                                    {paidPurchaseInvoices.map((inv, i) => (
                                                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded-md bg-white/80 dark:bg-gray-800/70">
                                                            <div className="flex flex-col min-w-0 max-w-[65%]">
                                                                <span className="text-gray-700 dark:text-gray-300 truncate">{inv.supplier_name || inv.supplier || '\u2014'}</span>
                                                                <span className="text-xs text-gray-400 font-mono">{inv.name}</span>
                                                            </div>
                                                            <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(inv.grand_total)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/60 dark:bg-rose-900/10 p-4 space-y-3">
                                <p className="text-xs text-rose-700 dark:text-rose-300 uppercase tracking-wide font-semibold">Expense</p>
                                {peOperating.length === 0 && jeEntries.length === 0 ? (
                                    <EmptyState label="No other expenses today" />
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            {peOperating.length > 0 && (
                                                <Row label="Payment Entries" value={`${peOperating.length} — ${formatCurrency(totalPeOperating)}`} />
                                            )}
                                            {jeEntries.length > 0 && (
                                                <Row label="Journal Entries" value={`${jeEntries.length} — ${formatCurrency(jeTotal)}`} />
                                            )}
                                        </div>
                                        {peOperatingByMode.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">PE — By Payment Mode</p>
                                                <ModeList items={peOperatingByMode} dotColor="bg-rose-400" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                                            </div>
                                        )}
                                        {jeByMode.length > 0 && (
                                            <div>
                                                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">JE — By Payment Mode</p>
                                                <ModeList items={jeByMode} dotColor="bg-rose-300" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                                            </div>
                                        )}
                                        {jeEntries.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-rose-200/70 dark:border-rose-800/40">
                                                <p className="text-xs text-rose-700 dark:text-rose-300 uppercase tracking-wide font-semibold mb-2">Expense Entries</p>
                                                <div className="space-y-1.5">
                                                    {jeEntries.map((je, i) => (
                                                        <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded-md bg-white/80 dark:bg-gray-800/70">
                                                            <span className="text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{je.against_account || '\u2014'}</span>
                                                            <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(je.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </StreamCard>
                </div>
            </div>

            {/* ══════════════════════════════════════════
                S5 — Cash Flow by Payment Mode
            ══════════════════════════════════════════ */}
            {modeBalances.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-indigo-500" />
                        Cash Flow by Payment Mode
                        <span className="ml-2 text-xs font-normal text-gray-400">(GL — all voucher types)</span>
                    </SectionTitle>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Payment Mode</th>
                                    <th className="text-right pb-2 pr-3">Income</th>
                                    <th className="text-right pb-2 pr-3">Outflow</th>
                                    <th className="text-right pb-2">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {modeBalances.map((mb, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2.5 pr-3 font-medium text-gray-700 dark:text-gray-300">{mb.mode}</td>
                                        <td className="py-2.5 pr-3 text-right text-emerald-600 dark:text-emerald-400">{mb.income > 0 ? formatCurrency(mb.income) : '\u2014'}</td>
                                        <td className="py-2.5 pr-3 text-right text-rose-600 dark:text-rose-400">{mb.outflow > 0 ? formatCurrency(mb.outflow) : '\u2014'}</td>
                                        <td className={`py-2.5 text-right font-semibold ${mb.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {mb.balance < 0 ? '\u2212' : ''}{formatCurrency(Math.abs(mb.balance))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td className="pt-2.5 text-sm text-gray-700 dark:text-gray-300">Total</td>
                                    <td className="pt-2.5 text-right text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(modeBalances.reduce((s, m) => s + m.income, 0))}</td>
                                    <td className="pt-2.5 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(modeBalances.reduce((s, m) => s + m.outflow, 0))}</td>
                                    <td className={`pt-2.5 text-right text-sm font-bold ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {balance < 0 ? '\u2212' : ''}{formatCurrency(Math.abs(balance))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                S5b — GL Account Breakdown (ground truth)
            ══════════════════════════════════════════ */}
            {glAccountSummary.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-emerald-500" />
                        Cash &amp; Bank — GL Breakdown
                        <span className="ml-2 text-xs font-normal text-gray-400">(matches Day Report)</span>
                    </SectionTitle>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Account</th>
                                    <th className="text-right pb-2 pr-3">Cash In (Dr)</th>
                                    <th className="text-right pb-2 pr-3">Cash Out (Cr)</th>
                                    <th className="text-right pb-2">Net</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {glAccountSummary.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2.5 pr-3 font-medium text-gray-700 dark:text-gray-300">{row.account}</td>
                                        <td className="py-2.5 pr-3 text-right text-emerald-600 dark:text-emerald-400">{row.total_debit > 0 ? formatCurrency(row.total_debit) : '—'}</td>
                                        <td className="py-2.5 pr-3 text-right text-rose-600 dark:text-rose-400">{row.total_credit > 0 ? formatCurrency(row.total_credit) : '—'}</td>
                                        <td className={`py-2.5 text-right font-semibold ${row.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {row.net < 0 ? '−' : ''}{formatCurrency(Math.abs(row.net))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td className="pt-2.5 text-sm text-gray-700 dark:text-gray-300">Total</td>
                                    <td className="pt-2.5 text-right text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(kpiIncome)}</td>
                                    <td className="pt-2.5 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(kpiOutflow)}</td>
                                    <td className={`pt-2.5 text-right text-sm font-bold ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {balance < 0 ? '−' : ''}{formatCurrency(Math.abs(balance))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                S6 — All Payment & Journal Entries (collapsible)
            ══════════════════════════════════════════ */}
            {(peEntries.length > 0 || jeEntries.length > 0) && (
                <Collapsible
                    title={
                        <>
                            <CurrencyIcon className="text-indigo-500" />
                            All Entries &nbsp;
                            <span className="font-normal text-gray-400">
                                {peEntries.length} payment{peEntries.length !== 1 ? 's' : ''}
                                {jeEntries.length > 0 ? ` · ${jeEntries.length} journal` : ''}
                            </span>
                        </>
                    }
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Entry ID</th>
                                    <th className="text-left pb-2 pr-3">Type</th>
                                    <th className="text-left pb-2 pr-3">Party / Account</th>
                                    <th className="text-left pb-2 pr-3">Mode</th>
                                    <th className="text-left pb-2 pr-3">Remarks</th>
                                    <th className="text-right pb-2">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {/* Payment entries */}
                                {peEntries.map((e: PaymentEntryRow, idx: number) => (
                                    <tr key={'pe-' + idx}>
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{e.name}</td>
                                        <td className="py-2 pr-3">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                e.payment_type === 'Receive'
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                                            }`}>
                                                {e.payment_type === 'Receive' ? '\u25b2 Receive' : '\u25bc Pay'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3">
                                            <div className="text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{e.party_name || e.party || '\u2014'}</div>
                                            {e.party_type && <div className="text-xs text-gray-400">{e.party_type}</div>}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{e.mode_of_payment}</td>
                                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{e.remarks || '\u2014'}</td>
                                        <td className={`py-2 text-right font-semibold ${
                                            e.payment_type === 'Receive'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-rose-600 dark:text-rose-400'
                                        }`}>
                                            {e.payment_type === 'Pay' ? '\u2212' : '+'}{formatCurrency(e.amount)}
                                        </td>
                                    </tr>
                                ))}
                                {/* Journal entries */}
                                {jeEntries.map((je: JournalEntryRow, idx: number) => (
                                    <tr key={'je-' + idx}>
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{je.name}</td>
                                        <td className="py-2 pr-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                JE
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[160px]">{je.against_account || '\u2014'}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{je.mode_of_payment}</td>
                                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 truncate max-w-[160px]">{je.remarks || '\u2014'}</td>
                                        <td className="py-2 text-right font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(je.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td colSpan={5} className="pt-2 text-sm text-gray-700 dark:text-gray-300">Total Outflow</td>
                                    <td className="pt-2 text-right text-sm text-rose-600 dark:text-rose-400">
                                        {formatCurrency(totalOutflowAll)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Collapsible>
            )}

        </div>
    );
};

export default FinancialSummaryReport;
