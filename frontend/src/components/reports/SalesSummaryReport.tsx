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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard
                    label="POS Total Sales"
                    value={formatCurrency(data.total_sales)}
                    color="teal"
                    icon={<POSIcon />}
                />
                <StatCard
                    label="Transactions"
                    value={data.transaction_count}
                    color="indigo"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label="Items Sold (qty)"
                    value={totalQty}
                    color="sky"
                    icon={<TagIcon />}
                />
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
                        <EmptyState label="No POS sales" />
                    ) : (
                        <div className="space-y-4">
                            {data.payment_breakdown.map((p, idx) => {
                                const pct = data.total_sales > 0
                                    ? Math.round((p.total / data.total_sales) * 100)
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
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold text-gray-900 dark:text-white">
                                <span>Total</span>
                                <span>{formatCurrency(data.total_sales)}</span>
                            </div>
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
                                <tfoot>
                                    <tr className="border-t border-gray-200 dark:border-gray-600">
                                        <td className="pt-2 pr-3 text-sm font-bold text-gray-700 dark:text-gray-300">Total</td>
                                        <td className="pt-2 pr-3 text-right text-sm font-bold text-gray-800 dark:text-gray-200">
                                            {totalQty}
                                        </td>
                                        <td className="pt-2 text-right text-sm font-bold text-gray-800 dark:text-gray-200">
                                            {formatCurrency(data.total_sales)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default SalesSummaryReport;
