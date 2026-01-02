import React, { useState, useEffect } from 'react';
import type { RepairOrder, RepairItem, RepairPartUsed, RepairTask, Employee, Item, RepairTaskTemplate, WatchModel } from '../types';
import { TaskStatus } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { mockEmployees, mockItems, mockTaskTemplates } from '../services/mockData';
import { STATUS_COLORS, PRIORITY_COLORS } from '../constants';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { PencilIcon } from './icons/PencilIcon';
import { TrashIcon } from './icons/TrashIcon';
import { UserIcon } from './icons/UserIcon';
import { CalendarIcon } from './icons/CalendarIcon';
import { ClockIcon } from './icons/ClockIcon';
import { PlusIcon } from './icons/PlusIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { AddPartModal } from './AddPartModal';
import { ChangeTaskStatusModal } from './ChangeTaskStatusModal';
import { UpdatePriceModal } from './UpdatePriceModal';
import { CreateQuotationModal } from './CreateQuotationModal';
import PaymentModal from './PaymentModal';
import { AssignTechnicianModal } from './AssignTechnicianModal';
import { ActionsDropdown } from './ui/ActionsDropdown';

interface RepairOrderDetailProps {
  order: RepairOrder;
  onBack: () => void;
  onEdit: (order: RepairOrder) => void;
  onDelete: (orderId: string) => void;
  onRefresh?: (orderId: string) => Promise<void>;
}

const WatchCard: React.FC<{
  item: RepairItem;
  itemIndex: number;
  employees: Employee[];
  allItems: Item[];
  taskTemplates: RepairTaskTemplate[];
  watchModels: WatchModel[];
  onAddPart: (itemIndex: number, taskIndex: number) => void;
  onChangeTaskStatus: (itemIndex: number, taskIndex: number) => void;
  onUpdatePrices: (itemIndex: number) => void;
  onAssignTechnician: (itemIndex: number) => void;
  defaultExpanded?: boolean;
}> = ({ item, itemIndex, employees, allItems, taskTemplates, watchModels, onAddPart, onChangeTaskStatus, onUpdatePrices, onAssignTechnician, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const technician = employees.find(e => e.name === item.technician);

  const totalCost = (item.tasks || []).reduce((sum, task) => {
    const template = taskTemplates.find(t => t.name === task.service);
    const effectiveRate = task.rate || template?.default_rate || 0;
    return sum + effectiveRate;
  }, 0) + (item.parts_used || []).reduce((sum, part) => {
    const sparePart = allItems.find(i => i.name === part.part);
    const effectiveRate = part.rate || sparePart?.standard_rate || 0;
    return sum + (effectiveRate * part.quantity);
  }, 0);

  const watchModel = watchModels.find(m => m.name === item.watch_model);
  const taskCount = item.tasks?.length || 0;
  const partCount = item.parts_used?.length || 0;
  const completedTasks = (item.tasks || []).filter(t => t.status === 'Completed').length;

  return (
    <div className="mb-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:shadow-md">
      {/* Card Header - Always visible */}
      <div
        className="p-5 cursor-pointer flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-4">
          {/* Watch Icon */}
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-xl">⌚</span>
          </div>
          <div>
            <h3 className="font-bold text-xl text-gray-900 dark:text-white">
              {item.watch_brand} {watchModel?.model_name || item.watch_model}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              S/N: {item.serial_number || 'N/A'} • {technician?.employee_name || 'Unassigned'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* Task Progress Pill */}
          {taskCount > 0 && (
            <span className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
              {completedTasks}/{taskCount} tasks
            </span>
          )}
          {/* Cost Badge */}
          <span className="font-bold text-green-600 dark:text-green-400">
            ${totalCost.toFixed(2)}
          </span>
          {/* Status Badge */}
          <Badge className={`${STATUS_COLORS[item.status]} px-3 py-1`}>
            {item.status}
          </Badge>
          {/* Expand Icon */}
          <span className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Card Body - Collapsible */}
      {isExpanded && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700">
          {/* Quick Actions Row */}
          <div className="flex gap-2 py-4 border-b border-gray-100 dark:border-gray-700">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onAssignTechnician(itemIndex); }}
              className="text-xs rounded-lg"
            >
              👤 {technician ? 'Change Tech' : 'Assign Tech'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onUpdatePrices(itemIndex); }}
              className="text-xs rounded-lg"
            >
              💰 Update Prices
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
            {/* Left Column: Issues */}
            <div>
              <h4 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Issues</h4>
              {(item.issues || []).length > 0 ? (
                <div className="space-y-2">
                  {(item.issues || []).map((issue, idx) => (
                    <div key={idx} className="flex items-center p-3 rounded-lg border bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800/50 min-h-[3.5rem]">
                      <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center text-xs text-orange-600 dark:text-orange-400 mr-3 shrink-0">
                        !
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {issue.issue}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No issues reported</p>
              )}
              {item.issue_description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  {item.issue_description}
                </p>
              )}
            </div>

            {/* Right Column: Tasks */}
            <div>
              <h4 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Repair Tasks</h4>
              {(item.tasks || []).length > 0 ? (
                <div className="space-y-2">
                  {(item.tasks || []).map((task, taskIdx) => {
                    const template = taskTemplates.find(t => t.name === task.service);
                    const isCompleted = task.status === 'Completed';
                    return (
                      <div
                        key={task.name || taskIdx}
                        className={`flex items-center justify-between p-3 rounded-lg border ${isCompleted ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'}`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-300 dark:bg-gray-600'}`}>
                            {isCompleted ? '✓' : ''}
                          </span>
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {template?.task_name || task.service}
                            </span>
                            <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded">
                              {task.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-green-600 dark:text-green-400">
                            ${(task.rate || template?.default_rate || 0).toFixed(2)}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onAddPart(itemIndex, taskIdx); }}
                            className="text-xs"
                          >
                            +Part
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); onChangeTaskStatus(itemIndex, taskIdx); }}
                            className="text-xs"
                          >
                            Status
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No tasks assigned</p>
              )}
            </div>
          </div>

          {/* Parts Section */}
          {(item.parts_used || []).length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
              <h4 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Parts Used</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(item.parts_used || []).map((part, idx) => {
                  const sparePart = allItems.find(i => i.name === part.part);
                  return (
                    <div key={part.name || idx} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {sparePart?.item_name || part.part} <span className="text-gray-400">×{part.quantity}</span>
                      </span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        ${((part.rate || sparePart?.standard_rate || 0) * part.quantity).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};



const RepairOrderDetail: React.FC<RepairOrderDetailProps> = ({ order, onBack, onEdit, onDelete, onRefresh }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<RepairTaskTemplate[]>([]);
  const [watchModels, setWatchModels] = useState<WatchModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [addPartModal, setAddPartModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
    taskIndex: number | null;
  }>({ isOpen: false, watchIndex: null, taskIndex: null });

  const [changeTaskStatusModal, setChangeTaskStatusModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
    taskIndex: number | null;
  }>({ isOpen: false, watchIndex: null, taskIndex: null });

  const [updatePriceModal, setUpdatePriceModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [assignTechnicianModal, setAssignTechnicianModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [createQuotationModal, setCreateQuotationModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    invoiceName: string;
    invoiceAmount: number;
  }>({ isOpen: false, invoiceName: '', invoiceAmount: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handlers
  const handleAddPart = async (watchIndex: number, initialTaskIndex: number | null, part: RepairPartUsed, markTaskCompleted: boolean = false) => {
    // Deep clone to avoid mutating props
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;

    if (!updatedOrder.items[watchIndex].parts_used) {
      updatedOrder.items[watchIndex].parts_used = [];
    }

    updatedOrder.items[watchIndex].parts_used.push(part);

    // Update Task Status Logic
    // Use the task ID selected in the part to find the correct task, 
    // falling back to initialTaskIndex only if necessary (though part.task should stay synced)
    if (part.task) {
      const taskToUpdateIndex = updatedOrder.items[watchIndex].tasks.findIndex(t => t.name === part.task);

      if (taskToUpdateIndex !== -1) {
        const task = updatedOrder.items[watchIndex].tasks[taskToUpdateIndex];
        if (markTaskCompleted) {
          task.status = TaskStatus.Completed;
        } else if (task.status === TaskStatus.Pending) {
          task.status = TaskStatus.InProgress;
        }
      }
    }

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleChangeTaskStatus = async (watchIndex: number, taskIndex: number, status: TaskStatus) => {
    const updatedOrder = { ...order };
    updatedOrder.items[watchIndex].tasks[taskIndex].status = status;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleUpdatePrices = async (watchIndex: number, updatedTasks: RepairTask[], updatedParts: RepairPartUsed[]) => {
    const updatedOrder = { ...order };
    updatedOrder.items[watchIndex].tasks = updatedTasks;
    updatedOrder.items[watchIndex].parts_used = updatedParts;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleAssignTechnician = async (watchIndex: number, technicianId: string) => {
    const updatedOrder = { ...order };
    updatedOrder.items[watchIndex].technician = technicianId;

    // Save to backend
    await apiService.saveRepairOrder(updatedOrder);

    // Refresh order data without leaving the page
    if (onRefresh) {
      await onRefresh(order.name);
    }
  };

  const handleCreateQuotation = async (quotationType: 'Estimate' | 'Final', watchIndices?: number[]) => {
    try {
      await apiService.createQuotation(order.name, quotationType, watchIndices);
      // Refresh order to get updated quotation link
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error) {
      throw error;
    }
  };

  const handleCreateInvoice = async (sourceType: 'quotation' | 'order', paymentType: 'full' | 'advance' | 'balance', amount?: number) => {
    try {
      const result = await apiService.createInvoice(order.name, sourceType, paymentType, amount);
      // Refresh order to get updated invoice link
      if (onRefresh) {
        await onRefresh(order.name);
      }
      // Open PaymentModal after invoice is created
      if (result && result.invoice_name) {
        setPaymentModal({
          isOpen: true,
          invoiceName: result.invoice_name,
          invoiceAmount: result.invoice_amount || order.quotation_amount || 0
        });
      }
    } catch (error) {
      alert(`Failed to create invoice: ${error}`);
    }
  };

  const handleSubmit = async () => {
    if (!confirm('Submit this repair order? This will mark it as Delivered and make it read-only.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.submitRepairOrder(order.name);
      alert('Repair order submitted successfully!');
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error: any) {
      alert(`Failed to submit: ${error.message || error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel this repair order? This action cannot be undone.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.cancelRepairOrder(order.name);
      alert('Repair order cancelled.');
      if (onRefresh) {
        await onRefresh(order.name);
      }
    } catch (error: any) {
      alert(`Failed to cancel: ${error.message || error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      if (isErpNext) {
        const [emps, templates, models] = await Promise.all([
          apiService.getEmployees(),
          apiService.getTaskTemplates(),
          apiService.getWatchModels('') // Fetch all models
        ]);
        setEmployees(emps);
        setTaskTemplates(templates);
        setWatchModels(models);

        // Load specific items used in parts
        const partIds = Array.from(new Set(
          order.items?.flatMap(item =>
            item.parts_used?.map(p => p.part) || []
          ).filter(Boolean) || []
        ));

        if (partIds.length > 0) {
          const items = await apiService.getItemsByIds(partIds);
          setAllItems(items);
        } else {
          setAllItems([]);
        }
      } else {
        setEmployees(mockEmployees);
        setAllItems(mockItems);
        setTaskTemplates(mockTaskTemplates);
      }
      setIsLoading(false);
    };
    fetchData();
  }, [order]);


  const totalOrderCost = (order.items || []).reduce((total, item) => {
    const itemCost = (item.tasks || []).reduce((sum, task) => {
      const template = taskTemplates.find(t => t.name === task.service);
      const effectiveRate = task.rate || template?.default_rate || 0;
      return sum + effectiveRate;
    }, 0) + (item.parts_used || []).reduce((sum, p) => {
      const part = allItems.find(i => i.name === p.part);
      const effectiveRate = p.rate || part?.standard_rate || 0;
      return sum + (effectiveRate * p.quantity);
    }, 0);
    return total + itemCost;
  }, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to List
          </Button>
          <Button
            variant="outline"
            onClick={() => onRefresh?.(order.name)}
            className="flex items-center"
            title="Refresh order data"
          >
            <RefreshIcon className="h-4 w-4" />
          </Button>
        </div>
        <ActionsDropdown
          items={[
            // Create actions
            {
              label: 'Create Quotation',
              icon: '📝',
              onClick: () => setCreateQuotationModal(true),
              hidden: !(order.docstatus === 0 && ['Pending', 'In Progress', 'Repaired'].includes(order.status)),
            },
            {
              label: 'Create Invoice',
              icon: '💰',
              onClick: () => handleCreateInvoice('quotation', 'full', order.quotation_amount),
              hidden: !(order.docstatus === 0 && order.status === 'Repaired' && order.quotation && !order.sales_invoice),
            },
            // View actions
            {
              label: 'View Quotation',
              icon: '👁️',
              onClick: () => window.location.href = `/app/quotation/${order.quotation}`,
              hidden: !order.quotation,
            },
            {
              label: 'View Invoice',
              icon: '🧾',
              onClick: () => window.location.href = `/app/sales-invoice/${order.sales_invoice}`,
              hidden: !order.sales_invoice,
            },
            // Edit action (only for draft)
            {
              label: 'Edit Order',
              icon: '✏️',
              onClick: () => onEdit(order),
              hidden: order.docstatus !== 0,
            },
          ]}
        />
      </div>

      {/* Order Info Card */}
      <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">{order.name}</h1>
              <p className="text-gray-500 dark:text-gray-400">Watch Repair Order</p>
            </div>
            <div className="flex items-center space-x-2">
              {order.docstatus === 0 && (
                <Badge className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Draft</Badge>
              )}
              {order.docstatus === 1 && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Submitted</Badge>
              )}
              {order.docstatus === 2 && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Cancelled</Badge>
              )}
              <Badge className={`${STATUS_COLORS[order.status]} px-4 py-1 text-sm`}>{order.status}</Badge>
              <Badge className={`${PRIORITY_COLORS[order.priority]} px-3 py-1 text-xs`}>{order.priority}</Badge>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                  <UserIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Customer</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{order.customer_name || order.customer}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Received</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{order.received_date}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex items-center justify-center">
                  <ClockIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Promised Delivery</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{order.promised_delivery_date}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Summary */}
      {(order.quotation || order.sales_invoice) && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">💳 Billing Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {order.quotation && (
              <>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Quotation Type</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{order.quotation_type || 'N/A'}</p>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Quotation Amount</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">${(order.quotation_amount || 0).toFixed(2)}</p>
                </div>
              </>
            )}
            {order.sales_invoice && (
              <>
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Paid Amount</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">${(order.paid_amount || 0).toFixed(2)}</p>
                </div>
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                  <p className="text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wide mb-1">Balance Due</p>
                  <p className="text-xl font-bold text-orange-700 dark:text-orange-300">${(order.balance_amount || 0).toFixed(2)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Watches in this Order ({order.items?.length || 0})</h3>
      {(order.items || []).map((item, idx) => (
        <WatchCard
          key={item.name || idx}
          item={item}
          itemIndex={idx}
          employees={employees}
          allItems={allItems}
          taskTemplates={taskTemplates}
          watchModels={watchModels}
          onAddPart={(itemIndex, taskIndex) => setAddPartModal({ isOpen: true, watchIndex: itemIndex, taskIndex })}
          onChangeTaskStatus={(itemIndex, taskIndex) => setChangeTaskStatusModal({ isOpen: true, watchIndex: itemIndex, taskIndex })}
          onUpdatePrices={(itemIndex) => setUpdatePriceModal({ isOpen: true, watchIndex: itemIndex })}
          onAssignTechnician={(itemIndex) => setAssignTechnicianModal({ isOpen: true, watchIndex: itemIndex })}
          defaultExpanded={idx === 0}
        />
      ))}

      {/* Total Order Summary */}
      <div className="mt-6 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-700 dark:text-gray-300">Total Estimated Cost</span>
          <span className="text-3xl font-bold text-green-600 dark:text-green-400">${totalOrderCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Modals */}
      {addPartModal.isOpen && addPartModal.watchIndex !== null && addPartModal.taskIndex !== null && (
        <AddPartModal
          isOpen={addPartModal.isOpen}
          onClose={() => setAddPartModal({ isOpen: false, watchIndex: null, taskIndex: null })}
          onSave={(part, markCompleted) => handleAddPart(addPartModal.watchIndex!, addPartModal.taskIndex!, part, markCompleted)}
          watchItem={order.items[addPartModal.watchIndex]}
          allItems={allItems}
          taskTemplates={taskTemplates}
          initialTask={order.items[addPartModal.watchIndex].tasks[addPartModal.taskIndex].name || `task_${addPartModal.taskIndex}`}
        />
      )}

      {changeTaskStatusModal.isOpen && changeTaskStatusModal.watchIndex !== null && changeTaskStatusModal.taskIndex !== null && (
        <ChangeTaskStatusModal
          isOpen={changeTaskStatusModal.isOpen}
          onClose={() => setChangeTaskStatusModal({ isOpen: false, watchIndex: null, taskIndex: null })}
          onSave={(status) => handleChangeTaskStatus(changeTaskStatusModal.watchIndex!, changeTaskStatusModal.taskIndex!, status)}
          currentStatus={order.items[changeTaskStatusModal.watchIndex].tasks[changeTaskStatusModal.taskIndex].status}
          taskName={taskTemplates.find(t => t.name === order.items[changeTaskStatusModal.watchIndex!].tasks[changeTaskStatusModal.taskIndex!].service)?.task_name || order.items[changeTaskStatusModal.watchIndex!].tasks[changeTaskStatusModal.taskIndex!].service}
        />
      )}

      {updatePriceModal.isOpen && updatePriceModal.watchIndex !== null && (
        <UpdatePriceModal
          isOpen={updatePriceModal.isOpen}
          onClose={() => setUpdatePriceModal({ isOpen: false, watchIndex: null })}
          onSave={(updatedTasks, updatedParts) => handleUpdatePrices(updatePriceModal.watchIndex!, updatedTasks, updatedParts)}
          watchItem={order.items[updatePriceModal.watchIndex]}
          taskTemplates={taskTemplates}
          allItems={allItems}
        />
      )}

      {/* Create Quotation Modal */}
      {createQuotationModal && (
        <CreateQuotationModal
          isOpen={createQuotationModal}
          onClose={() => setCreateQuotationModal(false)}
          onSave={handleCreateQuotation}
          order={order}
          taskTemplates={taskTemplates}
          allItems={allItems}
        />
      )}

      {/* Assign Technician Modal */}
      {assignTechnicianModal.isOpen && assignTechnicianModal.watchIndex !== null && (
        <AssignTechnicianModal
          isOpen={assignTechnicianModal.isOpen}
          onClose={() => setAssignTechnicianModal({ isOpen: false, watchIndex: null })}
          onSave={(technicianId) => handleAssignTechnician(assignTechnicianModal.watchIndex!, technicianId)}
          currentTechnician={order.items[assignTechnicianModal.watchIndex].technician}
          employees={employees}
          watchItem={order.items[assignTechnicianModal.watchIndex]}
        />
      )}

      {/* Payment Modal */}
      <PaymentModal
        isOpen={paymentModal.isOpen}
        onClose={() => setPaymentModal({ isOpen: false, invoiceName: '', invoiceAmount: 0 })}
        repairOrderName={order.name}
        invoiceName={paymentModal.invoiceName}
        invoiceAmount={paymentModal.invoiceAmount}
        onSuccess={async () => {
          if (onRefresh) {
            await onRefresh(order.name);
          }
        }}
      />
    </div>
  );
};

export default RepairOrderDetail;
