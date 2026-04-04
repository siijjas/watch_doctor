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

const DREELIO_STATUS_STYLES: { [key: string]: string } = {
  'Pending': 'bg-stone-200 text-stone-700',
  'In Progress': 'bg-blue-200 text-blue-700',
  'In Repair': 'bg-blue-200 text-blue-700',
  'Awaiting Parts': 'bg-amber-200 text-amber-700',
  'Repaired': 'bg-emerald-200 text-emerald-700',
  'Delivered': 'bg-violet-200 text-violet-700',
  'On Hold': 'bg-rose-200 text-rose-700',
  'Completed': 'bg-emerald-200 text-emerald-700',
};

const DREELIO_PRIORITY_STYLES: { [key: string]: string } = {
  'Normal': 'bg-stone-200 text-stone-700',
  'Urgent': 'bg-orange-200 text-orange-700',
  'VIP': 'bg-pink-200 text-pink-700',
};

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
      <div className="mb-4 sm:mb-6">
        <h1 className="text-2xl sm:text-[46px] leading-tight font-bold text-slate-900">All Repair Orders</h1>
        <p className="text-slate-500 text-lg sm:text-[34px] mt-1">
          {filteredOrders.length} of {orders.length} orders
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
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
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-200 shadow-sm"
            style={{ border: '1px solid #E8E8E8' }}
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 rounded-xl bg-white text-gray-900 focus:ring-2 focus:ring-gray-200 shadow-sm min-w-[180px]"
          style={{ border: '1px solid #E8E8E8' }}
        >
          {STATUS_OPTIONS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #F0EEEB' }}>
            <p className="text-slate-400 font-medium">No orders found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order.name}
              className="bg-white rounded-2xl p-4 active:bg-stone-50 transition-colors cursor-pointer"
              style={{ border: '1px solid #F0EEEB' }}
              onClick={() => onSelectOrder(order)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: '#6A7288' }}>{order.name}</span>
                <Badge className={`${DREELIO_STATUS_STYLES[order.status] || STATUS_COLORS[order.status]} px-2.5 py-0.5 text-xs font-medium`}>
                  {order.status}
                </Badge>
              </div>
              <p className="text-sm font-medium text-slate-800 mb-1">{order.customer_name || order.customer}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{order.received_date}</span>
                <Badge className={`${DREELIO_PRIORITY_STYLES[order.priority] || PRIORITY_COLORS[order.priority]} px-2 py-0.5 text-xs font-medium`}>
                  {order.priority}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #F0EEEB' }}>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead style={{ backgroundColor: '#F6F3EF' }}>
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Order ID</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Received Date</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>

                <th scope="col" className="relative px-6 py-4">
                  <span className="sr-only">View</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="text-slate-400">
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
                  <tr
                    key={order.name}
                    className="hover:bg-stone-50 transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid #F3EFEA' }}
                    onClick={() => onSelectOrder(order)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold transition-colors hover:opacity-90" style={{ color: '#6A7288' }}>{order.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{order.customer_name || order.customer}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{order.received_date}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={`${DREELIO_STATUS_STYLES[order.status] || STATUS_COLORS[order.status]} px-3 py-1 text-xs font-medium`}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={`${DREELIO_PRIORITY_STYLES[order.priority] || PRIORITY_COLORS[order.priority]} px-3 py-1 text-xs font-medium`}>
                        {order.priority}
                      </Badge>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectOrder(order); }}
                        className="font-medium text-sm transition-colors"
                        style={{ color: '#5B8DEF' }}
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
