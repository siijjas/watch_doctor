import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import { EmptyState, SectionTitle, StatCard, TrendingIcon, CurrencyIcon, ReceiptIcon } from './reportShared';
import type { MonthlyExecutiveSummaryData } from './monthlyReportShared';
import { deltaColor, formatDeltaPct, formatMonthLabel } from './monthlyReportShared';

interface MonthlyExecutiveSummaryReportProps {
    data: MonthlyExecutiveSummaryData;
    monthLabel: string;
}

const MonthlyExecutiveSummaryReport: React.FC<MonthlyExecutiveSummaryReportProps> = ({ data, monthLabel }) => {
    const { formatCurrency } = useAppConfig();
    const { current, previous, comparison } = data;

    const byMetric = (metric: string) => comparison.find(c => c.metric === metric);
    const netRevenueChange = byMetric('net_revenue');
    const grossProfitChange = byMetric('gross_profit');
    const opexChange = byMetric('operating_expenses_total');
    const netProfitChange = byMetric('net_profit');

    // Merge current + previous expense-by-account into one comparison list so an
    // account that disappeared (or is brand new) still shows up with a zero side.
    const expenseAccounts = new Map<string, { account: string; current: number; previous: number }>();
    for (const row of current.expense_by_account) {
        expenseAccounts.set(row.account, { account: row.account, current: row.total, previous: 0 });
    }
    for (const row of previous.expense_by_account) {
        const existing = expenseAccounts.get(row.account);
        if (existing) existing.previous = row.total;
        else expenseAccounts.set(row.account, { account: row.account, current: 0, previous: row.total });
    }
    const expenseRows = Array.from(expenseAccounts.values()).sort((a, b) => b.current - a.current);

    const revenueRows: { label: string; current: number; previous: number }[] = [
        { label: 'Repair Revenue', current: current.repair_revenue_gross, previous: previous.repair_revenue_gross },
        { label: 'Retail Sales', current: current.retail_sales_gross, previous: previous.retail_sales_gross },
        { label: 'B2B Sales', current: current.b2b_sales_gross, previous: previous.b2b_sales_gross },
        { label: 'Less: Returns', current: -current.returns_gross, previous: -previous.returns_gross },
    ];

    const pctChange = (curVal: number, prevVal: number) => (prevVal ? ((curVal - prevVal) / Math.abs(prevVal)) * 100 : null);

    return (
        <div className="space-y-6 print:space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2">
                {monthLabel} vs. {formatMonthLabel(previous.from_date.slice(0, 7))}
            </p>

            {/* KPI cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    label="Total Revenue (incl. VAT)"
                    value={formatCurrency(current.gross_revenue)}
                    subLabel={`${formatDeltaPct(netRevenueChange?.delta_pct ?? null)} vs. last month`}
                    color="blue"
                    icon={<CurrencyIcon />}
                />
                <StatCard
                    label={`Gross Profit (${current.gross_margin_pct.toFixed(1)}%)`}
                    value={formatCurrency(current.gross_profit)}
                    subLabel={`${formatDeltaPct(grossProfitChange?.delta_pct ?? null)} vs. last month`}
                    color="emerald"
                    icon={<TrendingIcon />}
                />
                <StatCard
                    label="Operating Expenses"
                    value={formatCurrency(current.operating_expenses_total)}
                    subLabel={`${formatDeltaPct(opexChange?.delta_pct ?? null)} vs. last month`}
                    color="rose"
                    icon={<ReceiptIcon />}
                />
                <StatCard
                    label={`Net Profit (${current.net_margin_pct.toFixed(1)}%)`}
                    value={formatCurrency(current.net_profit)}
                    subLabel={`${formatDeltaPct(netProfitChange?.delta_pct ?? null)} vs. last month`}
                    color="teal"
                    icon={<TrendingIcon />}
                />
            </div>

            {/* Revenue breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Revenue</SectionTitle>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                <th className="py-2 pr-3">Stream</th>
                                <th className="py-2 pr-3 text-right">This Month</th>
                                <th className="py-2 pr-3 text-right">Last Month</th>
                                <th className="py-2 text-right">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {revenueRows.map(row => {
                                const pct = pctChange(row.current, row.previous);
                                return (
                                    <tr key={row.label} className="border-b border-gray-50 dark:border-gray-700/50">
                                        <td className="py-2 pr-3">{row.label}</td>
                                        <td className="py-2 pr-3 text-right">{formatCurrency(row.current)}</td>
                                        <td className="py-2 pr-3 text-right text-gray-400">{formatCurrency(row.previous)}</td>
                                        <td className={`py-2 text-right font-medium ${deltaColor(pct)}`}>{formatDeltaPct(pct)}</td>
                                    </tr>
                                );
                            })}
                            <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-semibold">
                                <td className="py-2 pr-3">Total Revenue (incl. VAT)</td>
                                <td className="py-2 pr-3 text-right">{formatCurrency(current.gross_revenue)}</td>
                                <td className="py-2 pr-3 text-right text-gray-400">{formatCurrency(previous.gross_revenue)}</td>
                                <td className={`py-2 text-right ${deltaColor(netRevenueChange?.delta_pct ?? null)}`}>
                                    {formatDeltaPct(netRevenueChange?.delta_pct ?? null)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Operating expenses by account */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Operating Expenses by Account</SectionTitle>
                {expenseRows.length === 0 ? (
                    <EmptyState label="No operating expenses recorded for this month" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                    <th className="py-2 pr-3">Account</th>
                                    <th className="py-2 pr-3 text-right">This Month</th>
                                    <th className="py-2 pr-3 text-right">Last Month</th>
                                    <th className="py-2 text-right">Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenseRows.map(row => {
                                    const pct = pctChange(row.current, row.previous);
                                    return (
                                        <tr key={row.account} className="border-b border-gray-50 dark:border-gray-700/50">
                                            <td className="py-2 pr-3">{row.account}</td>
                                            <td className="py-2 pr-3 text-right">{formatCurrency(row.current)}</td>
                                            <td className="py-2 pr-3 text-right text-gray-400">{formatCurrency(row.previous)}</td>
                                            <td className={`py-2 text-right font-medium ${deltaColor(pct, false)}`}>{formatDeltaPct(pct)}</td>
                                        </tr>
                                    );
                                })}
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-semibold">
                                    <td className="py-2 pr-3">Total Operating Expenses</td>
                                    <td className="py-2 pr-3 text-right">{formatCurrency(current.operating_expenses_total)}</td>
                                    <td className="py-2 pr-3 text-right text-gray-400">{formatCurrency(previous.operating_expenses_total)}</td>
                                    <td className={`py-2 text-right ${deltaColor(opexChange?.delta_pct ?? null, false)}`}>
                                        {formatDeltaPct(opexChange?.delta_pct ?? null)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Item group profit breakdown */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Item Group Profitability (This Month)</SectionTitle>
                {current.item_group_breakdown.length === 0 ? (
                    <EmptyState label="No item sales recorded for this month" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                    <th className="py-2 pr-3">Item Group</th>
                                    <th className="py-2 pr-3 text-right">Qty</th>
                                    <th className="py-2 pr-3 text-right">Sales</th>
                                    <th className="py-2 pr-3 text-right">COGS</th>
                                    <th className="py-2 text-right">Gross Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {current.item_group_breakdown.map(row => (
                                    <tr key={row.item_group} className="border-b border-gray-50 dark:border-gray-700/50">
                                        <td className="py-2 pr-3 font-medium">{row.item_group}</td>
                                        <td className="py-2 pr-3 text-right">{row.qty_sold.toFixed(2)}</td>
                                        <td className="py-2 pr-3 text-right">{formatCurrency(row.sales_amount)}</td>
                                        <td className="py-2 pr-3 text-right text-gray-400">{formatCurrency(row.cogs_amount)}</td>
                                        <td className={`py-2 text-right font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {formatCurrency(row.gross_profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MonthlyExecutiveSummaryReport;
