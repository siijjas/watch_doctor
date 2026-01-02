import React, { useState, useMemo } from 'react';
import type { RepairOrder } from '../types';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';
import { Badge } from './ui/Badge';

interface RepairOrderListProps {
  orders: RepairOrder[];
  onSelectOrder: (order: RepairOrder) => void;
  initialFilter?: string;
  initialSearch?: string;
}

const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Awaiting Parts', 'Repaired', 'Delivered', 'Cancelled'];

const RepairOrderList: React.FC<RepairOrderListProps> = ({ orders, onSelectOrder, initialFilter, initialSearch }) => {
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'All');

  // Update filter/search when props change
  React.useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);

  // Filter orders based on search and status
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Status filter
      if (statusFilter !== 'All' && order.status !== statusFilter) {
        return false;
      }

      // Search filter (order ID, customer name, technician, issue)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = order.name?.toLowerCase().includes(query);
        const matchesCustomer = (order.customer_name || order.customer || '').toLowerCase().includes(query);

        // Search in items for technician or issues
        const matchesTechnician = order.items?.some(item =>
          (item.technician || '').toLowerCase().includes(query)
        );
        const matchesIssue = order.items?.some(item =>
          (item.issue_description || '').toLowerCase().includes(query) ||
          item.issues?.some(i => i.issue.toLowerCase().includes(query))
        );

        if (!matchesId && !matchesCustomer && !matchesTechnician && !matchesIssue) {
          return false;
        }
      }

      return true;
    });
  }, [orders, searchQuery, statusFilter]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">All Repair Orders</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {filteredOrders.length} of {orders.length} orders
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by Order ID or Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[180px]"
        >
          {STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Order ID</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Received Date</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Priority</th>

                <th scope="col" className="relative px-6 py-4">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-gray-400">
                      <svg className="mx-auto h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <p className="text-lg font-medium">No orders found</p>
                      <p className="text-sm mt-1">Try adjusting your search or filter</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={() => onSelectOrder(order)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{order.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{order.customer_name || order.customer}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{order.received_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={`${STATUS_COLORS[order.status]} px-3 py-1`}>{order.status}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={`${PRIORITY_COLORS[order.priority]} px-3 py-1`}>{order.priority}</Badge>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectOrder(order); }}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RepairOrderList;
