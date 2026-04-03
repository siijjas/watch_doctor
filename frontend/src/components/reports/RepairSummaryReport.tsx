import React from 'react';
import {
    fmt,
    StatCard,
    EmptyState,
    SectionTitle,
    StatusBadge,
    InboxIcon,
    CheckIcon,
    ClockIcon,
    UserGroupIcon,
    IssueIcon,
    WrenchIcon,
} from './reportShared';
import type { RepairReportData } from './reportShared';

interface RepairSummaryReportProps {
    data: RepairReportData;
    onSelectOrder?: (orderId: string) => void;
}

const RepairSummaryReport: React.FC<RepairSummaryReportProps> = ({ data, onSelectOrder }) => {
    const maxTasks = Math.max(...(data.technician_tasks.map(t => t.tasks_completed)), 1);

    return (
        <div className="space-y-6">
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="Orders Received"
                    value={data.received_count}
                    color="purple"
                    icon={<InboxIcon />}
                />
                <StatCard
                    label="Orders Completed"
                    value={data.completed_count}
                    color="green"
                    icon={<CheckIcon />}
                />
                <StatCard
                    label="Open Orders"
                    value={data.pending_count + data.inprogress_count}
                    subLabel={`${data.inprogress_count} in progress · ${data.pending_count} pending`}
                    color="amber"
                    icon={<ClockIcon />}
                />
                <StatCard
                    label="Technicians Active"
                    value={data.technician_tasks.length}
                    color="indigo"
                    icon={<UserGroupIcon />}
                />
            </div>

            {/* ── Detail Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Orders Received */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <InboxIcon className="text-purple-500" />
                        Orders Received ({data.received_count})
                    </SectionTitle>
                    {data.received_count === 0 ? (
                        <EmptyState label="No orders received" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Order</th>
                                        <th className="text-left pb-2 pr-3">Customer</th>
                                        <th className="text-left pb-2 pr-3">Status</th>
                                        <th className="text-left pb-2">Priority</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.received_orders.map(o => (
                                        <tr key={o.name} className="group">
                                            <td className="py-2 pr-3">
                                                <button
                                                    onClick={() => onSelectOrder?.(o.name)}
                                                    className="text-purple-600 dark:text-purple-400 hover:underline font-mono text-xs print:text-gray-900 print:no-underline"
                                                >
                                                    {o.name}
                                                </button>
                                            </td>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                                                {o.customer_name}
                                            </td>
                                            <td className="py-2 pr-3">
                                                <StatusBadge status={o.status} />
                                            </td>
                                            <td className="py-2 text-gray-600 dark:text-gray-400 text-xs">
                                                {o.priority}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Orders Completed */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <CheckIcon className="text-green-500" />
                        Orders Completed ({data.completed_count})
                    </SectionTitle>
                    {data.completed_count === 0 ? (
                        <EmptyState label="No orders completed" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Order</th>
                                        <th className="text-left pb-2 pr-3">Customer</th>
                                        <th className="text-right pb-2">Invoiced</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.completed_orders.map(o => (
                                        <tr key={o.name}>
                                            <td className="py-2 pr-3">
                                                <button
                                                    onClick={() => onSelectOrder?.(o.name)}
                                                    className="text-purple-600 dark:text-purple-400 hover:underline font-mono text-xs print:text-gray-900"
                                                >
                                                    {o.name}
                                                </button>
                                            </td>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300 truncate max-w-[120px]">
                                                {o.customer_name}
                                            </td>
                                            <td className="py-2 text-right text-gray-800 dark:text-gray-200 font-medium">
                                                {o.invoiced_amount ? `$${fmt(o.invoiced_amount)}` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Technician Performance */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <UserGroupIcon className="text-indigo-500" />
                        Technician Performance
                    </SectionTitle>
                    {data.technician_tasks.length === 0 ? (
                        <EmptyState label="No tasks marked complete" />
                    ) : (
                        <div className="space-y-3">
                            {data.technician_tasks.map(t => (
                                <div key={t.technician} className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm shrink-0">
                                        {(t.technician_name || t.technician || 'T').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                            {t.technician_name || t.technician}
                                        </p>
                                        <div className="mt-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-2 bg-indigo-500 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, (t.tasks_completed / maxTasks) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                        {t.tasks_completed} task{t.tasks_completed !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top Issues */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                    <SectionTitle>
                        <IssueIcon className="text-amber-500" />
                        Top Issues Reported
                    </SectionTitle>
                    {data.top_issues.length === 0 ? (
                        <EmptyState label="No issues logged today" />
                    ) : (
                        <div className="space-y-2">
                            {data.top_issues.map((issue, idx) => (
                                <div key={idx} className="flex items-center gap-3">
                                    <span className="w-6 text-center text-sm font-bold text-gray-400">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{issue.issue_name}</p>
                                    </div>
                                    <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                                        ×{issue.count}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Parts Used */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 lg:col-span-2">
                    <SectionTitle>
                        <WrenchIcon className="text-gray-500" />
                        Parts Used
                    </SectionTitle>
                    {data.parts_used.length === 0 ? (
                        <EmptyState label="No parts recorded today" />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                                        <th className="text-left pb-2 pr-3">Part</th>
                                        <th className="text-right pb-2 pr-3">Qty</th>
                                        <th className="text-right pb-2">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                    {data.parts_used.map((p, idx) => (
                                        <tr key={idx}>
                                            <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">{p.item_name}</td>
                                            <td className="py-2 pr-3 text-right text-gray-600 dark:text-gray-400">{p.total_qty}</td>
                                            <td className="py-2 text-right font-medium text-gray-800 dark:text-gray-200">
                                                ${fmt(p.total_amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-gray-200 dark:border-gray-600">
                                        <td className="pt-2 pr-3 text-sm font-bold text-gray-700 dark:text-gray-300">Total</td>
                                        <td className="pt-2 pr-3 text-right text-sm font-bold text-gray-800 dark:text-gray-200">
                                            {data.parts_used.reduce((s, p) => s + p.total_qty, 0)}
                                        </td>
                                        <td className="pt-2 text-right text-sm font-bold text-gray-800 dark:text-gray-200">
                                            ${fmt(data.parts_used.reduce((s, p) => s + p.total_amount, 0))}
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

export default RepairSummaryReport;
