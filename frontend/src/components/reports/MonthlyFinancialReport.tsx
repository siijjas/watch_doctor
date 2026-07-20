import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    StatCard,
    EmptyState,
    SectionTitle,
    CurrencyIcon,
    TrendingIcon,
    ReceiptIcon,
} from './reportShared';
import type { PeModeBreakdown } from './reportShared';
import type { MonthlyFinancialReportData } from './monthlyReportShared';

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

const SectionHeading: React.FC<{ children: string }> = ({ children }) => (
    <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{children}</h2>
);

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
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className={iconColor}>{icon}</span>
                {title}
            </h3>
            <span className={`text-lg font-bold ${totalColor}`}>{total}</span>
        </div>
        {children}
    </div>
);

const Row: React.FC<{ label: string; value: React.ReactNode; muted?: boolean }> = ({ label, value, muted }) => (
    <div className="flex justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={muted ? 'text-gray-400 dark:text-gray-500' : 'font-medium text-gray-900 dark:text-white'}>{value}</span>
    </div>
);

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

interface MonthlyFinancialReportProps {
    data: MonthlyFinancialReportData;
    monthLabel: string;
}

const MonthlyFinancialReport: React.FC<MonthlyFinancialReportProps> = ({ data, monthLabel }) => {
    const { formatCurrency } = useAppConfig();

    const salesRevenue = data.total_retail_sales + data.total_b2b_sales - data.total_returns;

    return (
        <div className="space-y-6 print:space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">{monthLabel}</p>

            {/* S1 — KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Cash In"
                    value={formatCurrency(data.kpi_income)}
                    subLabel="From GL entries"
                    color="emerald" icon={<TrendingIcon />}
                />
                <StatCard
                    label="Cash Out"
                    value={formatCurrency(data.kpi_outflow)}
                    subLabel="From GL entries"
                    color="rose" icon={<ExpenseIcon />}
                />
                <StatCard
                    label="Net Cash"
                    value={`${data.net_cash < 0 ? '−' : ''}${formatCurrency(Math.abs(data.net_cash))}`}
                    subLabel="From GL entries"
                    color={data.net_cash >= 0 ? 'emerald' : 'rose'}
                    icon={<NetIcon />}
                />
            </div>

            {/* S2 — Total Income */}
            <div>
                <SectionHeading>Total Income</SectionHeading>
                <StreamCard
                    icon={<TrendingIcon />} iconColor="text-emerald-500"
                    title="Total Income" total={formatCurrency(data.total_income)} totalColor="text-emerald-600 dark:text-emerald-400"
                >
                    <div className="space-y-2">
                        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Sales Stream</p>
                        <Row label="Retail Sales (POS)" value={formatCurrency(data.total_retail_sales)} />
                        {data.total_b2b_sales > 0 && (
                            <Row label="B2B Sales" value={formatCurrency(data.total_b2b_sales)} />
                        )}
                        {data.repair_revenue > 0 && (
                            <Row label="Repair Invoices" value={formatCurrency(data.repair_revenue)} />
                        )}
                        <Row label="Collections" value={formatCurrency(data.total_customer_collections)} muted={data.total_customer_collections === 0} />
                        {data.je_receipt_total > 0 && (
                            <Row label="JE Receipts" value={formatCurrency(data.je_receipt_total)} />
                        )}
                        {data.total_other_receipts > 0 && (
                            <Row label="Other Receipts" value={formatCurrency(data.total_other_receipts)} />
                        )}
                        {(data.cash_refunded_returns ?? data.total_returns) > 0 && (
                            <Row label="Returns (refunded)" value={<span className="font-medium text-rose-600 dark:text-rose-400">&minus;{formatCurrency(data.cash_refunded_returns ?? data.total_returns)}</span>} />
                        )}
                        {(data.non_cash_returns ?? 0) > 0 && (
                            <Row label="Returns (store credit, no cash impact)" value={formatCurrency(data.non_cash_returns ?? 0)} muted />
                        )}
                        {data.unpaid_credit_sales > 0 && (
                            <Row label="Less: Unpaid Credit Sales" value={<span className="font-medium text-rose-600 dark:text-rose-400">&minus;{formatCurrency(data.unpaid_credit_sales)}</span>} />
                        )}
                        {(data.total_written_off ?? 0) > 0 && (
                            <Row label="Less: Written Off (non-cash)" value={<span className="font-medium text-rose-600 dark:text-rose-400">&minus;{formatCurrency(data.total_written_off ?? 0)}</span>} />
                        )}
                        <div className="border-t border-gray-100 dark:border-gray-700 pt-1">
                            <Row label="Net Collected Income" value={formatCurrency(data.total_income)} />
                        </div>
                        {data.income_mode_breakdown.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">By Payment Mode</p>
                                <div className="space-y-1.5">
                                    {data.income_mode_breakdown.map((m, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                                                <span className="text-gray-600 dark:text-gray-400">{m.mode_of_payment}</span>
                                            </div>
                                            <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(m.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </StreamCard>
                {salesRevenue !== data.total_income && (
                    <p className="text-xs text-gray-400 mt-2 px-1">
                        Gross sales revenue this month: {formatCurrency(salesRevenue)} (before collections/receipts and unpaid-credit adjustments above).
                    </p>
                )}
            </div>

            {/* S4 — Outflow Streams */}
            <div>
                <SectionHeading>Outflow Streams</SectionHeading>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <StreamCard
                        icon={<ExpenseIcon />} iconColor="text-orange-500"
                        title="Purchases" total={formatCurrency(data.purchase_total)} totalColor="text-rose-600 dark:text-rose-400"
                    >
                        {data.pe_purchases_by_mode.length === 0 ? (
                            <EmptyState label="No purchase payments this month" />
                        ) : (
                            <ModeList items={data.pe_purchases_by_mode} dotColor="bg-orange-400" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                        )}
                    </StreamCard>
                    <StreamCard
                        icon={<ExpenseIcon />} iconColor="text-rose-500"
                        title="Expenses" total={formatCurrency(data.other_expenses_total)} totalColor="text-rose-600 dark:text-rose-400"
                    >
                        {data.pe_operating_by_mode.length === 0 && data.je_by_mode.length === 0 ? (
                            <EmptyState label="No other expenses this month" />
                        ) : (
                            <div className="space-y-3">
                                {data.pe_operating_by_mode.length > 0 && (
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Payment Entries — By Mode</p>
                                        <ModeList items={data.pe_operating_by_mode} dotColor="bg-rose-400" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                                    </div>
                                )}
                                {data.je_by_mode.length > 0 && (
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2">Journal Entries — By Mode</p>
                                        <ModeList items={data.je_by_mode} dotColor="bg-rose-300" valueColor="text-rose-600 dark:text-rose-400" formatCurrency={formatCurrency} />
                                    </div>
                                )}
                            </div>
                        )}
                    </StreamCard>
                </div>
            </div>

            {/* S4b — Top High-Value Outflow Entries */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>
                    <ReceiptIcon className="text-rose-500" />
                    Top {data.top_outflow_entries.length} High-Value Outflow Entries
                </SectionTitle>
                {data.top_outflow_entries.length === 0 ? (
                    <EmptyState label="No outflow entries this month" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Entry</th>
                                    <th className="text-left pb-2 pr-3">Category</th>
                                    <th className="text-left pb-2 pr-3">Party / Account</th>
                                    <th className="text-left pb-2 pr-3">Mode</th>
                                    <th className="text-right pb-2">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {data.top_outflow_entries.map((e, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{e.name}</td>
                                        <td className="py-2 pr-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{e.category}</span>
                                        </td>
                                        <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{e.party_or_account || '—'}</td>
                                        <td className="py-2 pr-3 text-gray-600 dark:text-gray-400">{e.mode_of_payment || '—'}</td>
                                        <td className="py-2 text-right font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(e.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* S5 — Cash Flow by Payment Mode */}
            {data.gl_mode_summary.length > 0 && (
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
                                {data.gl_mode_summary.map((mb, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2.5 pr-3 font-medium text-gray-700 dark:text-gray-300">{mb.mode_of_payment}</td>
                                        <td className="py-2.5 pr-3 text-right text-emerald-600 dark:text-emerald-400">{mb.total_debit > 0 ? formatCurrency(mb.total_debit) : '—'}</td>
                                        <td className="py-2.5 pr-3 text-right text-rose-600 dark:text-rose-400">{mb.total_credit > 0 ? formatCurrency(mb.total_credit) : '—'}</td>
                                        <td className={`py-2.5 text-right font-semibold ${mb.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {mb.net < 0 ? '−' : ''}{formatCurrency(Math.abs(mb.net))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td className="pt-2.5 text-sm text-gray-700 dark:text-gray-300">Total</td>
                                    <td className="pt-2.5 text-right text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(data.gl_mode_summary.reduce((s, m) => s + m.total_debit, 0))}</td>
                                    <td className="pt-2.5 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(data.gl_mode_summary.reduce((s, m) => s + m.total_credit, 0))}</td>
                                    <td className={`pt-2.5 text-right text-sm font-bold ${data.net_cash >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {data.net_cash < 0 ? '−' : ''}{formatCurrency(Math.abs(data.net_cash))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* S5b — GL Account Breakdown */}
            {data.gl_account_summary.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-emerald-500" />
                        Cash &amp; Bank — GL Breakdown
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
                                {data.gl_account_summary.map((row, idx) => (
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
                                    <td className="pt-2.5 text-right text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(data.gl_total_cash_in)}</td>
                                    <td className="pt-2.5 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(data.gl_total_cash_out)}</td>
                                    <td className={`pt-2.5 text-right text-sm font-bold ${(data.gl_total_cash_in - data.gl_total_cash_out) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {(data.gl_total_cash_in - data.gl_total_cash_out) < 0 ? '−' : ''}{formatCurrency(Math.abs(data.gl_total_cash_in - data.gl_total_cash_out))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* S5c — Internal Transfers (top N, excluded from income/expense) */}
            {data.internal_transfers.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-gray-400" />
                        Top {data.internal_transfers.length} Internal Transfers
                        <span className="ml-2 text-xs font-normal text-gray-400">
                            (of {data.internal_transfers_count} this month — excluded from income &amp; expense)
                        </span>
                    </SectionTitle>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Voucher</th>
                                    <th className="text-left pb-2 pr-3">From</th>
                                    <th className="text-left pb-2 pr-3">To</th>
                                    <th className="text-right pb-2">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {data.internal_transfers.map((t, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{t.voucher}</td>
                                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{t.from || '—'}</td>
                                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{t.to || '—'}</td>
                                        <td className="py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">{formatCurrency(t.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td colSpan={3} className="pt-2.5 text-sm text-gray-700 dark:text-gray-300">Total Transferred (this month)</td>
                                    <td className="pt-2.5 text-right text-sm text-gray-500 dark:text-gray-400">{formatCurrency(data.gl_transfer_total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* S5d — Customer Refunds (top N, netted against collections, excluded from income/expense) */}
            {(data.customer_refunds ?? []).length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-gray-400" />
                        Top {(data.customer_refunds ?? []).length} Customer Refunds
                        <span className="ml-2 text-xs font-normal text-gray-400">
                            (of {data.customer_refunds_count ?? (data.customer_refunds ?? []).length} this month — netted against collections, excluded from income &amp; expense)
                        </span>
                    </SectionTitle>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Invoice</th>
                                    <th className="text-left pb-2 pr-3">Customer</th>
                                    <th className="text-left pb-2 pr-3">Mode</th>
                                    <th className="text-right pb-2">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {(data.customer_refunds ?? []).map((r, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2.5 pr-3 font-mono text-xs text-gray-500 dark:text-gray-400">{r.voucher}</td>
                                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{r.customer || '—'}</td>
                                        <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-300">{r.mode_of_payment || '—'}</td>
                                        <td className="py-2.5 text-right font-medium text-gray-500 dark:text-gray-400">{formatCurrency(r.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-bold">
                                    <td colSpan={3} className="pt-2.5 text-sm text-gray-700 dark:text-gray-300">Total Refunded (this month)</td>
                                    <td className="pt-2.5 text-right text-sm text-gray-500 dark:text-gray-400">{formatCurrency(data.cash_refunded_returns ?? 0)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MonthlyFinancialReport;
