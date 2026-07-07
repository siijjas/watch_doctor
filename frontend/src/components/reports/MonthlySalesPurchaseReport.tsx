import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import { EmptyState, SectionTitle, StatCard, TrendingIcon, ReceiptIcon, UserGroupIcon, TagIcon } from './reportShared';
import type { MonthlySalesPurchaseSummaryData } from './monthlyReportShared';
import { deltaColor, formatDeltaPct, formatMonthLabel } from './monthlyReportShared';

interface MonthlySalesPurchaseReportProps {
    data: MonthlySalesPurchaseSummaryData;
    monthLabel: string;
}

const pctChange = (curVal: number, prevVal: number) => (prevVal ? ((curVal - prevVal) / Math.abs(prevVal)) * 100 : null);

const MonthlySalesPurchaseReport: React.FC<MonthlySalesPurchaseReportProps> = ({ data, monthLabel }) => {
    const { formatCurrency } = useAppConfig();
    const { current, previous } = data;

    const volumeRows: { label: string; current: number; previous: number; currency?: boolean; higherIsBetter?: boolean }[] = [
        { label: 'Repair Orders Received', current: current.orders_received, previous: previous.orders_received },
        { label: 'Repair Orders Delivered', current: current.orders_delivered, previous: previous.orders_delivered },
        { label: 'Open Backlog (period end)', current: current.backlog_open, previous: previous.backlog_open, higherIsBetter: false },
        { label: 'Repair Invoices Issued', current: current.repair_invoice_count, previous: previous.repair_invoice_count },
        { label: 'Retail Invoices Issued', current: current.retail_invoice_count, previous: previous.retail_invoice_count },
        { label: 'B2B Invoices Issued', current: current.b2b_invoice_count, previous: previous.b2b_invoice_count },
        { label: 'Avg. Repair Order Value', current: current.avg_repair_order_value, previous: previous.avg_repair_order_value, currency: true },
        { label: 'Avg. Retail Order Value', current: current.avg_retail_order_value, previous: previous.avg_retail_order_value, currency: true },
        { label: 'Avg. B2B Order Value', current: current.avg_b2b_order_value, previous: previous.avg_b2b_order_value, currency: true },
    ];

    const TopList: React.FC<{
        title: string;
        rows: any[];
        nameKey: string;
        valueKey: string;
        currency?: boolean;
        unit?: string;
    }> = ({ title, rows, nameKey, valueKey, currency, unit }) => (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
            <SectionTitle>{title}</SectionTitle>
            {rows.length === 0 ? (
                <EmptyState label="No data for this month" />
            ) : (
                <ol className="space-y-2">
                    {rows.map((row, idx) => (
                        <li key={idx} className="flex items-center justify-between text-sm border-b border-gray-50 dark:border-gray-700/50 pb-2 last:border-0 last:pb-0">
                            <span className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-semibold flex items-center justify-center text-gray-500 dark:text-gray-300">
                                    {idx + 1}
                                </span>
                                {row[nameKey] || 'Unspecified'}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                                {currency ? formatCurrency(Number(row[valueKey] || 0)) : Number(row[valueKey] || 0).toFixed(0)}
                                {unit ? ` ${unit}` : ''}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );

    return (
        <div className="space-y-6 print:space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
                {monthLabel} vs. {formatMonthLabel(previous.from_date.slice(0, 7))}
            </p>

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Orders Delivered"
                    value={current.orders_delivered}
                    subLabel={`${formatDeltaPct(pctChange(current.orders_delivered, previous.orders_delivered))} vs. last month`}
                    color="blue"
                    icon={<TrendingIcon />}
                />
                <StatCard
                    label="Estimate Conversion Rate"
                    value={`${current.conversion_rate_pct.toFixed(1)}%`}
                    subLabel={`${formatDeltaPct(pctChange(current.conversion_rate_pct, previous.conversion_rate_pct))} vs. last month`}
                    color="amber"
                    icon={<TagIcon />}
                />
                <StatCard
                    label="Procurement Spend"
                    value={formatCurrency(current.total_procurement_spend)}
                    subLabel={`${formatDeltaPct(pctChange(current.total_procurement_spend, previous.total_procurement_spend))} vs. last month`}
                    color="rose"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label="Stock on Hand (Current)"
                    value={formatCurrency(data.stock_value)}
                    subLabel="As of today"
                    color="indigo"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label="Receivables Outstanding"
                    value={formatCurrency(data.ar_outstanding)}
                    subLabel="As of today"
                    color="teal"
                    icon={<UserGroupIcon />}
                />
                <StatCard
                    label="Payables Outstanding"
                    value={formatCurrency(data.ap_outstanding)}
                    subLabel="As of today"
                    color="pink"
                    icon={<UserGroupIcon />}
                />
            </div>

            {/* Sales volume & mix */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Sales Volume & Mix</SectionTitle>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                <th className="py-2 pr-3">Metric</th>
                                <th className="py-2 pr-3 text-right">This Month</th>
                                <th className="py-2 pr-3 text-right">Last Month</th>
                                <th className="py-2 text-right">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {volumeRows.map(row => {
                                const pct = pctChange(row.current, row.previous);
                                return (
                                    <tr key={row.label} className="border-b border-gray-50 dark:border-gray-700/50">
                                        <td className="py-2 pr-3">{row.label}</td>
                                        <td className="py-2 pr-3 text-right">{row.currency ? formatCurrency(row.current) : row.current}</td>
                                        <td className="py-2 pr-3 text-right text-gray-400">{row.currency ? formatCurrency(row.previous) : row.previous}</td>
                                        <td className={`py-2 text-right font-medium ${deltaColor(pct, row.higherIsBetter ?? true)}`}>{formatDeltaPct(pct)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Estimate conversion */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Estimate Conversion</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500">Quotations Issued</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{current.quoted_orders}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Converted to Invoice</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{current.quoted_and_invoiced}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Conversion Rate</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{current.conversion_rate_pct.toFixed(1)}%</p>
                    </div>
                </div>
            </div>

            {/* Procurement & inventory */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Procurement & Inventory</SectionTitle>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                        <p className="text-gray-500">Total Procurement Spend</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(current.total_procurement_spend)}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">COGS Recognized (reference)</p>
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(current.cogs_amount)}</p>
                    </div>
                    <div className="sm:col-span-2">
                        <p className="text-gray-500">Procurement vs. COGS Gap (stock build +/drawdown −)</p>
                        <p className={`text-lg font-semibold ${current.procurement_cogs_gap >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {formatCurrency(current.procurement_cogs_gap)}
                        </p>
                    </div>
                    <div className="sm:col-span-2 text-xs text-gray-400">
                        Days Inventory Outstanding (est.): {data.days_inventory_outstanding.toFixed(0)} days, based on current stock value and this month's COGS run-rate.
                    </div>
                </div>
            </div>

            {/* Top performer lists */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TopList title="Top Technicians (Watches Completed)" rows={current.top_technicians} nameKey="technician_name" valueKey="watches_completed" unit="watches" />
                <TopList title="Top Brands Serviced" rows={current.top_brands} nameKey="watch_brand" valueKey="watches_serviced" unit="watches" />
                <TopList title="Top Retail/B2B Items Sold" rows={current.top_items_sold} nameKey="item_name" valueKey="total_amount" currency />
                <TopList title="Top Suppliers (Spend)" rows={current.top_suppliers} nameKey="supplier_name" valueKey="total_spend" currency />
                <TopList title="Top Items Purchased (Value)" rows={current.top_items_purchased} nameKey="item_name" valueKey="total_amount" currency />
            </div>
        </div>
    );
};

export default MonthlySalesPurchaseReport;
