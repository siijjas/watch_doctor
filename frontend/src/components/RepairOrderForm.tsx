import React, { useState, useEffect, useCallback } from 'react';
import type { RepairOrder, RepairItem, RepairTask, RepairPartUsed, Customer, Employee, Item, RepairTaskTemplate, WatchBrand, WatchModel, IssueTemplate, RepairItemIssue } from '../types';
import { OrderStatus, Priority, WatchStatus, TaskStatus } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { mockCustomers, mockEmployees, mockRepairServices, mockSpareParts } from '../services/mockData';
import { Modal } from './ui/Modal';
import { CreateCustomerModal } from './CreateCustomerModal';
import { CreateBrandModal } from './CreateBrandModal';
import { CreateModelModal } from './CreateModelModal';
import { AddPartModal } from './AddPartModal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { PlusIcon } from './icons/PlusIcon';
import { TrashIcon } from './icons/TrashIcon';
import { Autocomplete } from './ui/Autocomplete';
import { useAppConfig } from '../context/AppConfigContext';

interface RepairOrderFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (order: RepairOrder) => void;
    order?: RepairOrder | null;
}

const toDisplayDate = (isoDate?: string): string => {
    if (!isoDate) return '';
    const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return `${m[3]}/${m[2]}/${m[1]}`;
};

const toIsoDate = (displayDate?: string): string | null => {
    if (!displayDate) return null;
    const value = displayDate.trim();

    const withDash = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (withDash) {
        return `${withDash[3]}-${withDash[2]}-${withDash[1]}`;
    }

    const withSlash = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (withSlash) {
        return `${withSlash[3]}-${withSlash[2]}-${withSlash[1]}`;
    }

    const compact = value.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (compact) {
        return `${compact[3]}-${compact[2]}-${compact[1]}`;
    }

    return null;
};

const newRepairItem = (): Omit<RepairItem, 'name'> => ({
    watch_brand: '',
    watch_model: '',
    serial_number: '',
    issues: [],
    issue_description: '',
    technician: '',
    status: WatchStatus.Pending,
    intake_checklist: { scratches: false, water_resistance: false, missing_parts: false, other_observations: '' },
    tasks: [],
    parts_used: [],
});


export const RepairOrderForm: React.FC<RepairOrderFormProps> = ({ isOpen, onClose, onSave, order }) => {
    const { formatCurrency } = useAppConfig();
    const [formData, setFormData] = useState<RepairOrder | null>(null);
    const [dependencies, setDependencies] = useState<{
        customers: Customer[];
        employees: Employee[];
        services: RepairTaskTemplate[];
        parts: Item[];
        brands: WatchBrand[];
        models: WatchModel[];
        issueTemplates: IssueTemplate[];
    }>({ customers: [], employees: [], services: [], parts: [], brands: [], models: [], issueTemplates: [] });

    // Customer Creation State
    const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
    const [createCustomerQuery, setCreateCustomerQuery] = useState('');

    // Brand/Model Creation State
    const [isCreateBrandOpen, setIsCreateBrandOpen] = useState(false);
    const [createBrandQuery, setCreateBrandQuery] = useState('');
    const [activeBrandIndex, setActiveBrandIndex] = useState<number | null>(null);

    const [isCreateModelOpen, setIsCreateModelOpen] = useState(false);
    const [createModelQuery, setCreateModelQuery] = useState('');
    const [createModelBrand, setCreateModelBrand] = useState('');
    const [activeModelIndex, setActiveModelIndex] = useState<number | null>(null);

    // Add Part Modal State
    const [isAddPartModalOpen, setIsAddPartModalOpen] = useState(false);
    const [activePartItemIndex, setActivePartItemIndex] = useState<number | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);


    const loadDependencies = useCallback(async () => {
        if (isErpNext) {
            const [customers, employees, taskTemplates, brands, issueTemplates] = await Promise.all([
                apiService.getCustomers(),
                apiService.getEmployees(),
                apiService.getTaskTemplates(),
                apiService.getWatchBrands(),
                apiService.getIssueTemplates()
            ]);
            setDependencies({
                customers,
                employees,
                services: taskTemplates,
                parts: [], // Start empty - users must search
                brands,
                models: [], // Models loaded when brand is selected
                issueTemplates
            });
            return;
        }
        // Standalone mode: use mock data so the UI stays usable without ERPNext
        setDependencies({
            customers: mockCustomers,
            employees: mockEmployees,
            services: mockTaskTemplates,
            parts: mockSpareParts,
            brands: [],
            models: [],
            issueTemplates: []
        });
    }, []);



    useEffect(() => {
        if (isOpen) {
            loadDependencies();
            setValidationErrors([]);
        }
    }, [isOpen, loadDependencies]);

    useEffect(() => {
        if (!isOpen) return;

        if (order) {
            const normalizedOrder = JSON.parse(JSON.stringify(order)) as RepairOrder;
            normalizedOrder.received_date = toDisplayDate(normalizedOrder.received_date);
            normalizedOrder.promised_delivery_date = toDisplayDate(normalizedOrder.promised_delivery_date);
            setFormData(normalizedOrder); // Deep copy

            // Pre-load models for existing items
            if (isErpNext) {
                const uniqueBrands = Array.from(new Set(order.items?.map(i => i.watch_brand).filter(Boolean)));
                const brandsPromise = Promise.all(uniqueBrands.map(brand => apiService.getWatchModels(brand || '')));

                // Load parts that are already selected in the order
                const partIds = Array.from(new Set(
                    order.items?.flatMap(item =>
                        item.parts_used?.map(p => p.part) || []
                    ).filter(Boolean) || []
                ));
                const partsPromise = apiService.getItemsByIds(partIds);

                Promise.all([brandsPromise, partsPromise])
                    .then(([modelResults, loadedParts]) => {
                        const allModels = modelResults.flat();
                        setDependencies(prev => ({
                            ...prev,
                            models: allModels,
                            parts: loadedParts // Load only the parts already selected
                        }));
                    });
            }

        } else {
            const newOrder: RepairOrder = {
                name: '', // Will be set by ERPNext on creation
                customer: '',
                contact_person: '',
                status: OrderStatus.Pending,
                received_date: toDisplayDate(new Date().toISOString().split('T')[0]),
                promised_delivery_date: toDisplayDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
                priority: Priority.Normal,
                items: [newRepairItem()],
            };
            setFormData(newOrder);
        }
    }, [order, isOpen]); // Note: dependencies.customers must NOT be here — adding a new customer updates that list and would reset the form

    if (!formData) return null;

    const handleFieldChange = (field: keyof RepairOrder, value: any) => {
        setFormData(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleItemChange = <K extends keyof RepairItem>(itemIndex: number, field: K, value: RepairItem[K]) => {
        const newItems = [...formData.items];
        newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
        setFormData({ ...formData, items: newItems });
    };

    const handleAddItem = () => {
        const newItems = [...formData.items, newRepairItem()];
        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveItem = (itemIndex: number) => {
        const newItems = formData.items.filter((_, index) => index !== itemIndex);
        setFormData({ ...formData, items: newItems });
    };

    const handleTaskChange = (itemIndex: number, taskIndex: number, field: keyof RepairTask, value: any) => {
        const newItems = [...formData.items];
        const newTasks = [...newItems[itemIndex].tasks];
        newTasks[taskIndex] = { ...newTasks[taskIndex], [field]: value };
        newItems[itemIndex].tasks = newTasks;
        setFormData({ ...formData, items: newItems });
    };

    const handleAddTask = (itemIndex: number) => {
        const newItems = [...formData.items];
        const newTask: RepairTask = {
            service: dependencies.services[0]?.name || '',
            technician: newItems[itemIndex].technician,
            notes: '',
            status: TaskStatus.Pending
        };
        if (!newItems[itemIndex].tasks) newItems[itemIndex].tasks = [];
        newItems[itemIndex].tasks.push(newTask);
        setFormData({ ...formData, items: newItems });
    };

    const handleRemoveTask = (itemIndex: number, taskIndex: number) => {
        const newItems = [...formData.items];
        newItems[itemIndex].tasks = newItems[itemIndex].tasks.filter((_, index) => index !== taskIndex);
        setFormData({ ...formData, items: newItems });
    };

    const handlePartChange = (itemIndex: number, partIndex: number, field: keyof RepairPartUsed, value: any) => {
        const newItems = [...formData.items];
        const newParts = [...newItems[itemIndex].parts_used];
        newParts[partIndex] = { ...newParts[partIndex], [field]: value };
        newItems[itemIndex].parts_used = newParts;
        setFormData({ ...formData, items: newItems });
    };

    const handleAddPart = (itemIndex: number) => {
        const newItems = [...formData.items];
        const newPart: RepairPartUsed = {
            part: dependencies.parts[0]?.name || '',
            quantity: 1,
            uom: dependencies.parts[0]?.stock_uom || 'Unit'
        };
        if (!newItems[itemIndex].parts_used) newItems[itemIndex].parts_used = [];
        newItems[itemIndex].parts_used.push(newPart);
        setFormData({ ...formData, items: newItems });
    };

    const handleOpenAddPart = (itemIndex: number) => {
        setActivePartItemIndex(itemIndex);
        setIsAddPartModalOpen(true);
    };

    const handleSavePart = async (part: RepairPartUsed, markTaskCompleted: boolean = false) => {
        if (activePartItemIndex === null) return;

        const newItems = [...formData.items];
        if (!newItems[activePartItemIndex].parts_used) {
            newItems[activePartItemIndex].parts_used = [];
        }

        // Add the part
        newItems[activePartItemIndex].parts_used.push(part);

        // If requested, mark the linked task as completed
        if (part.task) {
            const taskIndex = newItems[activePartItemIndex].tasks.findIndex(t =>
                (t.name && t.name === part.task) || (part.task.startsWith('task_') && part.task === `task_${newItems[activePartItemIndex].tasks.indexOf(t)}`)
            );

            if (taskIndex !== -1) {
                if (markTaskCompleted) {
                    newItems[activePartItemIndex].tasks[taskIndex].status = TaskStatus.Completed;
                } else if (newItems[activePartItemIndex].tasks[taskIndex].status === TaskStatus.Pending) {
                    // Update to In Progress if it was Pending and we just added a part
                    newItems[activePartItemIndex].tasks[taskIndex].status = TaskStatus.InProgress;
                }
            }
        }

        setFormData({ ...formData, items: newItems });
        setIsAddPartModalOpen(false);
    };

    const handleRemovePart = (itemIndex: number, partIndex: number) => {
        const newItems = [...formData.items];
        newItems[itemIndex].parts_used = newItems[itemIndex].parts_used.filter((_, index) => index !== partIndex);
        setFormData({ ...formData, items: newItems });
    };

    const handleIssueToggle = (itemIndex: number, template: IssueTemplate, checked: boolean) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = checked
                ? [...item.issues, { issue: template.name, is_other: false, other_description: '' }]
                : item.issues.filter(i => i.issue !== template.name);

            // Auto-add suggested task if available
            let newTasks = item.tasks;
            if (checked && template.suggested_task) {
                const taskExists = item.tasks.some(t => t.service === template.suggested_task);
                if (!taskExists) {
                    newTasks = [...item.tasks, {
                        service: template.suggested_task,
                        technician: '',
                        notes: '',
                        status: TaskStatus.Pending
                    }];
                }
            } else if (!checked && template.suggested_task) {
                // Remove the suggested task if the issue is unchecked
                newTasks = item.tasks.filter(t => t.service !== template.suggested_task);
            }

            return { ...item, issues: newIssues, tasks: newTasks };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleOtherIssueToggle = (itemIndex: number, checked: boolean) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = checked
                ? [...item.issues, { issue: 'Other', is_other: true, other_description: '' }]
                : item.issues.filter(i => !i.is_other);

            return { ...item, issues: newIssues };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleOtherDescriptionChange = (itemIndex: number, description: string) => {
        const newItems = formData.items.map((item, idx) => {
            if (idx !== itemIndex) return item;

            const newIssues = item.issues.map(issue =>
                issue.is_other ? { ...issue, other_description: description } : issue
            );

            return { ...item, issues: newIssues };
        });

        setFormData({ ...formData, items: newItems });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Check mandatory fields for items
        const missingFields: string[] = [];
        formData.items.forEach((item, idx) => {
            if (!item.watch_brand) missingFields.push(`Row #${idx + 1}: Watch Brand`);
            if (!item.watch_model) missingFields.push(`Row #${idx + 1}: Watch Model`);
        });

        if (missingFields.length > 0) {
            setValidationErrors(missingFields);
            return;
        }

        const receivedDateIso = toIsoDate(formData.received_date);
        const promisedDateIso = toIsoDate(formData.promised_delivery_date);
        if (!receivedDateIso) missingFields.push('Received Date must be in DD/MM/YYYY format');
        if (!promisedDateIso) missingFields.push('Promised Delivery must be in DD/MM/YYYY format');

        if (missingFields.length > 0) {
            setValidationErrors(missingFields);
            return;
        }

        const sanitizedItems = formData.items.map((item) => ({
            ...item,
            issues: (item.issues || []).map((issue) => {
                if (issue.is_other) {
                    return { ...issue, issue: 'Other' };
                }
                return issue;
            })
        }));

        setValidationErrors([]);
        onSave({
            ...formData,
            received_date: receivedDateIso!,
            promised_delivery_date: promisedDateIso!,
            items: sanitizedItems
        });
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={order ? 'Edit Repair Order' : 'New Repair Order'}
                maxWidthClass="max-w-5xl"
            >
                <form onSubmit={handleSubmit} className="space-y-6 pb-24">
                    {validationErrors.length > 0 && (
                        <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#F3D2D2', backgroundColor: '#FFF6F6' }}>
                            <p className="text-sm font-semibold text-red-700 mb-1">Required fields are missing:</p>
                            <ul className="text-sm text-red-700 list-disc ml-5">
                                {validationErrors.map((error) => (
                                    <li key={error}>{error}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <Autocomplete
                                label="Customer"
                                placeholder="Search by name or phone..."
                                options={dependencies.customers.map(c => ({
                                    value: c.name,
                                    label: c.customer_name,
                                    subtitle: c.phone_display || c.name
                                }))}
                                value={formData.customer}
                                onChange={(value) => handleFieldChange('customer', value)}
                                onSearch={async (query) => {
                                    if (isErpNext && query.trim()) {
                                        const results = await apiService.getCustomers(query);
                                        setDependencies(prev => ({ ...prev, customers: results }));
                                    }
                                }}
                                onCreate={(query) => {
                                    setCreateCustomerQuery(query);
                                    setIsCreateCustomerOpen(true);
                                }}
                            />

                        </div>
                        {/* Status field removed (defaults to Pending) */}
                        <Input
                            label="Received Date"
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={formData.received_date}
                            onChange={(e) => handleFieldChange('received_date', e.target.value)}
                        />
                        <Input
                            label="Promised Delivery"
                            type="text"
                            placeholder="DD/MM/YYYY"
                            value={formData.promised_delivery_date}
                            onChange={(e) => handleFieldChange('promised_delivery_date', e.target.value)}
                        />
                        <Select label="Priority" value={formData.priority} onChange={(e) => handleFieldChange('priority', e.target.value as Priority)}>
                            {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                        <Input
                            label="Reference Number"
                            type="text"
                            placeholder="Customer's own reference (optional)"
                            value={formData.reference_number || ''}
                            onChange={(e) => handleFieldChange('reference_number', e.target.value)}
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold pb-2 text-gray-900" style={{ borderBottom: '1px solid #F0EEEB' }}>Repair Items</h3>
                        {formData.items.map((item, itemIndex) => (
                            <div
                                key={item.name || itemIndex}
                                className="p-4 rounded-2xl space-y-4 bg-[#F9F7F4]"
                                style={{ border: '1px solid #F0EEEB' }}
                            >
                                <div className="flex justify-between items-center">
                                    <h4 className="font-semibold text-gray-900">Watch #{itemIndex + 1}</h4>
                                    {formData.items.length > 1 && (
                                        <Button type="button" variant="destructive" size="sm" onClick={() => handleRemoveItem(itemIndex)}>
                                            <TrashIcon className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Autocomplete
                                        label="Brand"
                                        placeholder="Search brand..."
                                        options={dependencies.brands.map(b => ({
                                            value: b.name,
                                            label: b.brand_name,
                                            subtitle: b.description || ''
                                        }))}
                                        value={formData.items[itemIndex]?.watch_brand || ''}
                                        onChange={(value) => {
                                            console.log('Brand selected:', value);
                                            // Update both brand and model in a single state change
                                            const newItems = [...formData.items];
                                            newItems[itemIndex] = {
                                                ...newItems[itemIndex],
                                                watch_brand: value,
                                                watch_model: '' // Clear model when brand changes
                                            };
                                            setFormData({ ...formData, items: newItems });

                                            // Load models for the selected brand (async, non-blocking)
                                            if (isErpNext && value) {
                                                apiService.getWatchModels(value).then(models => {
                                                    setDependencies(prev => ({ ...prev, models }));
                                                });
                                            }
                                        }}
                                        onSearch={async (query) => {
                                            if (!isErpNext) return;
                                            const results = await apiService.getWatchBrands(query);
                                            setDependencies(prev => ({ ...prev, brands: results }));
                                        }}
                                        onCreate={(query) => {
                                            setCreateBrandQuery(query);
                                            setActiveBrandIndex(itemIndex);
                                            setIsCreateBrandOpen(true);
                                        }}
                                    />
                                    <Autocomplete
                                        label="Model"
                                        placeholder={formData.items[itemIndex]?.watch_brand ? "Search model..." : "Select brand first"}
                                        options={dependencies.models
                                            .filter(m => m.brand === formData.items[itemIndex]?.watch_brand)
                                            .map(m => ({
                                                value: m.name,
                                                label: m.model_name,
                                                subtitle: m.description || ''
                                            }))}
                                        value={formData.items[itemIndex]?.watch_model || ''}
                                        onChange={(value) => handleItemChange(itemIndex, 'watch_model', value)}
                                        onSearch={async (query) => {
                                            const brand = formData.items[itemIndex]?.watch_brand;
                                            if (!isErpNext || !brand) return;
                                            const results = await apiService.getWatchModels(brand, query);
                                            setDependencies(prev => ({ ...prev, models: results }));
                                        }}
                                        onCreate={(query) => {
                                            setCreateModelQuery(query);
                                            setCreateModelBrand(formData.items[itemIndex].watch_brand);
                                            setActiveModelIndex(itemIndex);
                                            setIsCreateModelOpen(true);
                                        }}
                                        className={!formData.items[itemIndex]?.watch_brand ? 'opacity-50 pointer-events-none' : ''}
                                    />
                                    <Input label="Serial Number" value={item.serial_number} onChange={e => handleItemChange(itemIndex, 'serial_number', e.target.value)} />
                                </div>
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Complaint</label>
                                    <div className="space-y-2">
                                        {dependencies.issueTemplates.map(template => (
                                            <label key={template.name} className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={item.issues.some(i => i.issue === template.name)}
                                                    onChange={(e) => handleIssueToggle(itemIndex, template, e.target.checked)}
                                                    className="w-4 h-4 rounded border-[#D8D8D8] text-[#648DDA] focus:ring-[#648DDA]"
                                                />
                                                <span className="text-sm text-gray-700">{template.issue_name}</span>

                                            </label>
                                        ))}
                                        <label className="flex items-start space-x-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={item.issues.some(i => i.is_other)}
                                                onChange={(e) => handleOtherIssueToggle(itemIndex, e.target.checked)}
                                                    className="w-4 h-4 mt-1 rounded border-[#D8D8D8] text-[#648DDA] focus:ring-[#648DDA]"
                                            />
                                            <div className="flex-1">
                                                <span className="text-sm text-gray-700">Other (please specify)</span>
                                                {item.issues.some(i => i.is_other) && (
                                                    <textarea
                                                        value={item.issues.find(i => i.is_other)?.other_description || ''}
                                                        onChange={(e) => handleOtherDescriptionChange(itemIndex, e.target.value)}
                                                        rows={2}
                                                        placeholder="Describe the issue..."
                                                        className="mt-2 w-full p-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                                        style={{ borderColor: '#E8E8E8' }}
                                                    />
                                                )}
                                            </div>
                                        </label>
                                    </div>

                                    {/* Issue Description */}
                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Issue Description
                                        </label>
                                        <textarea
                                            value={item.issue_description || ''}
                                            onChange={(e) => handleItemChange(itemIndex, 'issue_description', e.target.value)}
                                            rows={3}
                                            placeholder="Describe the customer's complaint or issue in detail..."
                                            className="w-full p-2 border rounded-md focus:ring-[#648DDA] focus:border-[#648DDA] text-sm bg-white"
                                            style={{ borderColor: '#E8E8E8' }}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Select label="Technician" value={item.technician} onChange={e => handleItemChange(itemIndex, 'technician', e.target.value)}>
                                        <option value="">Unassigned</option>
                                        {dependencies.employees.map(e => <option key={e.name} value={e.name}>{e.employee_name}</option>)}
                                    </Select>
                                    <Select label="Watch Status" value={item.status} onChange={e => handleItemChange(itemIndex, 'status', e.target.value as WatchStatus)}>
                                        {Object.values(WatchStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                    </Select>
                                </div>

                                {/* Tasks */}
                                <div>
                                    <h5 className="font-semibold text-gray-900">Tasks</h5>
                                    {item.tasks.map((task, taskIndex) => {
                                        const selectedService = dependencies.services.find(s => s.name === task.service);
                                        const autoRate = selectedService?.default_rate || 0;
                                        return (
                                            <div key={task.name || taskIndex} className="space-y-2 p-3 border rounded-xl bg-white my-2" style={{ borderColor: '#ECE8E3' }}>
                                                <div className="flex items-center space-x-2">
                                                    <Select value={task.service} onChange={e => {
                                                        handleTaskChange(itemIndex, taskIndex, 'service', e.target.value);
                                                        // Auto-fetch rate when service changes
                                                        const service = dependencies.services.find(s => s.name === e.target.value);
                                                        if (service?.default_rate) {
                                                            handleTaskChange(itemIndex, taskIndex, 'auto_rate', service.default_rate);
                                                        }
                                                    }} className="flex-grow">
                                                        {dependencies.services.map(s => <option key={s.name} value={s.name}>{s.task_name}</option>)}
                                                    </Select>
                                                    <Select value={task.status} onChange={e => handleTaskChange(itemIndex, taskIndex, 'status', e.target.value as TaskStatus)} className="w-32">
                                                        {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </Select>
                                                    <Button type="button" variant="destructive" size="icon" onClick={() => handleRemoveTask(itemIndex, taskIndex)}><TrashIcon className="h-4 w-4" /></Button>
                                                </div>
                                                {/* Pricing row */}
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Auto Rate</label>
                                                        <div className="px-3 py-1.5 bg-[#F5F1EC] rounded text-gray-600">
                                                            {formatCurrency(autoRate)}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Manual Rate Override</label>
                                                        <div className="flex space-x-1">
                                                            <Input
                                                                type="number"
                                                                value={task.rate || ''}
                                                                onChange={e => handleTaskChange(itemIndex, taskIndex, 'rate', e.target.value ? parseFloat(e.target.value) : undefined)}
                                                                placeholder={`${autoRate.toFixed(2)}`}
                                                                min="0"
                                                                step="0.01"
                                                                className="flex-1"
                                                            />
                                                            {task.rate && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleTaskChange(itemIndex, taskIndex, 'rate', undefined)}
                                                                    className="px-2 text-xs text-[#648DDA] hover:text-[#527cc7]"
                                                                    title="Reset to auto rate"
                                                                >
                                                                    Reset
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Effective Rate</label>
                                                        <div className="px-3 py-1.5 bg-[#EBF5F0] rounded font-medium text-[#2E7B5B]">
                                                            {formatCurrency(task.rate || autoRate)}
                                                            {task.rate && <span className="ml-1 text-xs">(manual)</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <Button type="button" variant="outline" size="sm" onClick={() => handleAddTask(itemIndex)} className="mt-2"><PlusIcon className="h-4 w-4 mr-1" />Add Task</Button>
                                </div>

                                {/* Parts */}
                                <div>
                                    <h5 className="font-semibold text-gray-900">Parts Used</h5>
                                    {item.parts_used.map((part, partIndex) => {
                                        const selectedPart = dependencies.parts.find(p => p.name === part.part);
                                        return (
                                            <div key={part.name || partIndex} className="space-y-2 p-3 border rounded-xl bg-white my-2" style={{ borderColor: '#ECE8E3' }}>
                                                <div className="flex items-center space-x-2">
                                                    <Autocomplete
                                                        placeholder="Search by code, name, or description..."
                                                        options={dependencies.parts.map(p => ({
                                                            value: p.name,
                                                            label: `${p.item_code || p.name} - ${p.item_name}`,
                                                            subtitle: p.description || `Rate: ${formatCurrency(p.standard_rate || 0)}`
                                                        }))}
                                                        value={part.part}
                                                        onChange={(value) => {
                                                            handlePartChange(itemIndex, partIndex, 'part', value);
                                                            // Auto-fill UOM and rate
                                                            const selectedItem = dependencies.parts.find(p => p.name === value);
                                                            if (selectedItem) {
                                                                handlePartChange(itemIndex, partIndex, 'uom', selectedItem.stock_uom);
                                                                handlePartChange(itemIndex, partIndex, 'auto_rate', selectedItem.standard_rate);
                                                            }
                                                        }}
                                                        onSearch={async (query) => {
                                                            if (isErpNext && query.trim()) {
                                                                const results = await apiService.searchItems(query);
                                                                setDependencies(prev => ({ ...prev, parts: results }));
                                                            }
                                                        }}
                                                        className="flex-grow"
                                                    />
                                                    <Input
                                                        type="number"
                                                        value={part.quantity}
                                                        onChange={e => handlePartChange(itemIndex, partIndex, 'quantity', parseFloat(e.target.value) || 1)}
                                                        className="w-24"
                                                        placeholder="Qty"
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                    <Button type="button" variant="destructive" size="icon" onClick={() => handleRemovePart(itemIndex, partIndex)}>
                                                        <TrashIcon className="h-4 w-4" />
                                                    </Button>
                                                </div>

                                                {/* Optional task assignment */}
                                                <Select
                                                    value={part.task || ''}
                                                    onChange={e => handlePartChange(itemIndex, partIndex, 'task', e.target.value)}
                                                    className="text-sm"
                                                >
                                                    <option value="">Not linked to a specific task</option>
                                                    {item.tasks.map((task, idx) => {
                                                        const template = dependencies.services.find(s => s.name === task.service);
                                                        return (
                                                            <option key={task.name || idx} value={task.name || `task_${idx}`}>
                                                                {template?.task_name || task.service}
                                                            </option>
                                                        );
                                                    })}
                                                </Select>

                                                {/* Pricing row */}
                                                <div className="flex items-center space-x-2 text-sm">
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Auto Rate</label>
                                                        <div className="px-3 py-1.5 bg-[#F5F1EC] rounded text-gray-600">
                                                            {formatCurrency(selectedPart?.standard_rate || 0)}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Manual Rate Override</label>
                                                        <div className="flex space-x-1">
                                                            <Input
                                                                type="number"
                                                                value={part.rate || ''}
                                                                onChange={e => {
                                                                    handlePartChange(itemIndex, partIndex, 'rate', e.target.value ? parseFloat(e.target.value) : undefined);
                                                                    // Auto-fetch rate when part changes
                                                                    if (!e.target.value && selectedPart) {
                                                                        handlePartChange(itemIndex, partIndex, 'auto_rate', selectedPart.standard_rate);
                                                                    }
                                                                }}
                                                                placeholder={`${(selectedPart?.standard_rate || 0).toFixed(2)}`}
                                                                min="0"
                                                                step="0.01"
                                                                className="flex-1"
                                                            />
                                                            {part.rate && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handlePartChange(itemIndex, partIndex, 'rate', undefined)}
                                                                    className="px-2 text-xs text-[#648DDA] hover:text-[#527cc7]"
                                                                    title="Reset to auto rate"
                                                                >
                                                                    Reset
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label className="block text-xs text-gray-500 mb-1">Amount</label>
                                                        <div className="px-3 py-1.5 bg-[#EBF5F0] rounded font-medium text-[#2E7B5B]">
                                                            {formatCurrency((part.rate || selectedPart?.standard_rate || 0) * part.quantity)}
                                                            {part.rate && <span className="ml-1 text-xs">(manual)</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Show item details */}
                                                {selectedPart && selectedPart.description && (
                                                    <div className="text-xs text-gray-500">
                                                        <p className="italic">{selectedPart.description}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <Button type="button" variant="outline" size="sm" onClick={() => handleOpenAddPart(itemIndex)} className="mt-2"><PlusIcon className="h-4 w-4 mr-1" />Add Part</Button>
                                </div>
                            </div>
                        ))}
                        <Button type="button" variant="outline" onClick={handleAddItem} className="w-full">
                            <PlusIcon className="h-5 w-5 mr-2" />
                            Add another watch
                        </Button>
                    </div>

                    <div className="sticky bottom-0 left-0 right-0 pt-3 border-t bg-white/95 backdrop-blur-sm flex justify-end space-x-3" style={{ borderColor: '#F0EEEB' }}>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button type="submit">Save Order</Button>
                    </div>
                </form>
            </Modal>
            <CreateCustomerModal
                isOpen={isCreateCustomerOpen}
                onClose={() => setIsCreateCustomerOpen(false)}
                initialName={createCustomerQuery}
                onCustomerCreated={(newCustomer) => {
                    setDependencies(prev => ({ ...prev, customers: [newCustomer, ...prev.customers] }));
                    handleFieldChange('customer', newCustomer.name);
                }}
            />
            <CreateBrandModal
                isOpen={isCreateBrandOpen}
                onClose={() => setIsCreateBrandOpen(false)}
                initialName={createBrandQuery}
                onBrandCreated={(newBrand) => {
                    setDependencies(prev => ({ ...prev, brands: [...prev.brands, newBrand] }));
                    if (activeBrandIndex !== null) {
                        const newItems = [...formData.items];
                        newItems[activeBrandIndex] = {
                            ...newItems[activeBrandIndex],
                            watch_brand: newBrand.name,
                            watch_model: ''
                        };
                        setFormData({ ...formData, items: newItems });
                        // Trigger model fetch (empty initially, but sets up dependency)
                        if (isErpNext) {
                            apiService.getWatchModels(newBrand.name).then(models => {
                                setDependencies(prev => ({ ...prev, models }));
                            });
                        }
                    }
                }}
            />
            <CreateModelModal
                isOpen={isCreateModelOpen}
                onClose={() => setIsCreateModelOpen(false)}
                brand={createModelBrand}
                initialName={createModelQuery}
                onModelCreated={(newModel) => {
                    setDependencies(prev => ({ ...prev, models: [...prev.models, newModel] }));
                    if (activeModelIndex !== null) {
                        handleItemChange(activeModelIndex, 'watch_model', newModel.name);
                    }
                }}
            />
            {activePartItemIndex !== null && formData && (
                <AddPartModal
                    isOpen={isAddPartModalOpen}
                    onClose={() => setIsAddPartModalOpen(false)}
                    onSave={handleSavePart}
                    watchItem={formData.items[activePartItemIndex]}
                    allItems={dependencies.parts}
                    taskTemplates={dependencies.services}
                />
            )}
        </>
    );
};
