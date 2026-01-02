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

// KPI Card Component - Plutus-inspired design
// KPI Card Component - Poze-inspired design
const KpiCard: React.FC<{
    title: string;
    value: string | number;
    subtitle?: string;
    gradient: string;
    icon: React.ReactNode;
    onClick?: () => void;
}> = ({ title, value, subtitle, gradient, icon, onClick }) => (
    <div
        onClick={onClick}
        className={`rounded-3xl p-6 text-white shadow-lg relative overflow-hidden bg-gradient-to-br ${gradient} ${onClick ? 'cursor-pointer hover:scale-[1.02] transition-transform duration-200' : ''}`}
    >
        {/* Background Decoration */}
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-20 pointer-events-none">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
        </div>

        <div className="relative z-10">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="text-sm font-medium opacity-90 mb-1">{title}</h3>
                    <p className="text-3xl font-bold">{value}</p>
                    {subtitle && (
                        <div className="flex items-center mt-2 text-xs font-medium bg-white/20 w-max px-2 py-1 rounded-lg">
                            <span className="mr-1">↑</span> {subtitle}
                        </div>
                    )}
                </div>
                <div className="p-2 bg-white/20 rounded-xlbackdrop-blur-sm">
                    {icon}
                </div>
            </div>
        </div>
    </div>
);

// Icons for KPI cards (White)
const OrdersIcon = () => (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
);

const RevenueIcon = () => (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CompletedIcon = () => (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const PendingIcon = () => (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ProgressIcon = () => (
    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const Dashboard: React.FC<DashboardProps> = ({ onNavigateToOrders, onSelectOrder }) => {
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

    // Poze Chart Styles
    const barChartData = {
        labels: trend.map(t => t.label),
        datasets: [
            {
                label: 'Received',
                data: trend.map(t => t.received),
                backgroundColor: 'rgba(59, 130, 246, 0.8)', // Blue
                borderRadius: 12,
                barThickness: 16,
            },
            {
                label: 'Completed',
                data: trend.map(t => t.completed),
                backgroundColor: '#34D399', // Green
                borderRadius: 12,
                barThickness: 16,
            },
        ],
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
            },
            title: {
                display: false,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1,
                },
            },
        },
    };

    // Doughnut chart for status distribution (Restored Real Data)
    const doughnutData = {
        labels: ['Pending', 'In Progress', 'Awaiting Parts', 'Repaired', 'Delivered'],
        datasets: [
            {
                data: stats
                    ? [stats.pending, stats.in_progress, stats.awaiting_parts, stats.repaired, stats.delivered]
                    : [0, 0, 0, 0, 0],
                backgroundColor: [
                    '#FBBF24', // Amber/Yellow (Pending)
                    '#8B5CF6', // Purple (In Progress)
                    '#F97316', // Orange (Awaiting Parts)
                    '#34D399', // Green (Repaired)
                    '#3B82F6', // Blue (Delivered)
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

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
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
        <div className="min-h-screen bg-gray-50 p-8">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Dashboard Overview</h1>
                    </div>
                    <select
                        value={periodDays}
                        onChange={(e) => setPeriodDays(parseInt(e.target.value))}
                        className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-300 shadow-sm"
                    >
                        <option value={7}>Last 7 days</option>
                        <option value={14}>Last 14 days</option>
                        <option value={30}>Last 30 days</option>
                    </select>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KpiCard
                    title="Total Orders"
                    value={stats?.total_orders || 0}
                    subtitle="All time"
                    gradient="from-blue-400 to-cyan-300"
                    icon={<OrdersIcon />}
                    onClick={() => onNavigateToOrders('All')}
                />
                <KpiCard
                    title="Pending"
                    value={stats?.pending || 0}
                    subtitle="Awaiting action"
                    gradient="from-red-400 to-orange-300"
                    icon={<PendingIcon />}
                    onClick={() => onNavigateToOrders('Pending')}
                />
                <KpiCard
                    title="In Progress"
                    value={stats?.in_progress || 0}
                    subtitle="Active repairs"
                    gradient="from-green-400 to-lime-300"
                    icon={<ProgressIcon />}
                    onClick={() => onNavigateToOrders('In Progress')}
                />
                <KpiCard
                    title="Completed"
                    value={stats?.completed_in_period || 0}
                    subtitle={`Last ${periodDays} days`}
                    gradient="from-pink-400 to-purple-300"
                    icon={<CompletedIcon />}
                    onClick={() => onNavigateToOrders('Repaired')}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Bar Chart - Orders Trend */}
                <div className="bg-white rounded-3xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                        Orders Trend
                    </h3>
                    <div className="h-64">
                        <Bar data={barChartData} options={barChartOptions} />
                    </div>
                </div>

                {/* Doughnut Chart - Status Distribution */}
                <div className="bg-white rounded-3xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                        Status Distribution
                    </h3>
                    <div className="h-64">
                        <Doughnut data={doughnutData} options={doughnutOptions} />
                    </div>
                </div>
            </div>

            {/* Bottom Row - Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Technician Performance */}
                <div className="bg-white rounded-3xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                        Technician Performance
                    </h3>
                    {technicians.length > 0 ? (
                        <div className="space-y-4">
                            {technicians.map((tech, idx) => (
                                <div
                                    key={tech.technician || idx}
                                    className="flex items-center justify-between cursor-pointer hover:bg-gray-50 p-2 rounded-xl transition-colors"
                                    onClick={() => onNavigateToOrders(undefined, tech.technician_name || tech.technician)}
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                                            <span className="text-purple-600 font-bold text-lg">
                                                {(tech.technician_name || tech.technician || 'T').charAt(0)}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="font-bold text-gray-800 block">
                                                {tech.technician_name || tech.technician}
                                            </span>
                                            <span className="text-xs text-gray-400">Tech ID: #{idx + 1}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block font-bold text-gray-800">{tech.completed} Repaired</span>
                                        <span className="text-xs text-gray-400">{tech.in_progress} Active</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8">No data available</p>
                    )}
                </div>

                {/* Most Common Issues */}
                <div className="bg-white rounded-3xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                        Most Common Issues
                    </h3>
                    {issues.length > 0 ? (
                        <div className="space-y-6">
                            {issues.map((issue, idx) => (
                                <div
                                    key={issue.issue_name || idx}
                                    className="cursor-pointer hover:bg-gray-50 p-2 rounded-xl transition-colors"
                                    onClick={() => onNavigateToOrders(undefined, issue.issue_name)}
                                >
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-bold text-gray-700">
                                            {issue.issue_name}
                                        </span>
                                        <span className="text-sm font-bold text-purple-600">
                                            {issue.percentage}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div
                                            className="bg-purple-500 h-2 rounded-full shadow-md shadow-purple-500/30"
                                            style={{ width: `${issue.percentage}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-8">No data available</p>
                    )}
                </div>
            </div>

            {/* Aged Pending Orders */}
            <div className="grid grid-cols-1 mb-8">
                <div className="bg-white rounded-3xl shadow-sm p-8">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">
                        ⏳ Oldest Pending Orders
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Received</th>
                                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Days Pending</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {pendingOrders.length > 0 ? (
                                    pendingOrders.map((order) => (
                                        <tr
                                            key={order.name}
                                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                                            onClick={() => onSelectOrder(order.name)}
                                        >
                                            <td className="py-3 px-4 font-medium text-gray-900">{order.name}</td>
                                            <td className="py-3 px-4 text-gray-600">{order.customer_name || order.customer}</td>
                                            <td className="py-3 px-4 text-gray-500 text-sm">{order.received_date}</td>
                                            <td className="py-3 px-4 text-right">
                                                <span className={`font-bold ${order.days_pending > 7 ? 'text-red-500' : 'text-yellow-600'}`}>
                                                    {order.days_pending} days
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <span className="inline-block px-2 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800">
                                                    {order.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-400">No pending orders found</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Quick Stats Banner (Restored) */}
            {stats && stats.avg_repair_days > 0 && (
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-3xl shadow-lg p-8 text-white mb-6">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-white/10 rounded-full">
                                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-lg font-medium text-slate-300">Shop Velocity</h4>
                                <p className="text-3xl font-bold mt-1">{stats.avg_repair_days} <span className="text-lg font-normal text-slate-400">days avg</span></p>
                            </div>
                        </div>

                        <div className="h-px w-full md:w-px md:h-12 bg-white/10"></div>

                        <div className="flex items-center space-x-4">
                            <div className="p-3 bg-white/10 rounded-full">
                                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-lg font-medium text-slate-300">Throughput</h4>
                                <p className="text-3xl font-bold mt-1">{stats.completed_in_period} <span className="text-lg font-normal text-slate-400">units/week</span></p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
