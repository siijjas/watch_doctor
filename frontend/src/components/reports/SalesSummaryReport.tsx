import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    fmt,
    StatCard,
    EmptyState,
    SectionTitle,
    POSIcon,
    ReceiptIcon,
    TagIcon,
    TrendingIcon,
    UserGroupIcon,
} from './reportShared';
import type { PosReportData } from './reportShared';

interface SalesSummaryReportProps {
    data: PosReportData;
}

const SalesSummaryReport: React.FC<SalesSummaryReportProps> = ({ data }) => {
    const { formatCurrency } = useAppConfig();
    const totalQty = data.items_sold.reduce((s, i) => s + i.total_qty, 0);

    return (
        <div className="space-y-6">
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label="Net Sales"
                    value={formatCurrency(data.net_sales)}
                    color="teal"
                    icon={<TrendingIcon />}
                    subLabel={`Total gross minus returns`}
                />
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sales by Category */}
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

                {/* Sales by Cashier */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <UserGroupIcon className="text-sky-500" />
                        Sales by Cashier
                    </SectionTitle>
                    {data.cashier_breakdown.length === 0 ? (
                        <EmptyState label="No cashier data" />
                    ) : (
                        <div className="space-y-4">
                            {data.cashier_breakdown.map((c, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold text-xs">
                                            {c.owner.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.owner}</p>
                                            <p className="text-xs text-gray-500">{c.count} transaction{c.count !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(c.total)}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Detail Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Payment Methods */}
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
                                const pct = baseTotal > 0
                                    ? Math.round((p.total / baseTotal) * 100)
                                    : 0;
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    {p.mode_of_payment}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    ({p.txn_count} txn{p.txn_count !== 1 ? 's' : ''})
                                                </span>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                                {formatCurrency(p.total)}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-2 bg-teal-500 rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <p className="text-right text-xs text-gray-400 mt-0.5">{pct}%</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Items Sold */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <TagIcon className="text-sky-500" />
                        Items Sold
                    </SectionTitle>
                    {data.items_sold.length === 0 ? (
                        <EmptyState label="No items sold" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Item</th>
                                        <th className="text-right pb-2 pr-3">Qty</th>
                                        <th className="text-right pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.items_sold.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[180px]">
                                                {item.item_name}
                                            </td>
                                            <td className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400">
                                                {item.total_qty}
                                            </td>
                                            <td className="py-2 text-right font-medium text-gray-800 dark:text-gray-200">
                                                {formatCurrency(item.total_amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default SalesSummaryReport;
