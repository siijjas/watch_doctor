import React from 'react';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    fmt,
    StatCard,
    EmptyState,
    SectionTitle,
    CurrencyIcon,
    POSIcon,
    TrendingIcon,
} from './reportShared';
import type { RepairReportData, PosReportData, FinancialReportData, ExpenseEntry, ModeBalance } from './reportShared';

// Expense icon
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

interface FinancialSummaryReportProps {
    repair: RepairReportData;
    pos: PosReportData;
    financial?: FinancialReportData;
}

const EMPTY_FINANCIAL: FinancialReportData = { total_expenses: 0, expense_breakdown: [], expense_entries: [], repair_payment_breakdown: [] };

const FinancialSummaryReport: React.FC<FinancialSummaryReportProps> = ({ repair, pos, financial: financialRaw }) => {
    const { formatCurrency } = useAppConfig();
    const financial = financialRaw ?? EMPTY_FINANCIAL;
    const totalRevenue = repair.revenue + pos.total_sales;
    const totalExpenses = financial.total_expenses;
    const netRevenue = totalRevenue - totalExpenses;

    const netColor: 'emerald' | 'rose' = netRevenue >= 0 ? 'emerald' : 'rose';

    // Build per-mode income / expense / balance rows
    const modeBalances: ModeBalance[] = (() => {
        const allModes = new Set<string>();
        pos.payment_breakdown.forEach(p => allModes.add(p.mode_of_payment));
        (financial.repair_payment_breakdown ?? []).forEach(r => allModes.add(r.mode_of_payment));
        financial.expense_breakdown.forEach(e => allModes.add(e.mode_of_payment));
        return Array.from(allModes).map(mode => {
            const posIncome = pos.payment_breakdown.find(p => p.mode_of_payment === mode)?.total ?? 0;
            const repairIncome = (financial.repair_payment_breakdown ?? []).find(r => r.mode_of_payment === mode)?.total ?? 0;
            const income = posIncome + repairIncome;
            const expenses = financial.expense_breakdown.find(e => e.mode_of_payment === mode)?.total ?? 0;
            const balance = income - expenses;
            return { mode_of_payment: mode, income, expenses, balance };
        });
    })();

    return (
        <div className="space-y-6">
            {/* ── Stats ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard
                    label="Total Revenue"
                    value={formatCurrency(totalRevenue)}
                    color="emerald"
                    icon={<TrendingIcon />}
                />
                <StatCard
                    label="Total Expenses"
                    value={formatCurrency(totalExpenses)}
                    color="rose"
                    icon={<ExpenseIcon />}
                />
                <StatCard
                    label="Net Revenue"
                    value={formatCurrency(netRevenue)}
                    subLabel={netRevenue >= 0 ? 'Profitable' : 'Loss'}
                    color={netColor}
                    icon={<NetIcon />}
                />
            </div>

            {/* ── Payment Mode Balance ── */}
            {modeBalances.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <NetIcon className="text-indigo-500" />
                        Payment Mode Balance
                    </SectionTitle>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                    <th className="text-left pb-2 pr-3">Mode</th>
                                    <th className="text-right pb-2 pr-3">Income (In)</th>
                                    <th className="text-right pb-2 pr-3">Expenses (Out)</th>
                                    <th className="text-right pb-2">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {modeBalances.map((mb, idx) => (
                                    <tr key={idx}>
                                        <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">{mb.mode_of_payment}</td>
                                        <td className="py-2 pr-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(mb.income)}</td>
                                        <td className="py-2 pr-3 text-right text-rose-600 dark:text-rose-400">{mb.expenses > 0 ? formatCurrency(mb.expenses) : '—'}</td>
                                        <td className={`py-2 text-right font-semibold ${ mb.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {mb.balance < 0 ? '−' : ''}{formatCurrency(Math.abs(mb.balance))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t border-gray-200 dark:border-gray-600 font-bold">
                                    <td className="pt-2 text-sm text-gray-700 dark:text-gray-300">Total</td>
                                    <td className="pt-2 text-right text-sm text-emerald-600 dark:text-emerald-400">{formatCurrency(modeBalances.reduce((s, m) => s + m.income, 0))}</td>
                                    <td className="pt-2 text-right text-sm text-rose-600 dark:text-rose-400">{formatCurrency(modeBalances.reduce((s, m) => s + m.expenses, 0))}</td>
                                    <td className={`pt-2 text-right text-sm ${netRevenue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {netRevenue < 0 ? '−' : ''}{formatCurrency(Math.abs(netRevenue))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Details Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Expenses Breakdown by mode */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <ExpenseIcon className="text-rose-500" />
                        Expenses by Payment Mode
                    </SectionTitle>
                    {financial.expense_breakdown.length === 0 ? (
                        <EmptyState label="No expenses recorded for configured payment modes" />
                    ) : (
                        <div className="space-y-4">
                            {financial.expense_breakdown.map((e, idx) => {
                                const pct = totalExpenses > 0 ? Math.round((e.total / totalExpenses) * 100) : 0;
                                return (
                                    <div key={idx}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shrink-0" />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{e.mode_of_payment}</span>
                                                <span className="text-xs text-gray-400">({e.count} {e.count === 1 ? 'entry' : 'entries'})</span>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(e.total)}</span>
                                        </div>
                                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className="h-2 bg-rose-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                        </div>
                                        <p className="text-right text-xs text-gray-400 mt-0.5">{pct}%</p>
                                    </div>
                                );
                            })}
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold text-gray-900 dark:text-white">
                                <span>Total Expenses</span>
                                <span className="text-rose-600 dark:text-rose-400">{formatCurrency(totalExpenses)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Expense Detail Table — full width */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 lg:col-span-2">
                    <SectionTitle>
                        <ExpenseIcon className="text-rose-400" />
                        Expense Details
                    </SectionTitle>
                    {financial.expense_entries.length === 0 ? (
                        <EmptyState label="No expense entries for configured payment modes" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Entry</th>
                                        <th className="text-left pb-2 pr-3">Mode</th>
                                        <th className="text-left pb-2 pr-3">Debit Account</th>
                                        <th className="text-left pb-2 pr-3">Remarks</th>
                                        <th className="text-right pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {financial.expense_entries.map((e: ExpenseEntry, idx: number) => (
                                        <tr key={idx}>
                                            <td className="py-2 pr-3 font-mono text-xs text-gray-600 dark:text-gray-400">{e.name}</td>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{e.mode_of_payment}</td>
                                            <td className="py-2 pr-3 text-gray-600 dark:text-gray-400 truncate max-w-[180px]">
                                                {e.debit_account || '—'}
                                            </td>
                                            <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                                {e.remarks || '—'}
                                            </td>
                                            <td className="py-2 text-right font-semibold text-rose-600 dark:text-rose-400">
                                                {formatCurrency(e.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-200 dark:border-gray-600">
                                        <td colSpan={4} className="pt-2 text-sm font-bold text-gray-700 dark:text-gray-300">Total</td>
                                        <td className="pt-2 text-right text-sm font-bold text-rose-600 dark:text-rose-400">
                                            {formatCurrency(totalExpenses)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>

                {/* Net Revenue Summary */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <NetIcon className="text-emerald-500" />
                        Net Revenue Summary
                    </SectionTitle>
                    <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Repair Revenue</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(repair.revenue)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">POS Revenue</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(pos.total_sales)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold border-t border-gray-100 dark:border-gray-700 pt-2">
                            <span className="text-gray-700 dark:text-gray-300">Total Revenue</span>
                            <span className="text-gray-900 dark:text-white">{formatCurrency(totalRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total Expenses</span>
                            <span className="font-semibold text-rose-600 dark:text-rose-400">− {formatCurrency(totalExpenses)}</span>
                        </div>
                        <div className={`flex justify-between text-base font-bold border-t-2 pt-3 ${netRevenue >= 0 ? 'border-emerald-200 dark:border-emerald-700' : 'border-rose-200 dark:border-rose-700'}`}>
                            <span className="text-gray-900 dark:text-white">Net Revenue</span>
                            <span className={netRevenue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                {netRevenue < 0 ? '−' : ''} {formatCurrency(Math.abs(netRevenue))}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Invoice & Transaction Details */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CurrencyIcon className="text-blue-500" />
                        Transaction Details
                    </SectionTitle>
                    <div className="space-y-3">
                        <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">Repair</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Invoices Issued</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{repair.invoice_count}</span>
                        </div>
                        {repair.invoice_count > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">Avg. per Invoice</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(repair.revenue / repair.invoice_count)}</span>
                            </div>
                        )}
                        <p className="text-xs uppercase tracking-wide text-gray-400 font-medium pt-2">POS</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Transactions</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{pos.transaction_count}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Unique Items Sold</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{pos.items_sold.length}</span>
                        </div>
                        <p className="text-xs uppercase tracking-wide text-gray-400 font-medium pt-2">Expenses</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">Total Entries</span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                                {financial.expense_breakdown.reduce((s, e) => s + e.count, 0)}
                            </span>
                        </div>
                        {financial.expense_breakdown.length > 0 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600 dark:text-gray-400">Modes Used</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{financial.expense_breakdown.length}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* POS Payment Methods */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 lg:col-span-2">
                    <SectionTitle>
                        <POSIcon className="text-teal-500" />
                        POS — Payment Methods
                    </SectionTitle>
                    {pos.payment_breakdown.length === 0 ? (
                        <EmptyState label="No POS payments" />
                    ) : (
                        <div className="space-y-3">
                            {pos.payment_breakdown.map((p, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">{p.mode_of_payment}</span>
                                        <span className="text-xs text-gray-400">({p.txn_count} txn{p.txn_count !== 1 ? 's' : ''})</span>
                                    </div>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(p.total)}</span>
                                </div>
                            ))}
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between text-sm font-bold text-gray-900 dark:text-white">
                                <span>Total POS</span>
                                <span>{formatCurrency(pos.total_sales)}</span>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FinancialSummaryReport;
