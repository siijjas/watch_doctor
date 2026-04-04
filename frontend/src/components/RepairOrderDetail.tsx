import React, { useState, useEffect } from 'react';
import type { RepairOrder, RepairItem, RepairPartUsed, RepairTask, Employee, Item, RepairTaskTemplate, WatchModel, IssueTemplate } from '../types';
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
import { ViewQuotationModal } from './ViewQuotationModal';
import { ViewInvoiceModal } from './ViewInvoiceModal';
import { AddIssueModal } from './AddIssueModal';
import { AddTaskModal } from './AddTaskModal';
import { useAppConfig } from '../context/AppConfigContext';

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
  issueTemplates: IssueTemplate[];
  watchModels: WatchModel[];
  onAddPart: (itemIndex: number, taskIndex: number) => void;
  onChangeTaskStatus: (itemIndex: number, taskIndex: number) => void;
  onUpdatePrices: (itemIndex: number) => void;
  onAssignTechnician: (itemIndex: number) => void;
  onAddIssue: (itemIndex: number) => void;
  onAddTask: (itemIndex: number) => void;
  defaultExpanded?: boolean;
}> = ({ item, itemIndex, employees, allItems, taskTemplates, issueTemplates, watchModels, onAddPart, onChangeTaskStatus, onUpdatePrices, onAssignTechnician, onAddIssue, onAddTask, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { formatCurrency } = useAppConfig();
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
    <div className="mb-4 bg-white rounded-2xl shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md" style={{ border: '1px solid #F0EEEB' }}>
      {/* Card Header - Always visible */}
      <div
        className="p-3 sm:p-5 cursor-pointer flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Watch Icon */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#648DDA' }}>
            <span className="text-white text-lg sm:text-xl">⌚</span>
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-xl text-gray-900">
              {item.watch_brand} {watchModel?.model_name || item.watch_model}
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
              S/N: {item.serial_number || 'N/A'}
            </p>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-2 sm:space-x-3 pl-13 sm:pl-0">
          {/* Task Progress Pill */}
          {taskCount > 0 && (
            <span className="text-xs px-3 py-1 rounded-full text-gray-600" style={{ backgroundColor: '#F3EFEA' }}>
              {completedTasks}/{taskCount} tasks
            </span>
          )}
          {/* Cost Badge */}
          <span className="font-bold text-green-600">
            {formatCurrency(totalCost)}
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
        <div className="px-3 pb-3 sm:px-5 sm:pb-5 border-t" style={{ borderColor: '#F0EEEB' }}>
          {/* Technician Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 border-b" style={{ borderColor: '#F0EEEB' }}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                technician
                  ? 'bg-indigo-100'
                  : 'bg-amber-100'
              }`}>
                <span className="text-lg">{technician ? '👤' : '❓'}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Technician</p>
                <p className={`font-semibold text-base ${
                  technician
                    ? 'text-gray-900'
                    : 'text-amber-600'
                }`}>
                  {technician?.employee_name || 'Not Assigned'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={technician ? 'outline' : 'primary'}
                size="sm"
                onClick={(e) => { e.stopPropagation(); onAssignTechnician(itemIndex); }}
                className="text-xs"
              >
                👤 {technician ? 'Change Tech' : 'Assign Tech'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onUpdatePrices(itemIndex); }}
                className="text-xs"
              >
                💰 Update Prices
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 pt-4">
            {/* Left Column: Issues */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Issues</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onAddIssue(itemIndex); }}
                  className="text-xs h-7 px-2"
                >
                  ➕ Add Issue
                </Button>
              </div>
              {(item.issues || []).length > 0 ? (
                <div className="space-y-2">
                  {(item.issues || []).map((issue, idx) => {
                    const template = issueTemplates.find(t => t.name === issue.issue);
                    return (
                      <div key={idx} className="flex items-center p-3 rounded-lg border bg-orange-50 border-orange-100 min-h-[3.5rem]">
                        <span className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center text-sm text-orange-700 mr-3 shrink-0 font-bold">
                          !
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {template?.issue_name || issue.issue}
                          {issue.is_other && issue.other_description && (
                            <span className="block text-xs font-normal text-gray-500 mt-0.5">{issue.other_description}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAddIssue(itemIndex); }}
                  className="w-full text-sm text-amber-500 italic border-2 border-dashed border-amber-200 rounded-lg py-3 hover:bg-amber-50 transition-colors"
                >
                  No issues reported — click to add
                </button>
              )}
              {item.issue_description && (
                <p className="text-sm text-gray-600 mt-3 p-3 bg-gray-50 rounded-lg">
                  {item.issue_description}
                </p>
              )}
            </div>

            {/* Right Column: Tasks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Repair Tasks</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onAddTask(itemIndex); }}
                  className="text-xs h-7 px-2"
                >
                  ➕ Add Task
                </Button>
              </div>
              {(item.tasks || []).length > 0 ? (
                <div className="space-y-2">
                  {(item.tasks || []).map((task, taskIdx) => {
                    const template = taskTemplates.find(t => t.name === task.service);
                    const isCompleted = task.status === 'Completed';
                    return (
                      <div
                        key={task.name || taskIdx}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-2 ${isCompleted ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isCompleted ? 'bg-green-500 text-white' : 'bg-gray-300'}`}>
                            {isCompleted ? '✓' : ''}
                          </span>
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {template?.task_name || task.service}
                            </span>
                            <span className="ml-2 text-xs px-2 py-0.5 bg-gray-200 rounded">
                              {task.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className="font-medium text-green-600">
                            {formatCurrency(task.rate || template?.default_rate || 0)}
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
            <div className="mt-6 pt-4 border-t" style={{ borderColor: '#F0EEEB' }}>
              <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Parts Used</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(item.parts_used || []).map((part, idx) => {
                  const sparePart = allItems.find(i => i.name === part.part);
                  return (
                    <div key={part.name || idx} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700">
                        {sparePart?.item_name || part.part} <span className="text-gray-400">×{part.quantity}</span>
                      </span>
                      <span className="font-medium text-green-600">
                        {formatCurrency((part.rate || sparePart?.standard_rate || 0) * part.quantity)}
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
  const { formatCurrency } = useAppConfig();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<RepairTaskTemplate[]>([]);
  const [issueTemplates, setIssueTemplates] = useState<IssueTemplate[]>([]);
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

  const [addIssueModal, setAddIssueModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [addTaskModal, setAddTaskModal] = useState<{
    isOpen: boolean;
    watchIndex: number | null;
  }>({ isOpen: false, watchIndex: null });

  const [createQuotationModal, setCreateQuotationModal] = useState(false);
  const [viewQuotationModal, setViewQuotationModal] = useState(false);
  const [viewInvoiceModal, setViewInvoiceModal] = useState(false);
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

  const handleAddIssue = async (watchIndex: number, selectedIssueNames: string[]) => {
    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    const currentIssues = updatedOrder.items[watchIndex].issues || [];
    const existingNames = new Set(currentIssues.map((i: any) => i.issue));

    const newIssues = selectedIssueNames
      .filter(n => !existingNames.has(n))
      .map(n => ({ issue: n, is_other: false, other_description: '' }));

    updatedOrder.items[watchIndex].issues = [...currentIssues, ...newIssues];

    // Auto-add suggested tasks for newly added issues
    const currentTasks = updatedOrder.items[watchIndex].tasks || [];
    const existingServices = new Set(currentTasks.map((t: any) => t.service));
    const tasksToAdd: any[] = [];

    for (const issueName of selectedIssueNames.filter(n => !existingNames.has(n))) {
      const template = issueTemplates.find(t => t.name === issueName);
      if (template?.suggested_task && !existingServices.has(template.suggested_task)) {
        tasksToAdd.push({
          service: template.suggested_task,
          technician: updatedOrder.items[watchIndex].technician || '',
          notes: '',
          status: 'Pending',
        });
        existingServices.add(template.suggested_task); // prevent duplicates if two issues share a task
      }
    }

    if (tasksToAdd.length > 0) {
      updatedOrder.items[watchIndex].tasks = [...currentTasks, ...tasksToAdd];
    }

    await apiService.saveRepairOrder(updatedOrder);
    if (onRefresh) await onRefresh(order.name);
  };

  const handleAddTask = async (watchIndex: number, selectedTaskNames: string[]) => {
    if (!taskTemplates.length || selectedTaskNames.length === 0) {
      return;
    }

    const updatedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
    const item = updatedOrder.items[watchIndex];
    if (!item.tasks) item.tasks = [];

    const existingServices = new Set((item.tasks || []).map(t => t.service));
    for (const taskName of selectedTaskNames) {
      if (existingServices.has(taskName)) continue;
      item.tasks.push({
        service: taskName,
        technician: item.technician || '',
        notes: '',
        status: TaskStatus.Pending,
      });
      existingServices.add(taskName);
    }

    await apiService.saveRepairOrder(updatedOrder);
    if (onRefresh) await onRefresh(order.name);
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
        const [emps, templates, models, issues] = await Promise.all([
          apiService.getEmployees(),
          apiService.getTaskTemplates(),
          apiService.getWatchModels(''), // Fetch all models
          apiService.getIssueTemplates(),
        ]);
        setEmployees(emps);
        setTaskTemplates(templates);
        setWatchModels(models);
        setIssueTemplates(issues);

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
        <div className="animate-spin rounded-full h-12 w-12" style={{ borderTop: '3px solid #8B7E74', borderBottom: '3px solid #8B7E74', borderLeft: '3px solid transparent', borderRight: '3px solid transparent' }}></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-0">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" onClick={onBack} className="flex items-center text-slate-700 hover:bg-stone-100">
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to List
          </Button>
          <Button
            variant="outline"
            onClick={() => onRefresh?.(order.name)}
            className="flex items-center"
            style={{ borderColor: '#E8E8E8' }}
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
              onClick: () => setViewQuotationModal(true),
              hidden: !order.quotation,
            },
            {
              label: 'View Invoice',
              icon: '🧾',
              onClick: () => setViewInvoiceModal(true),
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
      <div className="mb-4 sm:mb-6 bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid #F0EEEB' }}>
        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{order.name}</h1>
              <p className="text-gray-500">Watch Repair Order</p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {order.docstatus === 0 && (
                <Badge className="bg-gray-200 text-gray-700">Draft</Badge>
              )}
              {order.docstatus === 1 && (
                <Badge className="bg-green-100 text-green-700">Submitted</Badge>
              )}
              {order.docstatus === 2 && (
                <Badge className="bg-red-100 text-red-700">Cancelled</Badge>
              )}
              <Badge className={`${STATUS_COLORS[order.status]} px-4 py-1 text-sm`}>{order.status}</Badge>
              <Badge className={`${PRIORITY_COLORS[order.priority]} px-3 py-1 text-xs`}>{order.priority}</Badge>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-4 sm:mt-6">
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E8EEF9' }}>
                  <UserIcon className="h-5 w-5" style={{ color: '#648DDA' }} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Customer</p>
                  <p className="font-semibold text-gray-900">{order.customer_name || order.customer}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#E9F7EE' }}>
                  <CalendarIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Received</p>
                  <p className="font-semibold text-gray-900">{order.received_date}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl" style={{ border: '1px solid #F3EFEA' }}>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#FBEFDF' }}>
                  <ClockIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Promised Delivery</p>
                  <p className="font-semibold text-gray-900">{order.promised_delivery_date}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Summary */}
      {(order.quotation || order.sales_invoice) && (
        <div className="mb-4 sm:mb-6 bg-white rounded-2xl shadow-sm p-4 sm:p-6" style={{ border: '1px solid #F0EEEB' }}>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-4">Billing Summary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {order.quotation && (
              <>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#F6F1FA' }}>
                  <p className="text-xs text-purple-600 uppercase tracking-wide mb-1">Quotation Type</p>
                  <p className="text-xl font-bold text-purple-700">{order.quotation_type || 'N/A'}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#EAF6EE' }}>
                  <p className="text-xs text-green-600 uppercase tracking-wide mb-1">Quotation Amount</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(order.quotation_amount || 0)}</p>
                </div>
              </>
            )}
            {order.sales_invoice && (
              <>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#EAF0FA' }}>
                  <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">Paid Amount</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(order.paid_amount || 0)}</p>
                </div>
                <div className="p-4 rounded-xl" style={{ backgroundColor: '#FBF2E8' }}>
                  <p className="text-xs text-orange-600 uppercase tracking-wide mb-1">Balance Due</p>
                  <p className="text-xl font-bold text-orange-700">{formatCurrency(order.balance_amount || 0)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <h3 className="text-xl font-bold text-gray-800 mb-4">Watches in this Order ({order.items?.length || 0})</h3>
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
          onAddIssue={(itemIndex) => setAddIssueModal({ isOpen: true, watchIndex: itemIndex })}
          onAddTask={(itemIndex) => setAddTaskModal({ isOpen: true, watchIndex: itemIndex })}
          issueTemplates={issueTemplates}
          defaultExpanded={idx === 0}
        />
      ))}

      {/* Total Order Summary */}
      <div className="mt-4 sm:mt-6 p-4 sm:p-6 bg-white rounded-2xl shadow-sm" style={{ border: '1px solid #F0EEEB' }}>
        <div className="flex justify-between items-center">
          <span className="text-base sm:text-lg font-semibold text-gray-700">Total Estimated Cost</span>
          <span className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(totalOrderCost)}</span>
        </div>
      </div>

      {/* Modals */}
      {addPartModal.isOpen && addPartModal.watchIndex !== null && addPartModal.taskIndex !== null && (
        <AddPartModal
          isOpen={addPartModal.isOpen}
          onClose={() => setAddPartModal({ isOpen: false, watchIndex: null, taskIndex: null })}
          onSave={async (part, markCompleted) => {
            await handleAddPart(addPartModal.watchIndex!, addPartModal.taskIndex!, part, markCompleted);
            setAddPartModal({ isOpen: false, watchIndex: null, taskIndex: null });
          }}
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

      {/* Add Issue Modal */}
      {addIssueModal.isOpen && addIssueModal.watchIndex !== null && (() => {
        const watchIndex = addIssueModal.watchIndex;
        const currentIssueNames = new Set((order.items[watchIndex]?.issues || []).map((i: any) => i.issue));
        return (
          <AddIssueModal
            isOpen={addIssueModal.isOpen}
            onClose={() => setAddIssueModal({ isOpen: false, watchIndex: null })}
            issueTemplates={issueTemplates}
            taskTemplates={taskTemplates}
            currentIssueNames={currentIssueNames}
            onSave={async (selected) => {
              await handleAddIssue(watchIndex, selected);
              setAddIssueModal({ isOpen: false, watchIndex: null });
            }}
          />
        );
      })()}

      {/* Add Task Modal */}
      {addTaskModal.isOpen && addTaskModal.watchIndex !== null && (() => {
        const watchIndex = addTaskModal.watchIndex;
        const currentTaskServiceNames = new Set((order.items[watchIndex]?.tasks || []).map((t: any) => t.service));
        return (
          <AddTaskModal
            isOpen={addTaskModal.isOpen}
            onClose={() => setAddTaskModal({ isOpen: false, watchIndex: null })}
            taskTemplates={taskTemplates}
            currentTaskServiceNames={currentTaskServiceNames}
            onSave={async (selected) => {
              await handleAddTask(watchIndex, selected);
              setAddTaskModal({ isOpen: false, watchIndex: null });
            }}
          />
        );
      })()}

      {/* View Quotation Modal */}
      {order.quotation && (
        <ViewQuotationModal
          isOpen={viewQuotationModal}
          onClose={() => setViewQuotationModal(false)}
          quotationName={order.quotation}
          onUpdated={() => onRefresh?.(order.name)}
        />
      )}

      {/* View Invoice Modal */}
      {order.sales_invoice && (
        <ViewInvoiceModal
          isOpen={viewInvoiceModal}
          onClose={() => setViewInvoiceModal(false)}
          invoiceName={order.sales_invoice}
          onUpdated={() => onRefresh?.(order.name)}
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
