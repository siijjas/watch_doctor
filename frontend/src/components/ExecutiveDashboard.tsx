import React, { useState, useEffect, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import * as apiService from '../services/apiService';
import type { DashboardStats, OrdersTrendItem, TechnicianStats, TopIssue, PendingOrder } from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { useAppConfig } from '../context/AppConfigContext';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend
);

interface ExecutiveDashboardProps {
    onNavigateToOrders: (filter?: string, search?: string) => void;
    onSelectOrder: (orderId: string) => void;
    onSwitchView: () => void;
}

const getUrgencyTier = (days: number): { label: string; color: string; bg: string; pulse: boolean } => {
    if (days > 14) return { label: 'Critical', color: 'text-red-700', bg: 'bg-red-100', pulse: true };
    if (days > 7)  return { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-100', pulse: false };
    if (days > 3)  return { label: 'Medium',   color: 'text-yellow-700', bg: 'bg-yellow-100', pulse: false };
    return               { label: 'Low',       color: 'text-green-700',  bg: 'bg-green-100',  pulse: false };
};

// Dreelio-style KPI card for executive view
const ExecKpiCard: React.FC<{
    title: string;
    value: React.ReactNode;
    subtitle?: string;
    accent: string;
    icon: React.ReactNode;
    onClick?: () => void;
}> = ({ title, value, subtitle, accent, icon, onClick }) => (
    <div
        onClick={onClick}
        className={`rounded-2xl p-4 sm:p-5 bg-white shadow-sm border ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all duration-200' : ''}`}
        style={{ borderColor: '#F0EEEB' }}
    >
        <div className="flex justify-between items-start">
            <div>
                <p className="text-[11px] sm:text-xs font-medium text-gray-500 mb-1">{title}</p>
                <div className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">{value}</div>
                {subtitle && <p className="text-[11px] sm:text-xs mt-2 text-gray-400">{subtitle}</p>}
            </div>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent }}>{icon}</div>
        </div>
    </div>
);

const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ onNavigateToOrders, onSelectOrder, onSwitchView }) => {
    const { formatCurrency } = useAppConfig();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [trend, setTrend] = useState<OrdersTrendItem[]>([]);
    const [technicians, setTechnicians] = useState<TechnicianStats[]>([]);
    const [issues, setIssues] = useState<TopIssue[]>([]);
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [periodDays, setPeriodDays] = useState(30);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    const loadData = useCallback(async (isManualRefresh = false) => {
        if (!isErpNext) { setIsLoading(false); return; }
        if (isManualRefresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const [statsData, trendData, techData, issuesData, pendingData] = await Promise.all([
                apiService.getDashboardStats(periodDays),
                apiService.getOrdersTrend(periodDays),
                apiService.getTechnicianStats(),
                apiService.getTopIssues(8),
                apiService.getAgedPendingOrders(10),
            ]);
            setStats(statsData);
            setTrend(trendData);
            setTechnicians(techData);
            setIssues(issuesData);
            setPendingOrders(pendingData);
            setLastRefreshed(new Date());
        } catch (error) {
            console.error('Executive dashboard load failed:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [periodDays]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12" style={{ borderTop: '3px solid #8B7E74', borderBottom: '3px solid #8B7E74', borderLeft: '3px solid transparent', borderRight: '3px solid transparent' }}></div>
            </div>
        );
    }

    if (!isErpNext) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Executive Dashboard is only available when connected to ERPNext.</p>
                <button
                    onClick={() => onNavigateToOrders()}
                    className="mt-4 px-4 py-2 rounded-lg"
                    style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                >
                    Go to Orders
                </button>
            </div>
        );
    }

    // --- Computed metrics ---
    const completionRate =
        stats && stats.orders_in_period > 0
            ? Math.round((stats.completed_in_period / stats.orders_in_period) * 100)
            : 0;

    const totalActive = stats ? stats.pending + stats.in_progress + stats.awaiting_parts : 0;

    // Today snapshot: last entry in trend array
    const todayEntry = trend.length > 0 ? trend[trend.length - 1] : null;

    // Urgency breakdown
    const criticalCount = pendingOrders.filter(o => o.days_pending > 14).length;
    const highCount = pendingOrders.filter(o => o.days_pending > 7 && o.days_pending <= 14).length;

    // --- Orders Trend Chart ---
    const trendChartData = {
        labels: trend.map(t => t.label),
        datasets: [
            {
                label: 'Received',
                data: trend.map(t => t.received),
                backgroundColor: '#5B8DEF',
                borderRadius: 8,
                barThickness: 14,
            },
            {
                label: 'Completed',
                data: trend.map(t => t.completed),
                backgroundColor: '#C2D6F8',
                borderRadius: 8,
                barThickness: 14,
            },
        ],
    };

    const trendChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const } },
        scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#F3EFEA' }, border: { display: false } },
            x: { grid: { display: false }, border: { display: false } },
        },
    };

    // --- Technician Efficiency Chart (horizontal bar) ---
    const techChartData = {
        labels: technicians.map(t => t.technician_name || t.technician),
        datasets: [
            {
                label: 'Efficiency %',
                data: technicians.map(t =>
                    t.total_tasks > 0 ? Math.round((t.completed / t.total_tasks) * 100) : 0
                ),
                backgroundColor: technicians.map(t => {
                    const pct = t.total_tasks > 0 ? (t.completed / t.total_tasks) * 100 : 0;
                    if (pct >= 80) return '#34D399';
                    if (pct >= 50) return '#FBBF24';
                    return '#F87171';
                }),
                borderRadius: 6,
            },
        ],
    };

    const techChartOptions = {
        indexAxis: 'y' as const,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: { callback: (v: any) => `${v}%` },
            },
        },
    };

    return (
        <div className="p-0">
            {/* ── Header ── */}
            <div className="mb-5 sm:mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center gap-3">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Executive Overview</h1>
                        <span className="px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider" style={{ backgroundColor: '#EAF0FA', color: '#648DDA' }}>
                            Executive
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        {/* View Switcher */}
                        <div className="flex items-center rounded-xl p-1" style={{ backgroundColor: '#F0EDEA' }}>
                            <button
                                onClick={onSwitchView}
                                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700 transition-all"
                            >
                                General
                            </button>
                            <button
                                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-white text-gray-800 shadow-sm"
                            >
                                Executive
                            </button>
                        </div>
                        <span className="text-xs text-gray-400 hidden sm:inline">
                            Updated {lastRefreshed.toLocaleTimeString()}
                        </span>
                        <select
                            value={periodDays}
                            onChange={e => setPeriodDays(parseInt(e.target.value))}
                            className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm focus:ring-2 focus:ring-gray-200 shadow-sm"
                            style={{ border: '1px solid #E8E8E8' }}
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={14}>Last 14 days</option>
                            <option value={30}>Last 30 days</option>
                            <option value={90}>Last 90 days</option>
                        </select>
                        <button
                            onClick={() => loadData(true)}
                            disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors shadow-sm"
                            style={{ backgroundColor: '#648DDA', color: '#FDFEFF' }}
                        >
                            <svg
                                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Today's Snapshot Banner */}
                {todayEntry && (
                    <div className="mt-4 flex flex-wrap gap-6 border rounded-2xl px-6 py-3 text-sm items-center" style={{ backgroundColor: '#F8F5F1', borderColor: '#F0EEEB' }}>
                        <span className="font-semibold" style={{ color: '#648DDA' }}>Today</span>
                        <span className="text-gray-600">
                            Received: <strong className="text-gray-800">{todayEntry.received}</strong>
                        </span>
                        <span className="text-gray-600">
                            Completed: <strong className="text-green-700">{todayEntry.completed}</strong>
                        </span>
                        {criticalCount > 0 && (
                            <span className="ml-auto text-red-600 font-semibold text-xs">
                                ⚠ {criticalCount} critical order{criticalCount > 1 ? 's' : ''} (&gt;14 days pending)
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Primary KPI Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-4 sm:mb-6">
                <ExecKpiCard
                    title="Revenue This Month"
                    value={formatCurrency(stats?.revenue_this_month || 0)}
                    subtitle="Invoiced & collected"
                    accent="#EAF0FA"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#648DDA" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />

                <ExecKpiCard
                    title="Completion Rate"
                    value={`${completionRate}%`}
                    subtitle={`${stats?.completed_in_period ?? 0} of ${stats?.orders_in_period ?? 0} orders · ${periodDays}d`}
                    accent="#EAF6EE"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#16A34A" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />

                <ExecKpiCard
                    title="Avg Turnaround"
                    value={
                        <>
                            {stats?.avg_repair_days ?? '—'}
                            <span className="text-lg font-normal"> days</span>
                        </>
                    }
                    subtitle="Door-to-done average"
                    accent="#FBF2E8"
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#EA580C" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                />

                <ExecKpiCard
                    title="Parts Bottleneck"
                    value={stats?.awaiting_parts ?? 0}
                    subtitle="Awaiting parts · tap to view"
                    accent="#FCEBEC"
                    onClick={() => onNavigateToOrders('Awaiting Parts')}
                    icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#E11D48" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    }
                />
            </div>

            {/* ── Secondary Stats Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                {[
                    { label: 'Total Orders', value: stats?.total_orders ?? 0, filter: 'All' },
                    { label: 'Pending', value: stats?.pending ?? 0, filter: 'Pending' },
                    { label: 'In Progress', value: stats?.in_progress ?? 0, filter: 'In Progress' },
                    { label: 'Active (excl. delivered)', value: totalActive, filter: undefined },
                ].map(stat => (
                    <div
                        key={stat.label}
                        onClick={stat.filter ? () => onNavigateToOrders(stat.filter) : undefined}
                        className={`bg-white rounded-2xl p-5 shadow-sm border ${stat.filter ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                        style={{ borderColor: '#F0EEEB' }}
                    >
                        <p className="text-xs text-gray-500 font-medium mb-1">{stat.label}</p>
                        <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Charts Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Orders Trend */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Orders Trend</h3>
                    <p className="text-xs text-gray-400 mb-6">Received vs completed over selected period</p>
                    <div className="h-64">
                        <Bar data={trendChartData} options={trendChartOptions} />
                    </div>
                </div>

                {/* Technician Efficiency Chart */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-1">Technician Efficiency</h3>
                    <p className="text-xs text-gray-400 mb-6">
                        Completion rate per technician · green ≥80% · yellow ≥50% · red &lt;50%
                    </p>
                    {technicians.length > 0 ? (
                        <div className="h-64">
                            <Bar data={techChartData} options={techChartOptions} />
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-16">No technician data available</p>
                    )}
                </div>
            </div>

            {/* ── Bottom Row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                {/* Top Issues */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Most Common Issues</h3>
                    <p className="text-xs text-gray-400 mb-6">Issue frequency across all repair orders</p>
                    {issues.length > 0 ? (
                        <div className="space-y-5">
                            {issues.map((issue, idx) => (
                                <div key={issue.issue_name || idx}>
                                    <div className="flex justify-between mb-1.5">
                                        <span className="text-sm font-semibold text-gray-700">{issue.issue_name}</span>
                                        <span className="text-sm text-gray-500">
                                            <strong style={{ color: '#648DDA' }}>{issue.count}</strong> orders ({issue.percentage}%)
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="h-2 rounded-full"
                                            style={{ width: `${issue.percentage}%`, backgroundColor: '#648DDA' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8">No data available</p>
                    )}
                </div>

                {/* Technician Scorecard Table */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-1">Technician Scorecard</h3>
                    <p className="text-xs text-gray-400 mb-6">Task breakdown and efficiency per technician (all time)</p>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Technician</th>
                                    <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Done</th>
                                    <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</th>
                                    <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</th>
                                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Efficiency</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {technicians.length > 0 ? technicians.map((tech, idx) => {
                                    const efficiency = tech.total_tasks > 0
                                        ? Math.round((tech.completed / tech.total_tasks) * 100)
                                        : 0;
                                    const effColor = efficiency >= 80
                                        ? 'text-green-600'
                                        : efficiency >= 50
                                            ? 'text-yellow-600'
                                            : 'text-red-500';
                                    return (
                                        <tr
                                            key={tech.technician || idx}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => onNavigateToOrders(undefined, tech.technician_name || tech.technician)}
                                        >
                                            <td className="py-3 font-medium text-gray-800">
                                                {tech.technician_name || tech.technician}
                                            </td>
                                            <td className="py-3 text-center text-gray-700">{tech.completed}</td>
                                            <td className="py-3 text-center text-gray-700">{tech.in_progress}</td>
                                            <td className="py-3 text-center text-gray-700">{tech.pending}</td>
                                            <td className={`py-3 text-right font-bold ${effColor}`}>{efficiency}%</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-400">No data available</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Aged Pending Orders (extended to 10, with urgency tiers) ── */}
            <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Aged Pending Orders</h3>
                        <p className="text-xs text-gray-400 mt-1">Top 10 longest-waiting orders requiring attention</p>
                    </div>
                    {/* Urgency summary badges */}
                    <div className="flex items-center gap-2 text-xs">
                        {criticalCount > 0 && (
                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full font-bold animate-pulse">
                                {criticalCount} Critical
                            </span>
                        )}
                        {highCount > 0 && (
                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-bold">
                                {highCount} High
                            </span>
                        )}
                        {criticalCount === 0 && highCount === 0 && pendingOrders.length > 0 && (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                All within SLA
                            </span>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Days Waiting</th>
                                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Urgency</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {pendingOrders.length > 0 ? pendingOrders.map(order => {
                                const tier = getUrgencyTier(order.days_pending);
                                return (
                                    <tr
                                        key={order.name}
                                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        onClick={() => onSelectOrder(order.name)}
                                    >
                                        <td className="py-3 px-4 font-medium text-gray-900">{order.name}</td>
                                        <td className="py-3 px-4 text-gray-600">{order.customer_name || order.customer}</td>
                                        <td className="py-3 px-4 text-gray-500 text-sm">{order.received_date}</td>
                                        <td className="py-3 px-4 text-right font-bold text-gray-800">{order.days_pending}d</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-block px-2 py-1 text-xs font-bold rounded-full ${tier.bg} ${tier.color} ${tier.pulse ? 'animate-pulse' : ''}`}>
                                                {tier.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-gray-400">No pending orders found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ExecutiveDashboard;
