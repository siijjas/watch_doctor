import { OrderStatus, Priority, WatchStatus, TaskStatus } from './types';

export const ORDER_STATUS_OPTIONS = Object.values(OrderStatus);
export const PRIORITY_OPTIONS = Object.values(Priority);
export const WATCH_STATUS_OPTIONS = Object.values(WatchStatus);
export const TASK_STATUS_OPTIONS = Object.values(TaskStatus);

// FIX: Refactored to use explicit string keys. This prevents errors from different enums
// having the same string value (e.g., OrderStatus.Pending and WatchStatus.Pending both
// resolve to 'Pending'), which would create an invalid object literal.
export const STATUS_COLORS: { [key: string]: string } = {
  'Pending': 'bg-gray-200 text-gray-800',
  'Under Diagnosis': 'bg-amber-100 text-amber-800',
  'Diagnosed': 'bg-cyan-100 text-cyan-800',
  'Create Estimate': 'bg-orange-100 text-orange-800',
  'Quoted': 'bg-indigo-100 text-indigo-800',
  'In Progress': 'bg-blue-200 text-blue-800',
  'In Repair': 'bg-blue-200 text-blue-800', // Same as In Progress, but explicit
  'Awaiting Parts': 'bg-yellow-200 text-yellow-800',
  'Repaired': 'bg-green-200 text-green-800',
  'Delivered': 'bg-purple-200 text-purple-800',
  'On Hold': 'bg-red-200 text-red-800',
  'Completed': 'bg-green-200 text-green-800',
  'Not Repairable': 'bg-rose-100 text-rose-800',
  'Declined': 'bg-stone-200 text-stone-800',
};

export const PRIORITY_COLORS: { [key in Priority]: string } = {
    [Priority.Normal]: 'bg-gray-200 text-gray-800',
    [Priority.Urgent]: 'bg-orange-200 text-orange-800',
    [Priority.VIP]: 'bg-pink-200 text-pink-800',
};
