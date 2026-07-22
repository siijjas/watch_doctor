import React, { useState, useEffect, useCallback } from 'react';
import type { RepairOrder, RepairItem, Customer, WatchBrand, WatchModel, IssueTemplate, WatchConditionTemplate } from '../types';
import { OrderStatus, Priority, WatchStatus } from '../types';
import * as apiService from '../services/apiService';
import { isErpNext } from '../services/apiService';
import { mockCustomers } from '../services/mockData';
import { DEFAULT_WATCH_CONDITION_TEMPLATES, WATCH_CONDITION_CATEGORIES, newRepairItem } from '../services/repairIntakeDefaults';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Autocomplete } from './ui/Autocomplete';
import { useToast } from './ui/Toast';
import { CreateCustomerModal } from './CreateCustomerModal';
import { CreateBrandModal } from './CreateBrandModal';
import { CreateModelModal } from './CreateModelModal';
import { TrashIcon } from './icons/TrashIcon';

interface RepairOrderIntakeWizardProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (order: RepairOrder) => void;
}

type WatchDraft = Omit<RepairItem, 'name'>;

const STEP_LABELS = ['Customer & Order', 'Watches', 'Review'];

const todayIso = () => new Date().toISOString().split('T')[0];
const addDaysIso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
const displayDate = (iso: string) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const isWatchReady = (w: WatchDraft) => Boolean(w.watch_brand && w.watch_model && (w.issues.length > 0 || w.issues.some(i => i.is_other)));
const isWatchSubmittable = (w: WatchDraft) => Boolean(w.watch_brand && w.watch_model);

const groupConditionsByCategory = (templates: WatchConditionTemplate[]) => {
    const byCategory = new Map<string, WatchConditionTemplate[]>();
    templates.forEach(t => {
        const category = t.category && (WATCH_CONDITION_CATEGORIES as readonly string[]).includes(t.category)
            ? t.category
            : 'History & Other';
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category)!.push(t);
    });
    return WATCH_CONDITION_CATEGORIES
        .map(category => ({ category, items: byCategory.get(category) || [] }))
        .filter(group => group.items.length > 0);
};

export const RepairOrderIntakeWizard: React.FC<RepairOrderIntakeWizardProps> = ({ isOpen, onClose, onSave }) => {
    const { showToast, ToastComponent } = useToast();
    const [step, setStep] = useState<1 | 2 | 3>(1);

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [historyCount, setHistoryCount] = useState(0);

    const [receivedDate, setReceivedDate] = useState(todayIso());
    const [promisedDate, setPromisedDate] = useState(addDaysIso(7));
    const [priority, setPriority] = useState<Priority>(Priority.Normal);
    const [referenceNumber, setReferenceNumber] = useState('');

    const [watches, setWatches] = useState<WatchDraft[]>([newRepairItem()]);
    const [expanded, setExpanded] = useState<boolean[]>([true]);
    const [otherDescriptions, setOtherDescriptions] = useState<string[]>(['']);
    const [conditionTab, setConditionTab] = useState<string[]>(['']);

    const [brands, setBrands] = useState<WatchBrand[]>([]);
    const [modelsByBrand, setModelsByBrand] = useState<Record<string, WatchModel[]>>({});
    const [issueTemplates, setIssueTemplates] = useState<IssueTemplate[]>([]);
    const [conditionTemplates, setConditionTemplates] = useState<WatchConditionTemplate[]>([]);

    const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
    const [createCustomerQuery, setCreateCustomerQuery] = useState('');
    const [isCreateBrandOpen, setIsCreateBrandOpen] = useState(false);
    const [createBrandQuery, setCreateBrandQuery] = useState('');
    const [activeBrandIndex, setActiveBrandIndex] = useState<number | null>(null);
    const [isCreateModelOpen, setIsCreateModelOpen] = useState(false);
    const [createModelQuery, setCreateModelQuery] = useState('');
    const [createModelBrand, setCreateModelBrand] = useState('');
    const [activeModelIndex, setActiveModelIndex] = useState<number | null>(null);

    const resetState = useCallback(() => {
        setStep(1);
        setSelectedCustomer(null);
        setHistoryCount(0);
        setReceivedDate(todayIso());
        setPromisedDate(addDaysIso(7));
        setPriority(Priority.Normal);
        setReferenceNumber('');
        setWatches([newRepairItem()]);
        setExpanded([true]);
        setOtherDescriptions(['']);
        setConditionTab(['']);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        resetState();

        if (isErpNext) {
            Promise.all([
                apiService.getCustomers(),
                apiService.getWatchBrands(),
                apiService.getIssueTemplates(),
                apiService.getWatchConditionTemplates(),
            ]).then(([customerResults, brandResults, issueResults, conditionResults]) => {
                setCustomers(customerResults);
                setBrands(brandResults);
                setIssueTemplates(issueResults);
                setConditionTemplates(conditionResults);
            });
        } else {
            setCustomers(mockCustomers);
            setBrands([]);
            setIssueTemplates([]);
            setConditionTemplates(DEFAULT_WATCH_CONDITION_TEMPLATES);
        }
    }, [isOpen, resetState]);

    useEffect(() => {
        if (!selectedCustomer) {
            setHistoryCount(0);
            return;
        }
        apiService.getCustomerRepairHistory(selectedCustomer.name, 50)
            .then(rows => setHistoryCount(rows.length))
            .catch(() => setHistoryCount(0));
    }, [selectedCustomer]);

    const goToStep = (n: 1 | 2 | 3) => {
        if (n >= 2 && !selectedCustomer) {
            showToast('Select a customer first', 'error');
            return;
        }
        if (n === 3 && watches.some(w => !isWatchSubmittable(w))) {
            showToast('Add brand and model for every watch first', 'error');
            return;
        }
        setStep(n);
    };

    const setWatch = (index: number, patch: Partial<WatchDraft>) => {
        setWatches(prev => prev.map((w, i) => i === index ? { ...w, ...patch } : w));
    };

    const loadModelsForBrand = (brand: string) => {
        if (!isErpNext || !brand || modelsByBrand[brand]) return;
        apiService.getWatchModels(brand).then(models => {
            setModelsByBrand(prev => ({ ...prev, [brand]: models }));
        });
    };

    const handleAddWatch = () => {
        setWatches(prev => [...prev, newRepairItem()]);
        setExpanded(prev => [...prev.map(() => false), true]);
        setOtherDescriptions(prev => [...prev, '']);
        setConditionTab(prev => [...prev, '']);
    };

    const handleDuplicateLast = () => {
        const last = watches[watches.length - 1];
        setWatches(prev => [...prev, { ...newRepairItem(), watch_brand: last.watch_brand, watch_model: last.watch_model }]);
        setExpanded(prev => [...prev.map(() => false), true]);
        setOtherDescriptions(prev => [...prev, '']);
        setConditionTab(prev => [...prev, '']);
    };

    const handleRemoveWatch = (index: number) => {
        setWatches(prev => prev.filter((_, i) => i !== index));
        setExpanded(prev => prev.filter((_, i) => i !== index));
        setOtherDescriptions(prev => prev.filter((_, i) => i !== index));
        setConditionTab(prev => prev.filter((_, i) => i !== index));
    };

    const handleToggleIssue = (index: number, template: IssueTemplate) => {
        const w = watches[index];
        const active = w.issues.some(i => i.issue === template.name);
        setWatch(index, {
            issues: active ? w.issues.filter(i => i.issue !== template.name) : [...w.issues, { issue: template.name, is_other: false, other_description: '' }],
        });
    };

    const handleToggleOther = (index: number) => {
        const w = watches[index];
        const active = w.issues.some(i => i.is_other);
        setWatch(index, {
            issues: active ? w.issues.filter(i => !i.is_other) : [...w.issues, { issue: 'Other', is_other: true, other_description: otherDescriptions[index] || '' }],
        });
    };

    const handleOtherDescriptionChange = (index: number, description: string) => {
        setOtherDescriptions(prev => prev.map((d, i) => i === index ? description : d));
        const w = watches[index];
        setWatch(index, { issues: w.issues.map(i => i.is_other ? { ...i, other_description: description } : i) });
    };

    const handleToggleCondition = (index: number, conditionName: string) => {
        const w = watches[index];
        setWatch(index, { pre_existing_condition: [...w.pre_existing_condition, conditionName] });
    };

    const handleRemoveCondition = (index: number, conditionName: string) => {
        const w = watches[index];
        setWatch(index, { pre_existing_condition: w.pre_existing_condition.filter(c => c !== conditionName) });
    };

    const handleSetConditionTab = (index: number, category: string) => {
        setConditionTab(prev => prev.map((c, i) => i === index ? category : c));
    };

    const handleSubmit = () => {
        const missingFields: string[] = [];
        watches.forEach((w, idx) => {
            if (!w.watch_brand) missingFields.push(`Watch #${idx + 1}: Brand`);
            if (!w.watch_model) missingFields.push(`Watch #${idx + 1}: Model`);
        });
        if (!selectedCustomer) missingFields.push('Customer');
        if (missingFields.length > 0) {
            showToast(`Missing: ${missingFields.join(', ')}`, 'error');
            return;
        }

        const sanitizedItems = watches.map(item => ({
            ...item,
            issues: item.issues.map(issue => issue.is_other ? { ...issue, issue: 'Other' } : issue),
        }));

        onSave({
            name: '',
            customer: selectedCustomer!.name,
            contact_person: selectedCustomer!.customer_primary_contact || '',
            status: OrderStatus.Pending,
            received_date: receivedDate,
            promised_delivery_date: promisedDate,
            priority,
            reference_number: referenceNumber || undefined,
            items: sanitizedItems as RepairItem[],
        });
    };

    if (!isOpen) return null;

    const watchCountLabel = `${watches.length} watch${watches.length > 1 ? 'es' : ''}`;
    const incompleteCount = watches.filter(w => !isWatchReady(w)).length;
    const blockingCount = watches.filter(w => !isWatchSubmittable(w)).length;

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="New Repair Order" maxWidthClass="max-w-4xl">
                {/* Progress rail */}
                <div className="flex items-center gap-1.5 mb-6">
                    {STEP_LABELS.map((label, i) => {
                        const n = (i + 1) as 1 | 2 | 3;
                        const done = step > n;
                        const active = step === n;
                        return (
                            <div key={label} className="flex items-center gap-1.5 flex-1">
                                <button
                                    type="button"
                                    onClick={() => goToStep(n)}
                                    className="flex items-center gap-2 cursor-pointer"
                                >
                                    <span
                                        className="w-6.5 h-6.5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                        style={{
                                            width: 26, height: 26,
                                            background: done || active ? '#648DDA' : '#F0EDEA',
                                            color: done || active ? '#fff' : '#8A8378',
                                        }}
                                    >
                                        {done ? '✓' : n}
                                    </span>
                                    <span
                                        className="text-sm whitespace-nowrap hidden sm:inline"
                                        style={{ fontWeight: active ? 700 : 500, color: active ? '#1F2933' : '#8A8378' }}
                                    >
                                        {label}
                                    </span>
                                </button>
                                {n < STEP_LABELS.length && (
                                    <div className="flex-1 h-0.5 rounded" style={{ background: step > n ? '#648DDA' : '#ECE8E3' }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* STEP 1: Customer & Order */}
                {step === 1 && (
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 mb-1">Customer &amp; Order Details</h2>
                            <p className="text-sm mb-4" style={{ color: '#8A8378' }}>Start with who's dropping off and when it's due back.</p>

                            <Autocomplete
                                label="Customer"
                                placeholder="Search by name or phone..."
                                options={customers.map(c => ({
                                    value: c.name,
                                    label: c.customer_name,
                                    subtitle: (c as any).phone_display || c.phone || c.name,
                                }))}
                                value={selectedCustomer?.name || ''}
                                onChange={(value) => {
                                    const match = customers.find(c => c.name === value);
                                    setSelectedCustomer(match || null);
                                }}
                                onSearch={async (query) => {
                                    if (isErpNext && query.trim()) {
                                        const results = await apiService.getCustomers(query);
                                        setCustomers(results);
                                    }
                                }}
                                onCreate={(query) => {
                                    setCreateCustomerQuery(query);
                                    setIsCreateCustomerOpen(true);
                                }}
                            />

                            {selectedCustomer && (
                                <div className="flex items-center justify-between px-4 py-3 rounded-xl mt-3" style={{ background: '#F4F8FF', border: '1px solid #DDE8FA' }}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: '#648DDA' }}>
                                            {selectedCustomer.customer_name?.[0] || '?'}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-gray-900">{selectedCustomer.customer_name}</div>
                                            <div className="text-xs" style={{ color: '#5E7CB0' }}>{(selectedCustomer as any).phone_display || selectedCustomer.phone}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        {historyCount > 0 && (
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white" style={{ color: '#5E7CB0', border: '1px solid #DDE8FA' }}>
                                                {historyCount} previous order{historyCount > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs underline" style={{ color: '#8A8378' }}>
                                            Change
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="Received Date" type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
                            <Input label="Promised Delivery" type="date" value={promisedDate} onChange={e => setPromisedDate(e.target.value)} />
                            <Select label="Priority" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
                                {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                            </Select>
                        </div>

                        <Input
                            label="Reference Number (optional)"
                            placeholder="Customer's own reference"
                            value={referenceNumber}
                            onChange={e => setReferenceNumber(e.target.value)}
                            className="md:w-[340px]"
                        />
                    </div>
                )}

                {/* STEP 2: Watches */}
                {step === 2 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between mb-1">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 mb-1">Watches on this Order</h2>
                                <p className="text-sm" style={{ color: '#8A8378' }}>Add each watch, log the complaint, and note any pre-existing condition.</p>
                            </div>
                            <span className="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0" style={{ color: '#5E7CB0', background: '#F4F8FF', border: '1px solid #DDE8FA' }}>
                                {watchCountLabel}
                            </span>
                        </div>

                        {watches.map((w, i) => {
                            const ready = isWatchReady(w);
                            const isExpanded = expanded[i];
                            const title = w.watch_brand ? `${w.watch_brand}${w.watch_model ? ' ' + w.watch_model : ''}` : `Watch #${i + 1}`;
                            const complaintCount = w.issues.length;
                            const conditionCount = w.pre_existing_condition.length;
                            const subtitle = ready
                                ? [complaintCount ? `${complaintCount} complaint${complaintCount > 1 ? 's' : ''}` : '', conditionCount ? `${conditionCount} condition note${conditionCount > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || 'Details added'
                                : 'Add brand, model & complaint';
                            const conditionGroups = groupConditionsByCategory(conditionTemplates);
                            const activeConditionCategory = conditionTab[i] || conditionGroups[0]?.category || '';
                            const activeConditionItems = (conditionGroups.find(g => g.category === activeConditionCategory)?.items || [])
                                .filter(t => !w.pre_existing_condition.some(c => c.toLowerCase() === t.condition_name.toLowerCase()));

                            return (
                                <div key={i} className="rounded-2xl overflow-hidden bg-white" style={{ border: `1px solid ${isExpanded ? '#648DDA' : '#ECE8E3'}` }}>
                                    <div
                                        onClick={() => setExpanded(prev => prev.map((e, idx) => idx === i ? !e : e))}
                                        className="flex items-center justify-between px-4 py-3.5 cursor-pointer gap-2.5 flex-wrap"
                                        style={{ background: isExpanded ? '#F9FBFF' : '#fff' }}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0" style={{ background: ready ? '#EAF7EF' : '#F0EDEA', color: ready ? '#2F7A4F' : '#4B5563' }}>
                                                {i + 1}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-gray-900 truncate">{title}</div>
                                                <div className="text-xs truncate" style={{ color: '#8A8378' }}>{subtitle}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3.5 flex-shrink-0">
                                            <span
                                                className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                                                style={ready
                                                    ? { color: '#2F7A4F', background: '#EAF7EF', border: '1px solid #CFEBDA' }
                                                    : { color: '#B4832A', background: '#FDF3E3', border: '1px solid #F3E0B8' }}
                                            >
                                                {ready ? 'Ready' : 'Needs info'}
                                            </span>
                                            {watches.length > 1 && (
                                                <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveWatch(i); }} className="text-gray-400 hover:text-red-500">
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            )}
                                            <span className="text-xs" style={{ color: '#B4B0A6', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s', display: 'inline-block' }}>▾</span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 pt-5 pb-6" style={{ borderTop: '1px solid #F0EEEB' }}>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-5">
                                                <Autocomplete
                                                    label="Brand"
                                                    placeholder="Search brand..."
                                                    options={brands.map(b => ({ value: b.name, label: b.brand_name, subtitle: b.description || '' }))}
                                                    value={w.watch_brand}
                                                    onChange={(value) => {
                                                        setWatch(i, { watch_brand: value, watch_model: '' });
                                                        loadModelsForBrand(value);
                                                    }}
                                                    onSearch={async (query) => {
                                                        if (!isErpNext) return;
                                                        const results = await apiService.getWatchBrands(query);
                                                        setBrands(results);
                                                    }}
                                                    onCreate={(query) => {
                                                        setCreateBrandQuery(query);
                                                        setActiveBrandIndex(i);
                                                        setIsCreateBrandOpen(true);
                                                    }}
                                                />
                                                <Autocomplete
                                                    label="Model"
                                                    placeholder={w.watch_brand ? 'Search model...' : 'Select brand first'}
                                                    options={(modelsByBrand[w.watch_brand] || []).map(m => ({ value: m.name, label: m.model_name, subtitle: m.description || '' }))}
                                                    value={w.watch_model}
                                                    onChange={(value) => setWatch(i, { watch_model: value })}
                                                    onSearch={async (query) => {
                                                        if (!isErpNext || !w.watch_brand) return;
                                                        const results = await apiService.getWatchModels(w.watch_brand, query);
                                                        setModelsByBrand(prev => ({ ...prev, [w.watch_brand]: results }));
                                                    }}
                                                    onCreate={(query) => {
                                                        setCreateModelQuery(query);
                                                        setCreateModelBrand(w.watch_brand);
                                                        setActiveModelIndex(i);
                                                        setIsCreateModelOpen(true);
                                                    }}
                                                    className={!w.watch_brand ? 'opacity-50 pointer-events-none' : ''}
                                                />
                                                <Input label="Serial Number" placeholder="Optional" value={w.serial_number} onChange={e => setWatch(i, { serial_number: e.target.value })} />
                                            </div>

                                            <div className="mb-4.5" style={{ marginBottom: 18 }}>
                                                <label className="block text-xs font-semibold text-gray-700 mb-2">Complaint — tap all that apply</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {issueTemplates.map(template => {
                                                        const active = w.issues.some(iss => iss.issue === template.name);
                                                        return (
                                                            <button
                                                                key={template.name}
                                                                type="button"
                                                                onClick={() => handleToggleIssue(i, template)}
                                                                className="px-3.5 py-2 rounded-full text-sm font-semibold"
                                                                style={{
                                                                    border: `1px solid ${active ? '#648DDA' : '#E8E8E8'}`,
                                                                    background: active ? '#648DDA' : '#fff',
                                                                    color: active ? '#fff' : '#4B5563',
                                                                }}
                                                            >
                                                                {template.issue_name}
                                                            </button>
                                                        );
                                                    })}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleOther(i)}
                                                        className="px-3.5 py-2 rounded-full text-sm font-semibold"
                                                        style={{
                                                            border: '1px dashed #C9C2B6',
                                                            background: w.issues.some(iss => iss.is_other) ? '#648DDA' : 'transparent',
                                                            color: w.issues.some(iss => iss.is_other) ? '#fff' : '#8A8378',
                                                        }}
                                                    >
                                                        + Other
                                                    </button>
                                                </div>
                                                {w.issues.some(iss => iss.is_other) && (
                                                    <textarea
                                                        placeholder="Describe the issue..."
                                                        value={otherDescriptions[i] || ''}
                                                        onChange={e => handleOtherDescriptionChange(i, e.target.value)}
                                                        rows={2}
                                                        className="mt-2.5 w-full px-3 py-2.5 border rounded-xl text-sm bg-white resize-y"
                                                        style={{ borderColor: '#E8E8E8' }}
                                                    />
                                                )}
                                            </div>

                                            <div className="rounded-2xl p-4" style={{ background: '#FCFAF7', border: '1px solid #ECE8E3' }}>
                                                <div className="mb-2.5">
                                                    <div className="text-sm font-bold text-gray-900">Pre-Existing Condition</div>
                                                    <div className="text-xs mt-0.5" style={{ color: '#8A8378' }}>Tap what's already there — protects both sides if it's flagged again at pickup.</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1 mb-3 pb-2" style={{ borderBottom: '1px solid #ECE8E3' }}>
                                                    {conditionGroups.map(group => {
                                                        const isActive = group.category === activeConditionCategory;
                                                        const selectedInGroup = group.items.filter(t => w.pre_existing_condition.some(c => c.toLowerCase() === t.condition_name.toLowerCase())).length;
                                                        return (
                                                            <button
                                                                key={group.category}
                                                                type="button"
                                                                onClick={() => handleSetConditionTab(i, group.category)}
                                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                                style={{
                                                                    background: isActive ? '#648DDA' : 'transparent',
                                                                    color: isActive ? '#fff' : '#8A8378',
                                                                }}
                                                            >
                                                                {group.category}{selectedInGroup > 0 ? ` (${selectedInGroup})` : ''}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {activeConditionItems.length > 0 ? activeConditionItems.map(template => (
                                                        <button
                                                            key={template.name}
                                                            type="button"
                                                            onClick={() => handleToggleCondition(i, template.condition_name)}
                                                            className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white"
                                                            style={{ border: '1px solid #E0DACE', color: '#4B5563' }}
                                                        >
                                                            {template.condition_name}
                                                        </button>
                                                    )) : (
                                                        <div className="text-xs" style={{ color: '#B4B0A6' }}>All conditions in this category are already added.</div>
                                                    )}
                                                </div>
                                                {w.pre_existing_condition.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: '1px solid #ECE8E3' }}>
                                                        {w.pre_existing_condition.map(condition => (
                                                            <span key={condition} className="inline-flex items-center gap-1.5 bg-white rounded-full px-2.5 py-1 text-xs text-gray-700" style={{ border: '1px solid #DCD5C8' }}>
                                                                {condition}
                                                                <button type="button" onClick={() => handleRemoveCondition(i, condition)} className="text-gray-400 hover:text-red-500 text-xs leading-none">
                                                                    ×
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <button
                            type="button"
                            onClick={handleAddWatch}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm"
                            style={{ border: '1.5px dashed #C9C2B6', color: '#648DDA' }}
                        >
                            <span className="text-base leading-none">+</span> Add Another Watch
                        </button>
                        {watches.length >= 1 && watches[watches.length - 1]?.watch_brand && (
                            <button type="button" onClick={handleDuplicateLast} className="block mx-auto text-xs underline -mt-1" style={{ color: '#8A8378' }}>
                                or duplicate Watch {watches.length}'s brand/model to save time
                            </button>
                        )}
                    </div>
                )}

                {/* STEP 3: Review */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 mb-1">Review &amp; Submit</h2>
                            <p className="text-sm" style={{ color: '#8A8378' }}>Check the details below, then create the order.</p>
                        </div>

                        {incompleteCount > 0 && (
                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm" style={{ background: '#FDF3E3', border: '1px solid #F3E0B8', color: '#8A6A22' }}>
                                <span>⚠</span> {incompleteCount} watch{incompleteCount > 1 ? 'es' : ''} missing a complaint — you can still submit and fill this in later.
                            </div>
                        )}

                        <div className="rounded-2xl p-5" style={{ border: '1px solid #ECE8E3' }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: '#648DDA' }}>
                                    {selectedCustomer?.customer_name?.[0] || '?'}
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-gray-900">{selectedCustomer?.customer_name}</div>
                                    <div className="text-xs" style={{ color: '#8A8378' }}>{(selectedCustomer as any)?.phone_display || selectedCustomer?.phone}</div>
                                </div>
                                <button type="button" onClick={() => setStep(1)} className="ml-auto text-xs underline" style={{ color: '#648DDA' }}>Edit</button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 pt-3.5" style={{ borderTop: '1px solid #F0EEEB' }}>
                                <div>
                                    <div className="text-[11px] mb-0.5" style={{ color: '#8A8378' }}>Received</div>
                                    <div className="text-sm font-semibold text-gray-900">{displayDate(receivedDate)}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] mb-0.5" style={{ color: '#8A8378' }}>Promised</div>
                                    <div className="text-sm font-semibold text-gray-900">{displayDate(promisedDate)}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] mb-0.5" style={{ color: '#8A8378' }}>Priority</div>
                                    <div className="text-sm font-semibold text-gray-900">{priority}</div>
                                </div>
                                <div>
                                    <div className="text-[11px] mb-0.5" style={{ color: '#8A8378' }}>Reference</div>
                                    <div className="text-sm font-semibold text-gray-900">{referenceNumber || '—'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-gray-900">{watchCountLabel}</div>
                            <button type="button" onClick={() => setStep(2)} className="text-xs underline" style={{ color: '#648DDA' }}>Edit watches</button>
                        </div>
                        <div className="space-y-2.5">
                            {watches.map((w, i) => {
                                const ready = isWatchReady(w);
                                const title = w.watch_brand ? `${w.watch_brand}${w.watch_model ? ' ' + w.watch_model : ''}` : `Watch #${i + 1}`;
                                const complaintSummary = w.issues.length
                                    ? w.issues.map(iss => iss.is_other ? (otherDescriptions[i] || 'Other (no detail)') : (issueTemplates.find(t => t.name === iss.issue)?.issue_name || iss.issue)).join(', ')
                                    : 'None recorded';
                                const conditionSummary = w.pre_existing_condition.length ? w.pre_existing_condition.join(', ') : 'None noted';
                                return (
                                    <div key={i} className="rounded-xl px-4.5 py-4" style={{ border: '1px solid #ECE8E3' }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-6.5 h-6.5 rounded-lg flex items-center justify-center font-bold text-xs" style={{ width: 26, height: 26, background: '#F0EDEA', color: '#4B5563' }}>{i + 1}</div>
                                                <div className="text-sm font-bold text-gray-900">{title}</div>
                                            </div>
                                            <span
                                                className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                                                style={ready
                                                    ? { color: '#2F7A4F', background: '#EAF7EF', border: '1px solid #CFEBDA' }
                                                    : { color: '#B4832A', background: '#FDF3E3', border: '1px solid #F3E0B8' }}
                                            >
                                                {ready ? 'Ready' : 'Incomplete'}
                                            </span>
                                        </div>
                                        <div className="text-xs mb-1" style={{ color: '#6B7280' }}><span className="font-semibold" style={{ color: '#4B5563' }}>Complaint:</span> {complaintSummary}</div>
                                        <div className="text-xs" style={{ color: '#6B7280' }}><span className="font-semibold" style={{ color: '#4B5563' }}>Condition:</span> {conditionSummary}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Bottom action bar */}
                <div className="sticky bottom-0 left-0 right-0 pt-4 mt-6 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-sm" style={{ borderTop: '1px solid #ECE8E3' }}>
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                        {step > 1 && (
                            <Button type="button" variant="outline" onClick={() => setStep((step - 1) as 1 | 2)}>Back</Button>
                        )}
                    </div>
                    {step === 3 ? (
                        <Button type="button" onClick={handleSubmit} disabled={blockingCount > 0}>Create Repair Order</Button>
                    ) : (
                        <Button type="button" onClick={() => goToStep((step + 1) as 2 | 3)}>
                            {step === 2 ? 'Review Order' : 'Continue'}
                        </Button>
                    )}
                </div>
            </Modal>

            <CreateCustomerModal
                isOpen={isCreateCustomerOpen}
                onClose={() => setIsCreateCustomerOpen(false)}
                initialName={createCustomerQuery}
                onCustomerCreated={(newCustomer) => {
                    setCustomers(prev => [newCustomer, ...prev]);
                    setSelectedCustomer(newCustomer);
                }}
            />
            <CreateBrandModal
                isOpen={isCreateBrandOpen}
                onClose={() => setIsCreateBrandOpen(false)}
                initialName={createBrandQuery}
                onBrandCreated={(newBrand) => {
                    setBrands(prev => [...prev, newBrand]);
                    if (activeBrandIndex !== null) {
                        setWatch(activeBrandIndex, { watch_brand: newBrand.name, watch_model: '' });
                        if (isErpNext) {
                            apiService.getWatchModels(newBrand.name).then(models => {
                                setModelsByBrand(prev => ({ ...prev, [newBrand.name]: models }));
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
                    setModelsByBrand(prev => ({ ...prev, [createModelBrand]: [...(prev[createModelBrand] || []), newModel] }));
                    if (activeModelIndex !== null) {
                        setWatch(activeModelIndex, { watch_model: newModel.name });
                    }
                }}
            />
            {ToastComponent}
        </>
    );
};
