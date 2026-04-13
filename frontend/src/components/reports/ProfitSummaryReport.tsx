import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import { EmptyState, SectionTitle, StatCard, TrendingIcon } from './reportShared';
import type { RepairReportData, PosReportData, FinancialReportData } from './reportShared';

interface ProfitSummaryReportProps {
    repair: RepairReportData;
    pos: PosReportData;
    financial?: FinancialReportData;
}

const ProfitSummaryReport: React.FC<ProfitSummaryReportProps> = ({ repair, pos, financial }) => {
    const { formatCurrency } = useAppConfig();
    const rows = financial?.item_profit_summary || [];
    const groupRows = financial?.item_group_profit_summary || [];

    const totalSales = rows.reduce((sum, r) => sum + Number(r.sales_amount || 0), 0);
    const totalCogs = rows.reduce((sum, r) => sum + Number(r.cogs_amount || 0), 0);
    const totalGrossProfit = rows.reduce((sum, r) => sum + Number(r.gross_profit || 0), 0);
    const grossMargin = totalSales > 0 ? (totalGrossProfit / totalSales) * 100 : 0;
    const totalQty = rows.reduce((sum, r) => sum + Number(r.qty_sold || 0), 0);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard label="Sales Amount" value={formatCurrency(totalSales)} color="blue" icon={<TrendingIcon />} />
                <StatCard label="COGS" value={formatCurrency(totalCogs)} color="rose" icon={<TrendingIcon />} />
                <StatCard
                    label="Gross Profit"
                    value={`${totalGrossProfit < 0 ? '-' : ''}${formatCurrency(Math.abs(totalGrossProfit))}`}
                    color={totalGrossProfit >= 0 ? 'emerald' : 'rose'}
                    icon={<TrendingIcon />}
                />
                <StatCard
                    label="Gross Margin"
                    value={`${grossMargin.toFixed(1)}%`}
                    color={grossMargin >= 0 ? 'teal' : 'rose'}
                    icon={<TrendingIcon />}
                />
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Item Group-wise Profit Breakdown</SectionTitle>
                {groupRows.length === 0 ? (
                    <EmptyState label="No item group profit data" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                    <th className="py-2 pr-3">Item Group</th>
                                    <th className="py-2 pr-3 text-right">Qty</th>
                                    <th className="py-2 pr-3 text-right">Gross Profit</th>
                                    <th className="py-2 text-right">Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupRows.map((row) => (
                                    <tr key={row.item_group} className="border-b border-gray-50 dark:border-gray-700/50">
                                        <td className="py-2 pr-3 font-medium">{row.item_group}</td>
                                        <td className="py-2 pr-3 text-right">{row.qty_sold.toFixed(2)}</td>
                                        <td className={`py-2 pr-3 text-right font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {formatCurrency(row.gross_profit)}
                                        </td>
                                        <td className="py-2 text-right">{row.gross_margin_pct.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5">
                <SectionTitle>Item-wise Profit Breakdown (Daily)</SectionTitle>
                <p className="text-xs text-gray-500 mb-4">Total items: {rows.length} | Total qty sold: {totalQty.toFixed(2)}</p>

                {rows.length === 0 ? (
                    <EmptyState label="No sales items found for this date" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
                                    <th className="py-2 pr-3">Item</th>
                                    <th className="py-2 pr-3 text-right">Qty</th>
                                    <th className="py-2 pr-3 text-right">Selling Rate</th>
                                    <th className="py-2 pr-3 text-right">COGS Rate</th>
                                    <th className="py-2 pr-3 text-right">Gross Profit</th>
                                    <th className="py-2 text-right">Margin %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.item_code || row.item_name} className="border-b border-gray-50 dark:border-gray-700/50">
                                        <td className="py-2 pr-3">
                                            <div className="font-medium">{row.item_name}</div>
                                            <div className="text-xs text-gray-400">{row.item_code}</div>
                                        </td>
                                        <td className="py-2 pr-3 text-right">{Number(row.qty_sold || 0).toFixed(2)}</td>
                                        <td className="py-2 pr-3 text-right">{formatCurrency(Number(row.selling_rate || 0))}</td>
                                        <td className="py-2 pr-3 text-right">{formatCurrency(Number(row.cogs_rate || 0))}</td>
                                        <td className={`py-2 pr-3 text-right font-semibold ${Number(row.gross_profit || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {formatCurrency(Number(row.gross_profit || 0))}
                                        </td>
                                        <td className="py-2 text-right">{Number(row.gross_margin_pct || 0).toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-600 font-semibold">
                                    <td className="py-2 pr-3">Totals</td>
                                    <td className="py-2 pr-3 text-right">{totalQty.toFixed(2)}</td>
                                    <td className="py-2 pr-3 text-right">-</td>
                                    <td className="py-2 pr-3 text-right">-</td>
                                    <td className={`py-2 pr-3 text-right ${totalGrossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatCurrency(totalGrossProfit)}</td>
                                    <td className="py-2 text-right">{grossMargin.toFixed(1)}%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfitSummaryReport;