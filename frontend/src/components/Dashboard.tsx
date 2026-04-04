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
import { Bar, Doughnut } from 'react-chartjs-2';
import * as apiService from '../services/apiService';
import type { DashboardStats, OrdersTrendItem, TechnicianStats, TopIssue, PendingOrder } from '../services/apiService';
import { isErpNext } from '../services/apiService';
import ExecutiveDashboard from './ExecutiveDashboard';

// Register Chart.js components
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

interface DashboardProps {
    onNavigateToOrders: (filter?: string, search?: string) => void;
    onSelectOrder: (orderId: string) => void;
}

// KPI Card Component - Dreelio-style flat card
const KpiCard: React.FC<{
    title: string;
    value: string | number;
    change?: string;
    isPositive?: boolean;
    icon: React.ReactNode;
    onClick?: () => void;
}> = ({ title, value, change, isPositive = true, icon, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white rounded-2xl p-3 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all duration-200' : ''}`}
        style={{ border: '1px solid #F0EEEB' }}
    >
        {/* Icon */}
        <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#F5F0EB' }}
        >
            {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
            <p className="text-[11px] sm:text-xs font-medium text-gray-400 mb-0.5">{title}</p>
            <div className="flex items-baseline justify-between">
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{value}</span>
                {change && (
                    <span className={`text-xs font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isPositive ? '+' : ''}{change}
                    </span>
                )}
            </div>
        </div>
    </div>
);

// Icons for KPI cards (Dreelio warm brown style)
const OrdersIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8B7E74" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);

const RevenueIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8B7E74" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CompletedIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8B7E74" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const PendingIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8B7E74" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ProgressIcon = () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#8B7E74" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToOrders, onSelectOrder }) => {
    const [dashboardView, setDashboardView] = useState<'general' | 'executive'>('general');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [trend, setTrend] = useState<OrdersTrendItem[]>([]);
    const [technicians, setTechnicians] = useState<TechnicianStats[]>([]);
    const [issues, setIssues] = useState<TopIssue[]>([]);
    const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [periodDays, setPeriodDays] = useState(7);

    const loadDashboardData = useCallback(async () => {
        if (!isErpNext) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const [statsData, trendData, techData, issuesData, pendingData] = await Promise.all([
                apiService.getDashboardStats(periodDays),
                apiService.getOrdersTrend(periodDays),
                apiService.getTechnicianStats(),
                apiService.getTopIssues(5),
                apiService.getAgedPendingOrders(5),
            ]);
            setStats(statsData);
            setTrend(trendData);
            setTechnicians(techData);
            setIssues(issuesData);
            setPendingOrders(pendingData);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [periodDays]);

    useEffect(() => {
        loadDashboardData();
    }, [loadDashboardData]);

    // Dreelio Chart Styles
    const barChartData = {
        labels: trend.map(t => t.label),
        datasets: [
            {
                label: 'Received',
                data: trend.map(t => t.received),
                backgroundColor: '#5B8DEF',
                borderRadius: 6,
                barThickness: 22,
            },
            {
                label: 'Completed',
                data: trend.map(t => t.completed),
                backgroundColor: '#C2D6F8',
                borderRadius: 6,
                barThickness: 22,
            },
        ],
    };

    // Calculate a sensible y-axis max so the chart never looks empty
    const maxVal = Math.max(...trend.map(t => Math.max(t.received, t.completed)), 0);
    const suggestedMax = maxVal < 5 ? 5 : Math.ceil(maxVal * 1.3);

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
            },
            tooltip: {
                backgroundColor: '#1F2937',
                titleFont: { size: 12 },
                bodyFont: { size: 12 },
                cornerRadius: 8,
                padding: 10,
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#9CA3AF', font: { size: 11 } },
                border: { display: false },
            },
            y: {
                beginAtZero: true,
                suggestedMax,
                grid: { color: '#F3F4F6', drawBorder: false },
                ticks: {
                    color: '#C5C0BB',
                    font: { size: 10 },
                    stepSize: suggestedMax <= 5 ? 1 : undefined,
                    padding: 8,
                },
                border: { display: false },
            },
        },
        interaction: {
            intersect: false,
            mode: 'index' as const,
        },
    };

    // Doughnut chart for status distribution
    const doughnutData = {
        labels: ['Pending', 'In Progress', 'Awaiting Parts', 'Repaired', 'Delivered'],
        datasets: [
            {
                data: stats
                    ? [stats.pending, stats.in_progress, stats.awaiting_parts, stats.repaired, stats.delivered]
                    : [0, 0, 0, 0, 0],
                backgroundColor: [
                    '#E8C7A1', // Warm sand (Pending)
                    '#5B8DEF', // Blue (In Progress)
                    '#F0A868', // Warm orange (Awaiting Parts)
                    '#6BC9A0', // Soft green (Repaired)
                    '#B8C4D8', // Muted blue-gray (Delivered)
                ],
                borderWidth: 0,
                cutout: '65%',
            },
        ],
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right' as const,
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    font: { size: 12 },
                    color: '#6B7280',
                },
            },
        },
        cutout: '60%',
        onClick: (_event: any, elements: any[]) => {
            if (elements.length > 0) {
                const index = elements[0].index;
                // Map index to status label
                const labels = ['Pending', 'In Progress', 'Awaiting Parts', 'Repaired', 'Delivered'];
                const status = labels[index];
                if (status) {
                    onNavigateToOrders(status);
                }
            }
        },
        onHover: (event: any, chartElement: any) => {
            event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
        }
    };

    if (dashboardView === 'executive') {
        return (
            <ExecutiveDashboard
                onNavigateToOrders={onNavigateToOrders}
                onSelectOrder={onSelectOrder}
                onSwitchView={() => setDashboardView('general')}
            />
        );
    }

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
                <p className="text-gray-500 dark:text-gray-400">Dashboard is only available when connected to ERPNext.</p>
                <button
                    onClick={onNavigateToOrders}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                    Go to Orders
                </button>
            </div>
        );
    }

    return (
        <div className="p-0">
            {/* Header */}
            <div className="mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* View Switcher */}
                        <div className="flex items-center rounded-xl p-1" style={{ backgroundColor: '#F0EDEA' }}>
                            <button
                                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-white text-gray-800 shadow-sm"
                            >
                                General
                            </button>
                            <button
                                onClick={() => setDashboardView('executive')}
                                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-gray-500 hover:text-gray-700 transition-all"
                            >
                                Executive
                            </button>
                        </div>
                        <select
                            value={periodDays}
                            onChange={(e) => setPeriodDays(parseInt(e.target.value))}
                            className="px-3 py-1.5 rounded-xl bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 shadow-sm"
                            style={{ border: '1px solid #E8E8E8' }}
                        >
                            <option value={7}>Last 7 days</option>
                            <option value={14}>Last 14 days</option>
                            <option value={30}>Last 30 days</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* KPI Cards - Dreelio flat style */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
                <KpiCard
                    title="Total Orders"
                    value={stats?.total_orders || 0}
                    icon={<OrdersIcon />}
                    onClick={() => onNavigateToOrders('All')}
                />
                <KpiCard
                    title="Pending"
                    value={stats?.pending || 0}
                    icon={<PendingIcon />}
                    onClick={() => onNavigateToOrders('Pending')}
                />
                <KpiCard
                    title="In Progress"
                    value={stats?.in_progress || 0}
                    icon={<ProgressIcon />}
                    onClick={() => onNavigateToOrders('In Progress')}
                />
                <KpiCard
                    title="Completed"
                    value={stats?.completed_in_period || 0}
                    change={`Last ${periodDays}d`}
                    icon={<CompletedIcon />}
                    onClick={() => onNavigateToOrders('Repaired')}
                />
            </div>

            {/* Shop Velocity Strip */}
            {stats && stats.avg_repair_days > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
                    <div
                        className="bg-white rounded-2xl shadow-sm px-5 py-4 flex items-center gap-4"
                        style={{ border: '1px solid #F0EEEB' }}
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EEF1FB' }}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#648DDA" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Avg Repair Time</p>
                            <p className="text-lg font-bold text-gray-900">{stats.avg_repair_days} <span className="text-sm font-normal text-gray-400">days</span></p>
                        </div>
                    </div>
                    <div
                        className="bg-white rounded-2xl shadow-sm px-5 py-4 flex items-center gap-4"
                        style={{ border: '1px solid #F0EEEB' }}
                    >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EBF5F0' }}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#4DA67A" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Throughput</p>
                            <p className="text-lg font-bold text-gray-900">{stats.completed_in_period} <span className="text-sm font-normal text-gray-400">units / {periodDays}d</span></p>
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4">
                {/* Bar Chart - Orders Trend */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm sm:text-base font-bold text-gray-900">Orders Trend</h3>
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50 transition-colors" style={{ border: '1px solid #EDEDED' }}>
                            <span>Week</span>
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-5 mb-4">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#5B8DEF' }}></span>
                            <span className="text-xs text-gray-500">Received</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#C2D6F8' }}></span>
                            <span className="text-xs text-gray-500">Completed</span>
                        </div>
                    </div>
                    <div className="h-56">
                        <Bar data={barChartData} options={barChartOptions} />
                    </div>
                </div>

                {/* Doughnut Chart - Status Distribution */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-4">
                        Status Distribution
                    </h3>
                    <div className="h-60">
                        <Doughnut data={doughnutData} options={doughnutOptions} />
                    </div>
                </div>
            </div>

            {/* Bottom Row - Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4">
                {/* Technician Performance */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-4">
                        Technician Performance
                    </h3>
                    {technicians.length > 0 ? (
                        <div className="space-y-3">
                            {technicians.map((tech, idx) => (
                                <div
                                    key={tech.technician || idx}
                                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2.5 rounded-xl transition-colors"
                                    onClick={() => onNavigateToOrders(undefined, tech.technician_name || tech.technician)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F5F0EB' }}>
                                            <span className="font-bold text-sm" style={{ color: '#8B7E74' }}>
                                                {(tech.technician_name || tech.technician || 'T').charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-sm text-gray-800 block">
                                                {tech.technician_name || tech.technician}
                                            </span>
                                            <span className="text-xs text-gray-400">Tech #{idx + 1}</span>
                                        </div>
                                    </div>
                                    <div className="text-right min-w-[80px]">
                                        <span className="block font-semibold text-sm text-gray-800">{tech.completed} done</span>
                                        <span className="text-xs text-gray-400">{tech.in_progress} active</span>
                                        {/* Mini progress bar */}
                                        {(tech.completed + tech.in_progress) > 0 && (
                                            <div className="mt-1.5 w-full rounded-full h-1" style={{ backgroundColor: '#F0EDEA' }}>
                                                <div
                                                    className="h-1 rounded-full"
                                                    style={{
                                                        width: `${Math.round((tech.completed / (tech.completed + tech.in_progress)) * 100)}%`,
                                                        backgroundColor: '#6BC9A0',
                                                    }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8 text-sm">No data available</p>
                    )}
                </div>

                {/* Most Common Issues */}
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-4">
                        Most Common Issues
                    </h3>
                    {issues.length > 0 ? (
                        <div className="space-y-4">
                            {issues.map((issue, idx) => (
                                <div
                                    key={issue.issue_name || idx}
                                    className="cursor-pointer hover:bg-gray-50 p-2.5 rounded-xl transition-colors"
                                    onClick={() => onNavigateToOrders(undefined, issue.issue_name)}
                                >
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-semibold text-gray-700">
                                            {issue.issue_name}
                                        </span>
                                        <span className="text-xs font-bold tabular-nums" style={{ color: '#5B8DEF' }}>
                                            {issue.percentage}%
                                        </span>
                                    </div>
                                    <div className="w-full rounded-full h-2" style={{ backgroundColor: '#F0EDEA' }}>
                                        <div
                                            className="h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${issue.percentage}%`, backgroundColor: '#5B8DEF' }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8 text-sm">No data available</p>
                    )}
                </div>
            </div>

            {/* Aged Pending Orders */}
            <div className="mb-6">
                <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-4">
                        Oldest Pending Orders
                    </h3>
                    {/* Mobile card view */}
                    <div className="sm:hidden space-y-3">
                        {pendingOrders.length > 0 ? pendingOrders.map((order) => (
                            <div
                                key={order.name}
                                className="p-3 rounded-xl active:bg-gray-50 transition-colors cursor-pointer"
                                style={{ border: '1px solid #F3EFEA' }}
                                onClick={() => onSelectOrder(order.name)}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-900">{order.name}</span>
                                    <span className={`text-xs font-semibold ${order.days_pending > 7 ? 'text-rose-500' : 'text-amber-600'}`}>{order.days_pending}d</span>
                                </div>
                                <p className="text-xs text-gray-500">{order.customer_name || order.customer} · {order.received_date}</p>
                            </div>
                        )) : (
                            <p className="py-6 text-center text-gray-400 text-sm">No pending orders found</p>
                        )}
                    </div>
                    {/* Desktop table view */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr style={{ borderBottom: '1px solid #F0EEEB' }}>
                                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Order ID</th>
                                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Customer</th>
                                    <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Received</th>
                                    <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Days Pending</th>
                                    <th className="text-center py-2.5 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingOrders.length > 0 ? (
                                    pendingOrders.map((order) => (
                                        <tr
                                            key={order.name}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                            style={{ borderBottom: '1px solid #F8F6F3' }}
                                            onClick={() => onSelectOrder(order.name)}
                                        >
                                            <td className="py-3 px-4 font-medium text-sm text-gray-900">{order.name}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600">{order.customer_name || order.customer}</td>
                                            <td className="py-3 px-4 text-sm text-gray-500">{order.received_date}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`text-sm font-semibold ${order.days_pending > 7 ? 'text-rose-500' : 'text-amber-600'}`}>
                                                    {order.days_pending}d
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                                    {order.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-400 text-sm">No pending orders found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>


        </div>
    );
};

export default Dashboard;
