import React, { useState, useEffect, useCallback } from 'react';
import { isErpNext } from '../services/apiService';
import { todayISO } from './reports/reportShared';
import type { DailyReportData } from './reports/reportShared';
import RepairSummaryReport from './reports/RepairSummaryReport';
import SalesSummaryReport from './reports/SalesSummaryReport';
import FinancialSummaryReport from './reports/FinancialSummaryReport';
import { printReport } from './reports/printReport';

type ReportTab = 'repair' | 'sales' | 'financial';

const TABS: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    {
        id: 'repair',
        label: 'Repair Summary',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
    {
        id: 'sales',
        label: 'Sales Summary',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
    },
    {
        id: 'financial',
        label: 'Financial Summary',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
        ),
    },
];

interface DailyReportProps {
    onSelectOrder?: (orderId: string) => void;
}

const DailyReport: React.FC<DailyReportProps> = ({ onSelectOrder }) => {
    const [activeTab, setActiveTab] = useState<ReportTab>('repair');
    const [reportDate, setReportDate] = useState(todayISO());
    const [data, setData] = useState<DailyReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReport = useCallback(async (date: string) => {
        if (!isErpNext) {
            setError('Reports are only available in production (ERPNext).');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/method/watch_doctor.api.get_daily_report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': (window as any).csrf_token || '',
                },
                body: JSON.stringify({ report_date: date }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json.message);
        } catch (e: any) {
            setError(e.message || 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadReport(reportDate);
    }, [reportDate, loadReport]);

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Daily performance overview</p>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="date"
                        value={reportDate}
                        onChange={e => setReportDate(e.target.value)}
                        max={todayISO()}
                        className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                        onClick={() => loadReport(reportDate)}
                        disabled={isLoading}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        {isLoading ? 'Loading…' : 'Refresh'}
                    </button>
                    <button
                        onClick={() => data && printReport(activeTab, data)}
                        disabled={!data}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-40"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit print:hidden">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}

            {/* Loading skeleton */}
            {isLoading && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
                    ))}
                </div>
            )}

            {/* Report Body */}
            {!isLoading && data && (
                <>
                    {activeTab === 'repair' && (
                        <RepairSummaryReport data={data.repair} onSelectOrder={onSelectOrder} />
                    )}
                    {activeTab === 'sales' && (
                        <SalesSummaryReport data={data.pos} />
                    )}
                    {activeTab === 'financial' && (
                        <FinancialSummaryReport repair={data.repair} pos={data.pos} financial={data.financial} />
                    )}
                </>
            )}
        </div>
    );
};

export default DailyReport;
