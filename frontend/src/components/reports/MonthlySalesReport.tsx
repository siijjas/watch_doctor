import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    StatCard,
    EmptyState,
    SectionTitle,
    POSIcon,
    ReceiptIcon,
    TagIcon,
    TrendingIcon,
    UserGroupIcon,
    CurrencyIcon,
    DocumentIcon,
} from './reportShared';
import type { MonthlySalesReportData } from './monthlyReportShared';

const ShoppingBagIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 7H4l1-7z" />
    </svg>
);

const LightBulbIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={`w-5 h-5 ${className ?? ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);

type InsightLevel = 'positive' | 'warning' | 'info' | 'neutral';

interface Insight {
    level: InsightLevel;
    title: string;
    body: string;
}

const paymentStatusClass = (status: string) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'paid') {
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
    }
    if (normalized.includes('partial')) {
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    }
    if (normalized === 'unpaid') {
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400';
    }
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
};

const insightColors: Record<InsightLevel, { bg: string; border: string; dot: string; label: string }> = {
    positive: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        border: 'border-emerald-200 dark:border-emerald-800',
        dot: 'bg-emerald-500',
        label: 'text-emerald-700 dark:text-emerald-400',
    },
    warning: {
        bg: 'bg-amber-50 dark:bg-amber-900/20',
        border: 'border-amber-200 dark:border-amber-800',
        dot: 'bg-amber-500',
        label: 'text-amber-700 dark:text-amber-400',
    },
    info: {
        bg: 'bg-sky-50 dark:bg-sky-900/20',
        border: 'border-sky-200 dark:border-sky-800',
        dot: 'bg-sky-500',
        label: 'text-sky-700 dark:text-sky-400',
    },
    neutral: {
        bg: 'bg-gray-50 dark:bg-gray-800/60',
        border: 'border-gray-200 dark:border-gray-700',
        dot: 'bg-gray-400',
        label: 'text-gray-500 dark:text-gray-400',
    },
};

function buildInsights(data: MonthlySalesReportData, formatCurrency: (n: number) => string): Insight[] {
    const insights: Insight[] = [];
    const grossSales = data.total_retail_sales + data.total_b2b_sales;

    if (data.transaction_count > 0) {
        const avg = data.net_sales / data.transaction_count;
        insights.push({
            level: 'info',
            title: 'Transaction Overview',
            body: `${data.transaction_count} transaction${data.transaction_count !== 1 ? 's' : ''} this month, averaging ${formatCurrency(avg)} per order.`,
        });
    }

    if (data.total_returns > 0 && grossSales > 0) {
        const pct = Math.round((data.total_returns / grossSales) * 100);
        insights.push({
            level: pct >= 10 ? 'warning' : 'neutral',
            title: 'Returns Activity',
            body: `${formatCurrency(data.total_returns)} in returns — ${pct}% of gross sales. ${pct >= 10 ? 'Elevated return rate; review return reasons.' : 'Within acceptable range.'}`,
        });
    }

    if (data.category_breakdown.length > 0 && data.net_sales > 0) {
        const top = [...data.category_breakdown].sort((a, b) => b.total_amount - a.total_amount)[0];
        const pct = Math.round((top.total_amount / data.net_sales) * 100);
        insights.push({
            level: 'positive',
            title: 'Top Revenue Category',
            body: `${top.item_group} drove ${pct}% of net sales (${formatCurrency(top.total_amount)}) — the strongest segment this month.`,
        });
    }

    if (data.cashier_breakdown.length > 1 && data.net_sales > 0) {
        const topC = [...data.cashier_breakdown].sort((a, b) => b.total - a.total)[0];
        const pct = Math.round((topC.total / data.net_sales) * 100);
        const displayName = topC.owner.includes('@') ? topC.owner.split('@')[0] : topC.owner;
        insights.push({
            level: 'positive',
            title: 'Top Performer',
            body: `${displayName} led sales with ${formatCurrency(topC.total)} (${pct}% of revenue, ${topC.count} txn${topC.count !== 1 ? 's' : ''}).`,
        });
    }

    const paid = data.total_pe_purchases + data.total_paid_purchases;
    const totalExposure = paid + data.total_unpaid_purchases;
    if (totalExposure > 0 && data.net_sales > 0) {
        const pct = Math.round((totalExposure / data.net_sales) * 100);
        insights.push({
            level: pct >= 80 ? 'warning' : pct >= 50 ? 'neutral' : 'positive',
            title: 'Purchase Pressure',
            body: `Total purchases of ${formatCurrency(totalExposure)} represent ${pct}% of net sales. ${pct >= 80 ? 'High spend ratio — review procurement priorities.' : pct >= 50 ? 'Moderate spend level.' : 'Healthy margin buffer maintained.'}`,
        });
    } else if (totalExposure === 0) {
        insights.push({
            level: 'info',
            title: 'No Purchases Recorded',
            body: 'No purchase payments or outstanding purchase invoices were recorded this month.',
        });
    }

    if (data.unpaid_sales_invoices.length > 0) {
        insights.push({
            level: 'warning',
            title: 'Unpaid Sales Invoices',
            body: `${data.unpaid_sales_invoices.length} invoice${data.unpaid_sales_invoices.length !== 1 ? 's' : ''} outstanding, totaling ${formatCurrency(data.total_unpaid_sales)}.`,
        });
    }

    return insights.slice(0, 6);
}

interface MonthlySalesReportProps {
    data: MonthlySalesReportData;
    monthLabel: string;
}

const MonthlySalesReport: React.FC<MonthlySalesReportProps> = ({ data, monthLabel }) => {
    const { formatCurrency } = useAppConfig();
    const avgOrderValue = data.transaction_count > 0 ? data.net_sales / data.transaction_count : 0;
    const purchaseTotal = data.total_pe_purchases + data.total_paid_purchases;
    const totalPurchaseExposure = purchaseTotal + data.total_unpaid_purchases;
    const netPosition = data.net_sales - totalPurchaseExposure;

    const purchasesByModeMap = new Map<string, { mode_of_payment: string; total: number; count: number }>();
    [...data.pe_purchases_by_mode, ...data.paid_purchases_by_mode].forEach(p => {
        const existing = purchasesByModeMap.get(p.mode_of_payment);
        if (existing) {
            existing.total += p.total;
            existing.count += p.count;
        } else {
            purchasesByModeMap.set(p.mode_of_payment, { ...p });
        }
    });
    const combinedPurchasesByMode = Array.from(purchasesByModeMap.values()).sort((a, b) => b.total - a.total);

    const insights = buildInsights(data, formatCurrency);

    return (
        <div className="space-y-6 print:space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">{monthLabel}</p>

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Net Sales"
                    value={formatCurrency(data.net_sales)}
                    color="teal"
                    icon={<TrendingIcon />}
                    subLabel="Gross minus returns"
                />
                <StatCard
                    label="Transactions"
                    value={data.transaction_count}
                    color="indigo"
                    icon={<POSIcon />}
                    subLabel={`Avg ${formatCurrency(avgOrderValue)}/order`}
                />
                <StatCard
                    label="Purchases"
                    value={formatCurrency(totalPurchaseExposure)}
                    color={totalPurchaseExposure > data.net_sales ? 'rose' : 'sky'}
                    icon={<ShoppingBagIcon />}
                    subLabel="Paid + unpaid"
                />
                <StatCard
                    label="Net Position"
                    value={`${netPosition < 0 ? '−' : ''}${formatCurrency(Math.abs(netPosition))}`}
                    color={netPosition >= 0 ? 'emerald' : 'rose'}
                    icon={<CurrencyIcon />}
                    subLabel="Sales minus purchases"
                />
            </div>

            {/* ── Insights Panel ── */}
            {insights.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <LightBulbIcon className="text-amber-500" />
                        Key Insights
                    </SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {insights.map((insight, idx) => {
                            const c = insightColors[insight.level];
                            return (
                                <div key={idx} className={`rounded-xl border p-3.5 ${c.bg} ${c.border}`}>
                                    <div className="flex items-start gap-2.5">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                                        <div>
                                            <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${c.label}`}>
                                                {insight.title}
                                            </p>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                                                {insight.body}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Sales channel breakdown ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    label="Retail (POS)"
                    value={formatCurrency(data.total_retail_sales)}
                    color="indigo"
                    icon={<POSIcon />}
                />
                <StatCard
                    label="B2B / Custom"
                    value={formatCurrency(data.total_b2b_sales)}
                    color="sky"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label="Returns"
                    value={formatCurrency(data.total_returns)}
                    color="rose"
                    icon={<ReceiptIcon className="rotate-180" />}
                />
            </div>

            {/* ── Category, Cashier & Payment Methods ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <TagIcon className="text-indigo-500" />
                        Sales by Category
                    </SectionTitle>
                    {data.category_breakdown.length === 0 ? (
                        <EmptyState label="No categorical data" />
                    ) : (
                        <div className="space-y-4">
                            {data.category_breakdown.map((cat, idx) => {
                                const pct = data.net_sales > 0
                                    ? Math.max(0, Math.round((cat.total_amount / data.net_sales) * 100))
                                    : 0;
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1 text-sm">
                                            <span className="text-gray-700 dark:text-gray-300 font-medium">{cat.item_group}</span>
                                            <span className="text-gray-900 dark:text-white font-bold">{formatCurrency(cat.total_amount)}</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-2 bg-indigo-500 rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <UserGroupIcon className="text-sky-500" />
                        Sales by Cashier
                    </SectionTitle>
                    {data.cashier_breakdown.length === 0 ? (
                        <EmptyState label="No cashier data" />
                    ) : (
                        <div className="space-y-3">
                            {data.cashier_breakdown.map((c, idx) => {
                                const pct = data.net_sales > 0 ? Math.round((c.total / data.net_sales) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold text-xs shrink-0">
                                                    {c.owner.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.owner}</p>
                                                    <p className="text-xs text-gray-500">{c.count} txn{c.count !== 1 ? 's' : ''}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(c.total)}</p>
                                                <p className="text-xs text-gray-400">{pct}%</p>
                                            </div>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden ml-11">
                                            <div className="h-1.5 bg-sky-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <POSIcon className="text-teal-500" />
                        Payment Methods
                    </SectionTitle>
                    {data.payment_breakdown.length === 0 ? (
                        <EmptyState label="No sales payments" />
                    ) : (
                        <div className="space-y-4">
                            {data.payment_breakdown.map((p, idx) => {
                                const baseTotal = data.total_retail_sales + data.total_b2b_sales;
                                const pct = baseTotal > 0 ? Math.round((p.total / baseTotal) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{p.mode_of_payment}</span>
                                                <span className="text-xs text-gray-400">({p.txn_count} txn{p.txn_count !== 1 ? 's' : ''})</span>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(p.total)}</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className="h-2 bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-right text-xs text-gray-400 mt-0.5">{pct}%</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Paid Purchases by Mode ── */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>
                    <ShoppingBagIcon className="text-purple-500" />
                    Paid Purchases by Mode
                </SectionTitle>
                {combinedPurchasesByMode.length === 0 ? (
                    <EmptyState label="No paid purchases this month" />
                ) : (
                    <div className="space-y-4">
                        {combinedPurchasesByMode.map((p, idx) => {
                            const pct = purchaseTotal > 0 ? Math.round((p.total / purchaseTotal) * 100) : 0;
                            return (
                                <div key={idx}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">{p.mode_of_payment}</span>
                                            <span className="text-xs text-gray-400">({p.count} txn{p.count !== 1 ? 's' : ''})</span>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(p.total)}</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div className="h-2 bg-purple-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <p className="text-right text-xs text-gray-400 mt-0.5">{pct}%</p>
                                </div>
                            );
                        })}
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold">
                            <span className="text-gray-700 dark:text-gray-300">Total Paid</span>
                            <span className="text-purple-600 dark:text-purple-400">{formatCurrency(purchaseTotal)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Top High-Value Invoices ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <ReceiptIcon className="text-indigo-500" />
                        Top {data.top_sales_invoices.length} High-Value Sales Invoices
                    </SectionTitle>
                    {data.top_sales_invoices.length === 0 ? (
                        <EmptyState label="No sales invoices this month" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Invoice</th>
                                        <th className="text-left pb-2 pr-3">Customer</th>
                                        <th className="text-left pb-2 pr-3">Status</th>
                                        <th className="text-right pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.top_sales_invoices.map((inv, idx) => (
                                        <tr key={idx}>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[110px]">{inv.name}</td>
                                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[140px]">{inv.party_name || '—'}</td>
                                            <td className="py-2 pr-3">
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${paymentStatusClass(inv.payment_status)}`}>
                                                    {inv.payment_status || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(inv.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <ShoppingBagIcon className="text-purple-500" />
                        Top {data.top_purchase_invoices.length} High-Value Purchase Invoices
                    </SectionTitle>
                    {data.top_purchase_invoices.length === 0 ? (
                        <EmptyState label="No purchase invoices this month" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Invoice</th>
                                        <th className="text-left pb-2 pr-3">Supplier</th>
                                        <th className="text-left pb-2 pr-3">Status</th>
                                        <th className="text-right pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.top_purchase_invoices.map((inv, idx) => (
                                        <tr key={idx}>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[110px]">{inv.name}</td>
                                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[140px]">{inv.party_name || '—'}</td>
                                            <td className="py-2 pr-3">
                                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${paymentStatusClass(inv.payment_status)}`}>
                                                    {inv.payment_status || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="py-2 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(inv.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Unpaid Invoices (kept separate from the value-ranked lists above) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <DocumentIcon className="text-rose-500" />
                        Unpaid Sales Invoices
                    </SectionTitle>
                    {data.unpaid_sales_invoices.length === 0 ? (
                        <EmptyState label="No unpaid sales invoices" />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                            <th className="text-left pb-2 pr-3">Invoice</th>
                                            <th className="text-left pb-2 pr-3">Customer</th>
                                            <th className="text-right pb-2">Outstanding</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                        {data.unpaid_sales_invoices.map((inv, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[100px]">{inv.name}</td>
                                                <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">{inv.party_name || '—'}</td>
                                                <td className="py-2 text-right font-medium text-rose-600 dark:text-rose-400">{formatCurrency(inv.outstanding_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold">
                                <span className="text-gray-700 dark:text-gray-300">Total Outstanding</span>
                                <span className="text-rose-600 dark:text-rose-400">{formatCurrency(data.total_unpaid_sales)}</span>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <DocumentIcon className="text-amber-500" />
                        Unpaid Purchase Invoices
                    </SectionTitle>
                    {data.unpaid_purchase_invoices.length === 0 ? (
                        <EmptyState label="No outstanding purchase invoices" />
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                            <th className="text-left pb-2 pr-3">Invoice</th>
                                            <th className="text-left pb-2 pr-3">Supplier</th>
                                            <th className="text-right pb-2">Outstanding</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                        {data.unpaid_purchase_invoices.map((inv, idx) => (
                                            <tr key={idx}>
                                                <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[100px]">{inv.name}</td>
                                                <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">{inv.party_name || '—'}</td>
                                                <td className="py-2 text-right font-medium text-amber-600 dark:text-amber-400">{formatCurrency(inv.outstanding_amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold">
                                <span className="text-gray-700 dark:text-gray-300">Total Outstanding</span>
                                <span className="text-amber-600 dark:text-amber-400">{formatCurrency(data.total_unpaid_purchases)}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonthlySalesReport;
