import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getList, getDoc, saveDoc, deleteDoc, isErpNext, uploadFile, saveLogoUrl, getGeneralConfiguration, saveGeneralConfiguration, getWhatsAppTemplates, saveWhatsAppTemplate, getWhatsAppConfig, getTemplatePlaceholders, getPmsConfiguration, savePmsConfiguration, getPosCustomers, getInvoiceWorkflowConfiguration, saveInvoiceWorkflowConfiguration } from '../services/apiService';
import type { WhatsAppTemplate, WhatsAppConfig, WhatsAppPlaceholder, PmsConfiguration, PmsConfigurationOptions, GeneralConfiguration, InvoiceWorkflowConfiguration, InvoiceWorkflowConfigurationOptions } from '../services/apiService';
import { useAppConfig } from '../context/AppConfigContext';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { ConfirmDialog } from './ui/ConfirmDialog';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type SettingsTab =
    | 'general'
    | 'invoice-workflows'
    | 'pos-config'
    | 'pms-vat'
    | 'payment-modes'
    | 'technicians'
    | 'sales-persons'
    | 'country-codes'
    | 'task-templates'
    | 'issue-templates'
    | 'watch-condition-templates'
    | 'diagnosis-summary-templates'
    | 'recommended-work-templates'
    | 'movement-type-templates'
    | 'movement-caliber-templates'
    | 'watch-brands'
    | 'watch-models'
    | 'whatsapp';

interface PaymentModeConfig {
    name?: string;
    payment_mode: string;
    is_active: number;
    display_order: number;
}

interface Technician {
    name?: string;
    technician_name: string;
    email: string;
    phone: string;
    notes: string;
}

interface SalesPersonConfig {
    name?: string;
    sales_person_name: string;
    parent_sales_person: string;
    commission_rate: number;
    enabled: number;
    is_group?: number;
    lft?: number;
    rgt?: number;
    old_parent?: string;
}

interface CountryCode {
    name?: string;
    country_name: string;
    code: string;
    display_order: number;
    is_active: number;
}

interface TaskTemplate {
    name?: string;
    task_name: string;
    default_rate: number;
    description: string;
}

interface IssueTemplate {
    name?: string;
    issue_name: string;
    description: string;
    suggested_task: string;
    is_active: number;
}

interface WatchConditionTemplate {
    name?: string;
    condition_name: string;
    description: string;
    is_active: number;
}

interface DiagnosisSummaryTemplate {
    name?: string;
    summary_name: string;
    description: string;
    is_active: number;
}

interface RecommendedWorkTemplate {
    name?: string;
    work_name: string;
    description: string;
    is_active: number;
}

interface MovementTypeTemplate {
    name?: string;
    movement_type: string;
    description: string;
    is_active: number;
}

interface MovementCaliberTemplate {
    name?: string;
    caliber_code: string;
    description: string;
    is_active: number;
}

interface WatchBrand {
    name?: string;
    brand_name: string;
    description: string;
}

interface WatchModel {
    name?: string;
    brand: string;
    model_name: string;
    description: string;
}

interface PosProfileConfig {
    name: string;
    company?: string;
    warehouse?: string;
    dw_default_customer?: string;
    dw_enable_auto_print?: number;
    dw_default_sales_person?: string;
    dw_default_commission_rate?: number;
    modified?: string;
    creation?: string;
    owner?: string;
}

// ─────────────────────────────────────────────────────────────
// Reusable helpers
// ─────────────────────────────────────────────────────────────
const LoadingSpinner: React.FC = () => (
    <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-600" />
    </div>
);

const EmptyState: React.FC<{ message?: string }> = ({ message = 'No records yet. Click "Add New" to create one.' }) => (
    <div className="text-center py-16 text-gray-400 text-sm">{message}</div>
);

const ActiveBadge: React.FC<{ active: boolean }> = ({ active }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {active ? 'Active' : 'Inactive'}
    </span>
);

const SectionHeader: React.FC<{ title: string; description: string; onAdd: () => void; addLabel?: string }> = ({
    title, description, onAdd, addLabel = 'Add New'
}) => (
    <div className="flex items-center justify-between mb-5">
        <div>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        </div>
        <button
            onClick={onAdd}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
        >
            <span className="text-base leading-none">+</span> {addLabel}
        </button>
    </div>
);

interface Column<T> {
    key: string;
    label: string;
    render?: (row: T) => React.ReactNode;
}

function ConfigTable<T extends { name?: string }>({
    data,
    isLoading,
    columns,
    onEdit,
    onDelete,
}: {
    data: T[];
    isLoading: boolean;
    columns: Column<T>[];
    onEdit: (row: T) => void;
    onDelete: (row: T) => void;
}) {
    if (isLoading) return <LoadingSpinner />;
    if (data.length === 0) return <EmptyState />;

    return (
        <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
                <thead>
                    <tr className="bg-gray-50">
                        {columns.map(c => (
                            <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {c.label}
                            </th>
                        ))}
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {data.map((row, i) => (
                        <tr key={row.name || i} className="hover:bg-gray-50 transition-colors">
                            {columns.map(c => (
                                <td key={c.key} className="px-4 py-3 text-sm text-gray-700">
                                    {c.render ? c.render(row) : String((row as any)[c.key] ?? '')}
                                </td>
                            ))}
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-3">
                                    <button
                                        onClick={() => onEdit(row)}
                                        className="text-purple-600 hover:text-purple-800 text-sm font-medium transition-colors"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => onDelete(row)}
                                        className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const ModalFooter: React.FC<{ onCancel: () => void; isSaving: boolean; label?: string }> = ({
    onCancel, isSaving, label = 'Save'
}) => (
    <div className="flex justify-end gap-3 pt-4 border-t mt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <button
            type="submit"
            disabled={isSaving}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
            {isSaving ? <><Spinner size="sm" /> Saving…</> : label}
        </button>
    </div>
);

// ─────────────────────────────────────────────────────────────
// Section: Payment Modes
// ─────────────────────────────────────────────────────────────
const PaymentModesSection: React.FC = () => {
    const [data, setData] = useState<PaymentModeConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<PaymentModeConfig | null>(null);
    const [form, setForm] = useState<PaymentModeConfig>({ payment_mode: '', is_active: 1, display_order: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<PaymentModeConfig | null>(null);
    const [modeOptions, setModeOptions] = useState<string[]>([]);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getList('DW Payment Mode Config', ['name', 'payment_mode', 'is_active', 'display_order'], [], 200);
            setData(res);
            if (isErpNext) {
                const modes = await getList('Mode of Payment', ['name'], [], 100);
                setModeOptions(modes.map((m: any) => m.name));
            }
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ payment_mode: '', is_active: 1, display_order: data.length + 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: PaymentModeConfig) => {
        try {
            const full = await getDoc('DW Payment Mode Config', row.name!);
            setEditRow(full);
            setForm({ payment_mode: full.payment_mode, is_active: full.is_active, display_order: full.display_order, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Payment Mode Config', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Payment Mode Config', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<PaymentModeConfig>[] = [
        { key: 'payment_mode', label: 'Payment Mode' },
        { key: 'display_order', label: 'Display Order' },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Payment Modes"
                description="Configure which payment methods are available at checkout."
                onAdd={openAdd}
                addLabel="Add Payment Mode"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Payment Mode' : 'Add Payment Mode'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                        {modeOptions.length > 0 ? (
                            <select
                                className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                                value={form.payment_mode}
                                onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                                required
                                disabled={!!editRow}
                            >
                                <option value="">Select payment mode…</option>
                                {modeOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        ) : (
                            <Input
                                value={form.payment_mode}
                                onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                                placeholder="e.g. Cash, Card, Bank Transfer"
                                required
                                disabled={!!editRow}
                            />
                        )}
                        {editRow && <p className="text-xs text-gray-400 mt-1">Payment mode cannot be changed after creation.</p>}
                    </div>
                    <Input
                        label="Display Order"
                        type="number"
                        min={0}
                        value={form.display_order}
                        onChange={e => setForm(f => ({ ...f, display_order: +e.target.value }))}
                    />
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Payment Mode"
                message={`Are you sure you want to delete the payment mode "${deleteTarget?.payment_mode}"? This may affect checkout if it's in use.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: POS Configuration
// ─────────────────────────────────────────────────────────────
const PosConfigurationSection: React.FC = () => {
    const [data, setData] = useState<PosProfileConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<PosProfileConfig | null>(null);
    const [form, setForm] = useState<PosProfileConfig>({ name: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [customerOptions, setCustomerOptions] = useState<{ name: string; customer_name?: string }[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
    const [salesPersonOptions, setSalesPersonOptions] = useState<string[]>([]);

    const loadCustomerOptions = useCallback(async (search: string = '', selectedCustomer: string = '') => {
        setIsLoadingCustomers(true);
        try {
            const customers = await getPosCustomers(search);
            let nextCustomers = customers;

            if (selectedCustomer && !customers.some(customer => customer.name === selectedCustomer)) {
                try {
                    const fullCustomer = await getDoc('Customer', selectedCustomer);
                    nextCustomers = [{
                        name: fullCustomer.name,
                        customer_name: fullCustomer.customer_name || fullCustomer.name,
                    }, ...customers];
                } catch {
                    nextCustomers = customers;
                }
            }

            setCustomerOptions(nextCustomers);
        } catch (e) {
            console.error(e);
            setCustomerOptions([]);
        }
        setIsLoadingCustomers(false);
    }, []);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [profiles, salesPersons] = await Promise.all([
                getList('POS Profile', ['name', 'company', 'warehouse', 'dw_default_customer', 'dw_enable_auto_print', 'dw_default_sales_person', 'dw_default_commission_rate'], [], 200),
                getList('Sales Person', ['name'], [['is_group', '=', 0]], 200),
            ]);

            setData(profiles as PosProfileConfig[]);
            setSalesPersonOptions(salesPersons.map((row: any) => row.name));
        } catch (e) {
            console.error(e);
            setData([]);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!isModalOpen) return;
        const timer = window.setTimeout(() => {
            loadCustomerOptions(customerSearch, form.dw_default_customer || '');
        }, 250);
        return () => window.clearTimeout(timer);
    }, [isModalOpen, customerSearch, form.dw_default_customer, loadCustomerOptions]);

    const openEdit = async (row: PosProfileConfig) => {
        try {
            const full = await getDoc('POS Profile', row.name);

            setEditRow(full);
            setForm({
                name: full.name,
                company: full.company,
                warehouse: full.warehouse,
                dw_default_customer: full.dw_default_customer || '',
                dw_enable_auto_print: full.dw_enable_auto_print || 0,
                dw_default_sales_person: full.dw_default_sales_person || '',
                dw_default_commission_rate: full.dw_default_commission_rate || 0,
                modified: full.modified,
                creation: full.creation,
                owner: full.owner,
            });
            setCustomerSearch('');
            await loadCustomerOptions('', full.dw_default_customer || '');
        } catch (e) {
            console.error(e);
            setEditRow(row);
            setForm({ ...row });
            setCustomerSearch('');
            await loadCustomerOptions('', row.dw_default_customer || '');
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editRow) return;
        setIsSaving(true);
        try {
            await saveDoc({
                ...editRow,
                doctype: 'POS Profile',
                dw_default_customer: form.dw_default_customer || '',
                dw_enable_auto_print: form.dw_enable_auto_print ? 1 : 0,
                dw_default_sales_person: form.dw_default_sales_person || '',
                dw_default_commission_rate: Number(form.dw_default_commission_rate) || 0,
            });
            setIsModalOpen(false);
            await load();
        } catch (e) {
            console.error(e);
            alert('Error saving: ' + e);
        }
        setIsSaving(false);
    };

    const columns: Column<PosProfileConfig>[] = [
        { key: 'name', label: 'POS Profile' },
        { key: 'company', label: 'Company' },
        { key: 'dw_default_customer', label: 'Default Customer' },
        { key: 'dw_default_sales_person', label: 'Sales Person', render: r => r.dw_default_sales_person || '—' },
        { key: 'dw_default_commission_rate', label: 'Commission %', render: r => Number(r.dw_default_commission_rate || 0).toFixed(2) },
        { key: 'dw_enable_auto_print', label: 'Auto Print', render: r => <ActiveBadge active={!!r.dw_enable_auto_print} /> },
    ];

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800">POS Configuration</h3>
                    <p className="text-sm text-gray-500 mt-0.5">Configure default customer, auto-print, and sales commission on each POS Profile.</p>
                </div>
            </div>

            <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-800 font-medium">Invoice identity now comes from Invoice Workflows.</p>
                <p className="text-sm text-emerald-700 mt-1">Use the Invoice Workflows tab for POS naming series and print formats. POS Profile settings here stay focused on operational defaults.</p>
            </div>

            {data.length === 0 ? (
                <EmptyState message="No POS Profiles found. Create a POS Profile in ERPNext, then return here to configure Watch Doctor POS defaults." />
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead>
                            <tr className="bg-gray-50">
                                {columns.map(c => (
                                    <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                        {c.label}
                                    </th>
                                ))}
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {data.map(row => (
                                <tr key={row.name} className="hover:bg-gray-50 transition-colors">
                                    {columns.map(c => (
                                        <td key={c.key} className="px-4 py-3 text-sm text-gray-700">
                                            {c.render ? c.render(row) : String((row as any)[c.key] ?? '')}
                                        </td>
                                    ))}
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            onClick={() => openEdit(row)}
                                            className="text-purple-600 hover:text-purple-800 text-sm font-medium transition-colors"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? `Edit POS Profile — ${editRow.name}` : 'Edit POS Profile'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="POS Profile" value={form.name || ''} disabled onChange={() => {}} />
                        <Input label="Company" value={form.company || ''} disabled onChange={() => {}} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Customer</label>
                        <Input
                            value={customerSearch}
                            onChange={e => setCustomerSearch(e.target.value)}
                            placeholder="Search customer by name or code…"
                        />
                        <div className="mt-2" />
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                            value={form.dw_default_customer || ''}
                            onChange={e => setForm(f => ({ ...f, dw_default_customer: e.target.value }))}
                        >
                            <option value="">None</option>
                            {customerOptions.map(customer => (
                                <option key={customer.name} value={customer.name}>{customer.customer_name || customer.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            {isLoadingCustomers ? 'Searching customers…' : 'Type above to search and then pick the default customer.'}
                        </p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.dw_enable_auto_print}
                            onChange={e => setForm(f => ({ ...f, dw_enable_auto_print: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Enable Auto Print</span>
                    </label>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Sales Person</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                            value={form.dw_default_sales_person || ''}
                            onChange={e => setForm(f => ({ ...f, dw_default_sales_person: e.target.value }))}
                        >
                            <option value="">None</option>
                            {salesPersonOptions.map(person => (
                                <option key={person} value={person}>{person}</option>
                            ))}
                        </select>
                    </div>

                    <Input
                        label="Commission Rate"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.dw_default_commission_rate || 0}
                        onChange={e => setForm(f => ({ ...f, dw_default_commission_rate: parseFloat(e.target.value) || 0 }))}
                    />

                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} label="Save POS Configuration" />
                </form>
            </Modal>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Technicians
// ─────────────────────────────────────────────────────────────
const TechniciansSection: React.FC = () => {
    const [data, setData] = useState<Technician[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<Technician | null>(null);
    const [form, setForm] = useState<Technician>({ technician_name: '', email: '', phone: '', notes: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Technician | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getList('DW Technician', ['name', 'technician_name', 'email', 'phone', 'notes'], [], 200);
            setData(res);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ technician_name: '', email: '', phone: '', notes: '' });
        setIsModalOpen(true);
    };

    const openEdit = async (row: Technician) => {
        try {
            const full = await getDoc('DW Technician', row.name!);
            setEditRow(full); setForm({ technician_name: full.technician_name, email: full.email || '', phone: full.phone || '', notes: full.notes || '', name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Technician', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Technician', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<Technician>[] = [
        { key: 'name', label: 'ID' },
        { key: 'technician_name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
    ];

    return (
        <div>
            <SectionHeader
                title="Technicians"
                description="Manage the technicians who perform watch repairs."
                onAdd={openAdd}
                addLabel="Add Technician"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Technician' : 'Add Technician'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Full Name *"
                        value={form.technician_name}
                        onChange={e => setForm(f => ({ ...f, technician_name: e.target.value }))}
                        placeholder="e.g. Jean-Paul Moreau"
                        required
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. jp@watchdoc.com"
                    />
                    <Input
                        label="Phone"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="e.g. +33 6 12 34 56 78"
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={3}
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Specialization, certifications, etc."
                        />
                    </div>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Technician"
                message={`Are you sure you want to delete technician "${deleteTarget?.technician_name}"? Orders assigned to this technician will be unaffected but they won't be selectable for new tasks.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

const SalesPersonsSection: React.FC = () => {
    const [data, setData] = useState<SalesPersonConfig[]>([]);
    const [groupOptions, setGroupOptions] = useState<Array<{ name: string; sales_person_name?: string }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<SalesPersonConfig | null>(null);
    const [form, setForm] = useState<SalesPersonConfig>({
        sales_person_name: '',
        parent_sales_person: '',
        commission_rate: 0,
        enabled: 1,
        is_group: 0,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SalesPersonConfig | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [salesPeople, groups] = await Promise.all([
                getList('Sales Person', ['name', 'sales_person_name', 'parent_sales_person', 'commission_rate', 'enabled'], [['is_group', '=', 0]], 200),
                getList('Sales Person', ['name', 'sales_person_name'], [['is_group', '=', 1]], 200),
            ]);
            setData(salesPeople);
            setGroupOptions(groups);
        } catch (e) {
            console.error(e);
            setData([]);
            setGroupOptions([]);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        const defaultParent = groupOptions[0]?.name || '';
        setEditRow(null);
        setForm({
            sales_person_name: '',
            parent_sales_person: defaultParent,
            commission_rate: 0,
            enabled: 1,
            is_group: 0,
        });
        setIsModalOpen(true);
    };

    const openEdit = async (row: SalesPersonConfig) => {
        try {
            const full = await getDoc('Sales Person', row.name!);
            setEditRow(full);
            setForm({
                name: full.name,
                sales_person_name: full.sales_person_name || full.name,
                parent_sales_person: full.parent_sales_person || '',
                commission_rate: Number(full.commission_rate || 0),
                enabled: full.enabled ? 1 : 0,
                is_group: 0,
                lft: full.lft,
                rgt: full.rgt,
                old_parent: full.parent_sales_person || '',
            });
        } catch {
            setEditRow(row);
            setForm({
                ...row,
                commission_rate: Number(row.commission_rate || 0),
                enabled: row.enabled ? 1 : 0,
                is_group: 0,
                old_parent: row.parent_sales_person || '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({
                doctype: 'Sales Person',
                ...form,
                is_group: 0,
                enabled: form.enabled ? 1 : 0,
                commission_rate: Number(form.commission_rate) || 0,
                ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}),
            });
            setIsModalOpen(false);
            await load();
        } catch (e) {
            console.error(e);
            alert('Error saving: ' + e);
        }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('Sales Person', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) {
            alert('Error deleting: ' + e);
        }
    };

    const getParentLabel = (name: string) => {
        const option = groupOptions.find(group => group.name === name);
        return option?.sales_person_name || name || '—';
    };

    const columns: Column<SalesPersonConfig>[] = [
        { key: 'name', label: 'ID' },
        { key: 'sales_person_name', label: 'Sales Person' },
        { key: 'parent_sales_person', label: 'Parent Group', render: row => getParentLabel(row.parent_sales_person) },
        { key: 'commission_rate', label: 'Commission %', render: row => Number(row.commission_rate || 0).toFixed(2) },
        { key: 'enabled', label: 'Status', render: row => <ActiveBadge active={!!row.enabled} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Sales Persons"
                description="Manage ERPNext Sales Person records available for POS defaults and checkout assignment."
                onAdd={openAdd}
                addLabel="Add Sales Person"
            />
            {groupOptions.length === 0 && !isLoading && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    No Sales Person groups were found. Create a parent group in ERPNext first, then add sales people here.
                </div>
            )}
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={row => setDeleteTarget(row)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Sales Person' : 'Add Sales Person'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Sales Person Name *"
                        value={form.sales_person_name}
                        onChange={e => setForm(f => ({ ...f, sales_person_name: e.target.value }))}
                        placeholder="e.g. Ahmed Al-Khalifa"
                        required
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Parent Group *</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500"
                            value={form.parent_sales_person || ''}
                            onChange={e => setForm(f => ({ ...f, parent_sales_person: e.target.value }))}
                            required
                        >
                            <option value="">Select parent group…</option>
                            {groupOptions.map(group => (
                                <option key={group.name} value={group.name}>{group.sales_person_name || group.name}</option>
                            ))}
                        </select>
                    </div>
                    <Input
                        label="Commission Rate"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.commission_rate || 0}
                        onChange={e => setForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 0 }))}
                    />
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.enabled}
                            onChange={e => setForm(f => ({ ...f, enabled: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Enabled</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} label="Save Sales Person" />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Sales Person"
                message={`Are you sure you want to delete sales person "${deleteTarget?.sales_person_name || deleteTarget?.name}"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Country Codes
// ─────────────────────────────────────────────────────────────
const CountryCodesSection: React.FC = () => {
    const [data, setData] = useState<CountryCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<CountryCode | null>(null);
    const [form, setForm] = useState<CountryCode>({ country_name: '', code: '', display_order: 0, is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<CountryCode | null>(null);
    const [search, setSearch] = useState('');

    const normalizeAndSort = (rows: any[]): CountryCode[] => {
        const normalized = (rows || []).map((row: any, idx: number) => {
            const order = parseInt(row.display_order, 10);
            return { ...row, display_order: order > 0 ? order : idx + 1 };
        });
        return normalized.sort((a, b) => {
            if (a.display_order !== b.display_order) return a.display_order - b.display_order;
            return (a.country_name || '').localeCompare(b.country_name || '');
        });
    };

    const getNextDisplayOrder = (rows: CountryCode[]): number => {
        const maxOrder = rows.reduce((m, r) => {
            const value = parseInt(r.display_order as any, 10) || 0;
            return value > m ? value : m;
        }, 0);
        return maxOrder + 1;
    };

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getList('DW Country Code', ['name', 'country_name', 'code', 'display_order', 'is_active'], [], 500);
            setData(normalizeAndSort(res));
        } catch (e) {
            // Fallback for environments where display_order isn't migrated yet.
            try {
                const fallback = await getList('DW Country Code', ['name', 'country_name', 'code', 'is_active'], [], 500);
                setData(normalizeAndSort(fallback));
            } catch (fallbackError) {
                console.error('Failed to load country codes:', fallbackError);
                setData([]);
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ country_name: '', code: '', display_order: getNextDisplayOrder(data), is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: CountryCode) => {
        try {
            const full = await getDoc('DW Country Code', row.name!);
            setEditRow(full);
            const fullOrder = parseInt(full.display_order, 10);
            const rowOrder = parseInt(row.display_order as any, 10);
            const resolvedOrder = fullOrder > 0 ? fullOrder : rowOrder > 0 ? rowOrder : 1;
            setForm({
                country_name: full.country_name,
                code: full.code,
                display_order: resolvedOrder,
                is_active: full.is_active,
                name: full.name,
            });
        } catch {
            setEditRow(row);
            const rowOrder = parseInt(row.display_order as any, 10);
            setForm({ ...row, display_order: rowOrder > 0 ? rowOrder : 1 });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const formOrder = parseInt(form.display_order as any, 10);
            const editRowOrder = parseInt((editRow as any)?.display_order, 10);
            const normalizedOrder =
                formOrder > 0
                    ? formOrder
                    : editRowOrder > 0
                        ? editRowOrder
                        : Math.max(1, data.length + (editRow ? 0 : 1));
            await saveDoc({
                doctype: 'DW Country Code',
                ...form,
                display_order: normalizedOrder,
                ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {})
            });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Country Code', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const filtered = search.trim()
        ? data.filter(r =>
            r.country_name.toLowerCase().includes(search.toLowerCase()) ||
            r.code.includes(search)
        )
        : data;

    const columns: Column<CountryCode>[] = [
        { key: 'country_name', label: 'Country' },
        { key: 'code', label: 'Dial Code', render: r => <span className="font-mono font-medium">{r.code}</span> },
        { key: 'display_order', label: 'Order' },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Country Codes"
                description="Manage dial codes shown in the phone number field."
                onAdd={openAdd}
                addLabel="Add Country"
            />
            <div className="mb-4">
                <Input
                    placeholder="Search by country name or dial code…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>
            <ConfigTable data={filtered} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Country Code' : 'Add Country Code'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Country Name *"
                        value={form.country_name}
                        onChange={e => setForm(f => ({ ...f, country_name: e.target.value }))}
                        placeholder="e.g. France"
                        required
                    />
                    <Input
                        label="Dial Code *"
                        value={form.code}
                        onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="e.g. +33"
                        required
                    />
                    <Input
                        label="Display Order"
                        type="number"
                        min={1}
                        value={form.display_order}
                        onChange={e => setForm(f => ({ ...f, display_order: Math.max(1, +e.target.value || 1) }))}
                    />
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Country Code"
                message={`Are you sure you want to delete "${deleteTarget?.country_name} (${deleteTarget?.code})"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Task Templates
// ─────────────────────────────────────────────────────────────
const TaskTemplatesSection: React.FC = () => {
    const [data, setData] = useState<TaskTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<TaskTemplate | null>(null);
    const [form, setForm] = useState<TaskTemplate>({ task_name: '', default_rate: 0, description: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<TaskTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getList('DW Task Template', ['name', 'task_name', 'default_rate', 'description'], [], 200);
            setData(res);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ task_name: '', default_rate: 0, description: '' });
        setIsModalOpen(true);
    };

    const openEdit = async (row: TaskTemplate) => {
        try {
            const full = await getDoc('DW Task Template', row.name!);
            setEditRow(full);
            setForm({ task_name: full.task_name, default_rate: full.default_rate || 0, description: full.description || '', name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Task Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Task Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<TaskTemplate>[] = [
        { key: 'name', label: 'ID' },
        { key: 'task_name', label: 'Task Name' },
        {
            key: 'default_rate', label: 'Default Rate',
            render: r => <span className="font-mono">{Number(r.default_rate || 0).toFixed(2)}</span>
        },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
    ];

    return (
        <div>
            <SectionHeader
                title="Task Templates"
                description="Pre-defined repair tasks with default rates added to repair orders."
                onAdd={openAdd}
                addLabel="Add Task"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Task Template' : 'Add Task Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Task Name *"
                        value={form.task_name}
                        onChange={e => setForm(f => ({ ...f, task_name: e.target.value }))}
                        placeholder="e.g. Movement Service"
                        required
                    />
                    <Input
                        label="Default Rate"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.default_rate}
                        onChange={e => setForm(f => ({ ...f, default_rate: parseFloat(e.target.value) || 0 }))}
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={3}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Brief description of the task…"
                        />
                    </div>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Task Template"
                message={`Are you sure you want to delete task template "${deleteTarget?.task_name}"? Existing repair tasks using this template will be unaffected.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Issue Templates
// ─────────────────────────────────────────────────────────────
const IssueTemplatesSection: React.FC = () => {
    const [data, setData] = useState<IssueTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<IssueTemplate | null>(null);
    const [form, setForm] = useState<IssueTemplate>({ issue_name: '', description: '', suggested_task: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<IssueTemplate | null>(null);
    const [taskOptions, setTaskOptions] = useState<{ name: string; task_name: string }[]>([]);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [issues, tasks] = await Promise.all([
                getList('DW Issue Template', ['name', 'issue_name', 'description', 'suggested_task', 'is_active'], [], 200),
                getList('DW Task Template', ['name', 'task_name'], [], 200),
            ]);
            setData(issues);
            setTaskOptions(tasks);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ issue_name: '', description: '', suggested_task: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: IssueTemplate) => {
        try {
            const full = await getDoc('DW Issue Template', row.name!);
            setEditRow(full);
            setForm({ issue_name: full.issue_name, description: full.description || '', suggested_task: full.suggested_task || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Issue Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Issue Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const getTaskLabel = (name: string) => {
        const t = taskOptions.find(t => t.name === name);
        return t ? t.task_name : name || '—';
    };

    const columns: Column<IssueTemplate>[] = [
        { key: 'issue_name', label: 'Issue Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'suggested_task', label: 'Suggested Task', render: r => <span className="text-gray-600">{getTaskLabel(r.suggested_task)}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Issue Templates"
                description="Common watch issues that can be selected when creating a repair order."
                onAdd={openAdd}
                addLabel="Add Issue"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Issue Template' : 'Add Issue Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Issue Name *"
                        value={form.issue_name}
                        onChange={e => setForm(f => ({ ...f, issue_name: e.target.value }))}
                        placeholder="e.g. Crystal Scratch"
                        required
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={2}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Brief description of the issue…"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Suggested Task</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            value={form.suggested_task}
                            onChange={e => setForm(f => ({ ...f, suggested_task: e.target.value }))}
                        >
                            <option value="">None</option>
                            {taskOptions.map(t => (
                                <option key={t.name} value={t.name}>{t.task_name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Automatically suggest this task when the issue is selected.</p>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Issue Template"
                message={`Are you sure you want to delete issue template "${deleteTarget?.issue_name}"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Watch Condition Templates
// ─────────────────────────────────────────────────────────────
const WatchConditionTemplatesSection: React.FC = () => {
    const [data, setData] = useState<WatchConditionTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<WatchConditionTemplate | null>(null);
    const [form, setForm] = useState<WatchConditionTemplate>({ condition_name: '', description: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WatchConditionTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const templates = await getList('DW Watch Condition Template', ['name', 'condition_name', 'description', 'is_active'], [], 250);
            setData(templates);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ condition_name: '', description: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: WatchConditionTemplate) => {
        try {
            const full = await getDoc('DW Watch Condition Template', row.name!);
            setEditRow(full);
            setForm({ condition_name: full.condition_name, description: full.description || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Watch Condition Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Watch Condition Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<WatchConditionTemplate>[] = [
        { key: 'condition_name', label: 'Condition Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Watch Condition Templates"
                description="Pre-existing watch condition presets shown in the intake checklist for repair orders."
                onAdd={openAdd}
                addLabel="Add Condition"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Watch Condition Template' : 'Add Watch Condition Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Condition Name *"
                        value={form.condition_name}
                        onChange={e => setForm(f => ({ ...f, condition_name: e.target.value }))}
                        placeholder="e.g. Scratches on crystal"
                        required
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={2}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional guidance for staff using this condition..."
                        />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Watch Condition Template"
                message={`Are you sure you want to delete watch condition template "${deleteTarget?.condition_name}"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

const DiagnosisSummaryTemplatesSection: React.FC = () => {
    const [data, setData] = useState<DiagnosisSummaryTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<DiagnosisSummaryTemplate | null>(null);
    const [form, setForm] = useState<DiagnosisSummaryTemplate>({ summary_name: '', description: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<DiagnosisSummaryTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const templates = await getList('DW Diagnosis Summary Template', ['name', 'summary_name', 'description', 'is_active'], [], 250);
            setData(templates);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ summary_name: '', description: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: DiagnosisSummaryTemplate) => {
        try {
            const full = await getDoc('DW Diagnosis Summary Template', row.name!);
            setEditRow(full);
            setForm({ summary_name: full.summary_name, description: full.description || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Diagnosis Summary Template', ...form, is_active: 1, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Diagnosis Summary Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<DiagnosisSummaryTemplate>[] = [
        { key: 'summary_name', label: 'Summary Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Diagnosis Summary Templates"
                description="Diagnosis summary chips shown in technician diagnosis sections."
                onAdd={openAdd}
                addLabel="Add Summary"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Diagnosis Summary Template' : 'Add Diagnosis Summary Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input label="Summary Name *" value={form.summary_name} onChange={e => setForm(f => ({ ...f, summary_name: e.target.value }))} placeholder="e.g. Circuit Damage" required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional guidance for technicians..." />
                    </div>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Diagnosis Summary Template" message={`Are you sure you want to delete diagnosis summary template "${deleteTarget?.summary_name}"?`} confirmText="Delete" variant="danger" />
        </div>
    );
};

const RecommendedWorkTemplatesSection: React.FC = () => {
    const [data, setData] = useState<RecommendedWorkTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<RecommendedWorkTemplate | null>(null);
    const [form, setForm] = useState<RecommendedWorkTemplate>({ work_name: '', description: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<RecommendedWorkTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const templates = await getList('DW Recommended Work Template', ['name', 'work_name', 'description', 'is_active'], [], 250);
            setData(templates);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ work_name: '', description: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: RecommendedWorkTemplate) => {
        try {
            const full = await getDoc('DW Recommended Work Template', row.name!);
            setEditRow(full);
            setForm({ work_name: full.work_name, description: full.description || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Recommended Work Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Recommended Work Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<RecommendedWorkTemplate>[] = [
        { key: 'work_name', label: 'Work Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Recommended Work Templates"
                description="Recommended work presets shown in technician diagnosis sections."
                onAdd={openAdd}
                addLabel="Add Work"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Recommended Work Template' : 'Add Recommended Work Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input label="Work Name *" value={form.work_name} onChange={e => setForm(f => ({ ...f, work_name: e.target.value }))} placeholder="e.g. Complete Movement Service" required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional guidance for technicians..." />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 text-purple-600 rounded"
                            checked={!!form.is_active}
                            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))}
                        />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Recommended Work Template" message={`Are you sure you want to delete recommended work template "${deleteTarget?.work_name}"?`} confirmText="Delete" variant="danger" />
        </div>
    );
};

const MovementTypeTemplatesSection: React.FC = () => {
    const [data, setData] = useState<MovementTypeTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<MovementTypeTemplate | null>(null);
    const [form, setForm] = useState<MovementTypeTemplate>({ movement_type: '', description: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MovementTypeTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const templates = await getList('DW Movement Type Template', ['name', 'movement_type', 'description', 'is_active'], [], 250);
            setData(templates);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ movement_type: '', description: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: MovementTypeTemplate) => {
        try {
            const full = await getDoc('DW Movement Type Template', row.name!);
            setEditRow(full);
            setForm({ movement_type: full.movement_type, description: full.description || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Movement Type Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Movement Type Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<MovementTypeTemplate>[] = [
        { key: 'movement_type', label: 'Movement Type' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Movement Type Templates"
                description="Movement type chips shown in technician diagnosis sections."
                onAdd={openAdd}
                addLabel="Add Movement Type"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Movement Type Template' : 'Add Movement Type Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input label="Movement Type *" value={form.movement_type} onChange={e => setForm(f => ({ ...f, movement_type: e.target.value }))} placeholder="e.g. Quartz movement" required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional guidance for technicians..." />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 text-purple-600 rounded" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Movement Type Template" message={`Are you sure you want to delete movement type template "${deleteTarget?.movement_type}"?`} confirmText="Delete" variant="danger" />
        </div>
    );
};

const MovementCaliberTemplatesSection: React.FC = () => {
    const [data, setData] = useState<MovementCaliberTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<MovementCaliberTemplate | null>(null);
    const [form, setForm] = useState<MovementCaliberTemplate>({ caliber_code: '', description: '', is_active: 1 });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MovementCaliberTemplate | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const templates = await getList('DW Movement Caliber Template', ['name', 'caliber_code', 'description', 'is_active'], [], 400);
            setData(templates);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ caliber_code: '', description: '', is_active: 1 });
        setIsModalOpen(true);
    };

    const openEdit = async (row: MovementCaliberTemplate) => {
        try {
            const full = await getDoc('DW Movement Caliber Template', row.name!);
            setEditRow(full);
            setForm({ caliber_code: full.caliber_code, description: full.description || '', is_active: full.is_active, name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Movement Caliber Template', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Movement Caliber Template', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<MovementCaliberTemplate>[] = [
        { key: 'caliber_code', label: 'Caliber Code' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
        { key: 'is_active', label: 'Status', render: r => <ActiveBadge active={!!r.is_active} /> },
    ];

    return (
        <div>
            <SectionHeader
                title="Movement Caliber Templates"
                description="Caliber chips shown in technician diagnosis sections."
                onAdd={openAdd}
                addLabel="Add Caliber"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Movement Caliber Template' : 'Add Movement Caliber Template'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input label="Caliber Code *" value={form.caliber_code} onChange={e => setForm(f => ({ ...f, caliber_code: e.target.value }))} placeholder="e.g. 2235" required />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional guidance for technicians..." />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" className="w-4 h-4 text-purple-600 rounded" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} />
                        <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Delete Movement Caliber Template" message={`Are you sure you want to delete movement caliber template "${deleteTarget?.caliber_code}"?`} confirmText="Delete" variant="danger" />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Watch Brands
// ─────────────────────────────────────────────────────────────
const WatchBrandsSection: React.FC = () => {
    const [data, setData] = useState<WatchBrand[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<WatchBrand | null>(null);
    const [form, setForm] = useState<WatchBrand>({ brand_name: '', description: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WatchBrand | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await getList('DW Watch Brand', ['name', 'brand_name', 'description'], [], 200);
            setData(res);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ brand_name: '', description: '' });
        setIsModalOpen(true);
    };

    const openEdit = async (row: WatchBrand) => {
        try {
            const full = await getDoc('DW Watch Brand', row.name!);
            setEditRow(full);
            setForm({ brand_name: full.brand_name, description: full.description || '', name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Watch Brand', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Watch Brand', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const columns: Column<WatchBrand>[] = [
        { key: 'brand_name', label: 'Brand Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-sm block">{r.description || '—'}</span> },
    ];

    return (
        <div>
            <SectionHeader
                title="Watch Brands"
                description="Manage watch brands available when creating repair orders."
                onAdd={openAdd}
                addLabel="Add Brand"
            />
            <ConfigTable data={data} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Watch Brand' : 'Add Watch Brand'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <Input
                        label="Brand Name *"
                        value={form.brand_name}
                        onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                        placeholder="e.g. Rolex"
                        required
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={2}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional brand notes…"
                        />
                    </div>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Watch Brand"
                message={`Are you sure you want to delete brand "${deleteTarget?.brand_name}"? All associated models will also become unlinked.`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: Watch Models
// ─────────────────────────────────────────────────────────────
const WatchModelsSection: React.FC = () => {
    const [data, setData] = useState<WatchModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editRow, setEditRow] = useState<WatchModel | null>(null);
    const [form, setForm] = useState<WatchModel>({ brand: '', model_name: '', description: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WatchModel | null>(null);
    const [brandOptions, setBrandOptions] = useState<{ name: string; brand_name: string }[]>([]);
    const [brandFilter, setBrandFilter] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [models, brands] = await Promise.all([
                getList('DW Watch Model', ['name', 'brand', 'model_name', 'description'], [], 500),
                getList('DW Watch Brand', ['name', 'brand_name'], [], 200),
            ]);
            setData(models);
            setBrandOptions(brands);
        } catch (e) { console.error(e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditRow(null);
        setForm({ brand: '', model_name: '', description: '' });
        setIsModalOpen(true);
    };

    const openEdit = async (row: WatchModel) => {
        try {
            const full = await getDoc('DW Watch Model', row.name!);
            setEditRow(full);
            setForm({ brand: full.brand, model_name: full.model_name, description: full.description || '', name: full.name });
        } catch { setEditRow(row); setForm({ ...row }); }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await saveDoc({ doctype: 'DW Watch Model', ...form, ...(editRow ? { modified: (editRow as any).modified, creation: (editRow as any).creation, owner: (editRow as any).owner } : {}) });
            setIsModalOpen(false);
            await load();
        } catch (e) { console.error(e); alert('Error saving: ' + e); }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget?.name) return;
        try {
            await deleteDoc('DW Watch Model', deleteTarget.name);
            setDeleteTarget(null);
            await load();
        } catch (e) { alert('Error deleting: ' + e); }
    };

    const getBrandLabel = (name: string) => {
        const b = brandOptions.find(b => b.name === name);
        return b ? b.brand_name : name || '—';
    };

    const filtered = brandFilter ? data.filter(r => r.brand === brandFilter) : data;

    const columns: Column<WatchModel>[] = [
        { key: 'brand', label: 'Brand', render: r => <span className="font-medium text-gray-800">{getBrandLabel(r.brand)}</span> },
        { key: 'model_name', label: 'Model Name' },
        { key: 'description', label: 'Description', render: r => <span className="text-gray-500 truncate max-w-xs block">{r.description || '—'}</span> },
    ];

    return (
        <div>
            <SectionHeader
                title="Watch Models"
                description="Manage watch models grouped by brand."
                onAdd={openAdd}
                addLabel="Add Model"
            />
            {brandOptions.length > 0 && (
                <div className="mb-4 flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-600">Filter by brand:</label>
                    <select
                        className="p-2 border border-gray-300 rounded-md text-sm focus:ring-purple-500 focus:border-purple-500"
                        value={brandFilter}
                        onChange={e => setBrandFilter(e.target.value)}
                    >
                        <option value="">All brands</option>
                        {brandOptions.map(b => (
                            <option key={b.name} value={b.name}>{b.brand_name}</option>
                        ))}
                    </select>
                    {brandFilter && (
                        <span className="text-sm text-gray-500">{filtered.length} model{filtered.length !== 1 ? 's' : ''}</span>
                    )}
                </div>
            )}
            <ConfigTable data={filtered} isLoading={isLoading} columns={columns} onEdit={openEdit} onDelete={r => setDeleteTarget(r)} />

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editRow ? 'Edit Watch Model' : 'Add Watch Model'}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand <span className="text-red-500">*</span></label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            value={form.brand}
                            onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                            required
                        >
                            <option value="">Select brand…</option>
                            {brandOptions.map(b => (
                                <option key={b.name} value={b.name}>{b.brand_name}</option>
                            ))}
                        </select>
                    </div>
                    <Input
                        label="Model Name *"
                        value={form.model_name}
                        onChange={e => setForm(f => ({ ...f, model_name: e.target.value }))}
                        placeholder="e.g. Submariner"
                        required
                    />
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-sm"
                            rows={2}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Optional model notes…"
                        />
                    </div>
                    <ModalFooter onCancel={() => setIsModalOpen(false)} isSaving={isSaving} />
                </form>
            </Modal>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Watch Model"
                message={`Are you sure you want to delete model "${deleteTarget?.model_name}"?`}
                confirmText="Delete"
                variant="danger"
            />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Section: General (Logo + Currency Info)
// ─────────────────────────────────────────────────────────────
const GeneralSection: React.FC = () => {
    const { config, refreshConfig } = useAppConfig();
    const [logoPreview, setLogoPreview] = useState<string>(config.logoUrl);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoadingGeneralConfig, setIsLoadingGeneralConfig] = useState(true);
    const [isSavingGeneralConfig, setIsSavingGeneralConfig] = useState(false);
    const [generalConfig, setGeneralConfig] = useState<GeneralConfiguration>({
        company_name: '',
        company_phone: '',
        company_email: '',
        company_website: '',
        company_address: '',
        cr_number: '',
        vat_registration_number: '',
        repair_receipt_subtitle: '',
        whatsapp_default_country_code: '',
    });
    const [saveMsg, setSaveMsg] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setLogoPreview(config.logoUrl); }, [config.logoUrl]);

    const loadGeneralConfig = useCallback(async () => {
        setIsLoadingGeneralConfig(true);
        setSaveMsg('');
        try {
            const response = await getGeneralConfiguration();
            setGeneralConfig(response.config);
        } catch (err: any) {
            setSaveMsg(err?.message || 'Failed to load general configuration.');
        }
        setIsLoadingGeneralConfig(false);
    }, []);

    useEffect(() => {
        loadGeneralConfig();
    }, [loadGeneralConfig]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        setSaveMsg('');
        try {
            const url = await uploadFile(file);
            await saveLogoUrl(url);
            setLogoPreview(url);
            await refreshConfig();
            setSaveMsg('Logo saved successfully.');
        } catch (err) {
            setSaveMsg('Upload failed. Please try again.');
        }
        setIsUploading(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleRemoveLogo = async () => {
        setIsUploading(true);
        setSaveMsg('');
        try {
            await saveLogoUrl('');
            setLogoPreview('');
            await refreshConfig();
            setSaveMsg('Logo removed.');
        } catch { setSaveMsg('Failed to remove logo.'); }
        setIsUploading(false);
    };

    const updateGeneralConfig = <K extends keyof GeneralConfiguration>(field: K, value: GeneralConfiguration[K]) => {
        setGeneralConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleSaveGeneralConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingGeneralConfig(true);
        setSaveMsg('');
        try {
            const response = await saveGeneralConfiguration(generalConfig);
            setGeneralConfig(response.config);
            setSaveMsg('General configuration saved successfully.');
            await refreshConfig();
        } catch (err: any) {
            setSaveMsg(err?.message || 'Failed to save general configuration.');
        }
        setIsSavingGeneralConfig(false);
    };

    return (
        <div className="space-y-8">
            {/* Logo */}
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">Company Logo</h3>
                <p className="text-sm text-gray-500 mb-5">
                    Shown in the sidebar, printed reports, and invoices. Recommended: PNG/SVG, at least 200×60 px.
                </p>
                <div className="flex items-start gap-6">
                    {/* Preview box */}
                    <div className="flex-shrink-0 w-52 h-24 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                        {logoPreview ? (
                            <img
                                src={logoPreview}
                                alt="Company logo"
                                className="max-h-20 max-w-full object-contain p-2"
                            />
                        ) : (
                            <div className="text-center text-gray-400">
                                <svg className="w-8 h-8 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-xs">No logo</p>
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-3">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={isUploading}
                            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                        >
                            {isUploading ? <><Spinner size="sm" /> Uploading…</> : (
                                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Upload Logo</>
                            )}
                        </button>
                        {logoPreview && (
                            <button
                                onClick={handleRemoveLogo}
                                disabled={isUploading}
                                className="text-red-500 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                            >
                                Remove logo
                            </button>
                        )}
                        {saveMsg && (
                            <p className={`text-xs font-medium ${saveMsg.includes('failed') || saveMsg.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>
                                {saveMsg}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Currency Info (read-only, from ERPNext) */}
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">Currency</h3>
                <p className="text-sm text-gray-500 mb-5">
                    Fetched from ERPNext System Settings. Change the default currency directly in ERPNext to update this.
                </p>
                <div className="grid grid-cols-3 gap-4">
                    {[
                        { label: 'Currency Code', value: config.currencyCode },
                        { label: 'Symbol', value: config.currencySymbol },
                        { label: 'Decimal Places', value: String(config.decimalPlaces) },
                    ].map(item => (
                        <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{item.label}</p>
                            <p className="text-xl font-bold text-gray-800 font-mono">{item.value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSaveGeneralConfig} className="space-y-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">General Configuration</h3>
                    <p className="text-sm text-gray-500 mb-5">
                        These values are used by the app's customer-facing print formats.
                    </p>
                </div>

                {isLoadingGeneralConfig ? <LoadingSpinner /> : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Company Name"
                                value={generalConfig.company_name}
                                onChange={(e) => updateGeneralConfig('company_name', e.target.value)}
                                required
                            />
                            <Input
                                label="Phone Number"
                                value={generalConfig.company_phone}
                                onChange={(e) => updateGeneralConfig('company_phone', e.target.value)}
                            />
                            <Input
                                label="Email"
                                value={generalConfig.company_email}
                                onChange={(e) => updateGeneralConfig('company_email', e.target.value)}
                            />
                            <Input
                                label="Website"
                                value={generalConfig.company_website}
                                onChange={(e) => updateGeneralConfig('company_website', e.target.value)}
                            />
                            <Input
                                label="CR Number"
                                value={generalConfig.cr_number}
                                onChange={(e) => updateGeneralConfig('cr_number', e.target.value)}
                            />
                            <Input
                                label="VAT Registration Number"
                                value={generalConfig.vat_registration_number}
                                onChange={(e) => updateGeneralConfig('vat_registration_number', e.target.value)}
                            />
                            <div className="md:col-span-2">
                                <Input
                                    label="Repair Receipt Subtitle"
                                    value={generalConfig.repair_receipt_subtitle}
                                    onChange={(e) => updateGeneralConfig('repair_receipt_subtitle', e.target.value)}
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                <textarea
                                    value={generalConfig.company_address}
                                    onChange={(e) => updateGeneralConfig('company_address', e.target.value)}
                                    rows={4}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                                />
                            </div>
                        </div>

                        {/* WhatsApp sub-section */}
                        <div className="mt-4 pt-4 border-t border-gray-100">
                            <h4 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">WhatsApp</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Input
                                        label="Default Country Code"
                                        placeholder="973"
                                        value={generalConfig.whatsapp_default_country_code || ''}
                                        onChange={(e) => updateGeneralConfig('whatsapp_default_country_code', e.target.value)}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Digits only (e.g. 973 for Bahrain). Prepended to local mobile numbers when sending WhatsApp messages.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2 border-t border-gray-100">
                            {saveMsg && (
                                <p className={`text-sm ${saveMsg.includes('Failed') || saveMsg.includes('failed') ? 'text-red-500' : 'text-green-600'}`}>
                                    {saveMsg}
                                </p>
                            )}
                            <div className="ml-auto">
                                <button
                                    type="submit"
                                    disabled={isSavingGeneralConfig}
                                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {isSavingGeneralConfig ? <><Spinner size="sm" /> Saving…</> : 'Save General Configuration'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
};

const WORKFLOW_CARD_META: Array<{ key: keyof InvoiceWorkflowConfiguration; label: string; workflow: string; field: 'naming_series' | 'print_format' }> = [
    { key: 'repair_service_naming_series', workflow: 'Repair / Service Invoice', label: 'Naming Series', field: 'naming_series' },
    { key: 'repair_service_print_format', workflow: 'Repair / Service Invoice', label: 'Print Format', field: 'print_format' },
    { key: 'pos_standard_naming_series', workflow: 'POS Invoice - Standard Tax', label: 'Naming Series', field: 'naming_series' },
    { key: 'pos_standard_print_format', workflow: 'POS Invoice - Standard Tax', label: 'Print Format', field: 'print_format' },
    { key: 'pos_pms_naming_series', workflow: 'POS Invoice - PMS Scheme', label: 'Naming Series', field: 'naming_series' },
    { key: 'pos_pms_print_format', workflow: 'POS Invoice - PMS Scheme', label: 'Print Format', field: 'print_format' },
];

const InvoiceWorkflowsSection: React.FC = () => {
    const [config, setConfig] = useState<InvoiceWorkflowConfiguration | null>(null);
    const [options, setOptions] = useState<InvoiceWorkflowConfigurationOptions | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setSaveMsg('');
        try {
            const data = await getInvoiceWorkflowConfiguration();
            setConfig(data.config);
            setOptions(data.options);
        } catch (e: any) {
            setSaveMsg(e?.message || 'Failed to load invoice workflow settings.');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateConfig = <K extends keyof InvoiceWorkflowConfiguration>(field: K, value: InvoiceWorkflowConfiguration[K]) => {
        setConfig(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;
        setIsSaving(true);
        setSaveMsg('');
        try {
            const result = await saveInvoiceWorkflowConfiguration(config);
            setConfig(result.config);
            setSaveMsg('Invoice workflow settings saved successfully.');
        } catch (e: any) {
            setSaveMsg(e?.message || 'Failed to save invoice workflow settings.');
        }
        setIsSaving(false);
    };

    if (isLoading) return <LoadingSpinner />;
    if (!config || !options) return <EmptyState message={saveMsg || 'Unable to load invoice workflow settings.'} />;

    return (
        <form onSubmit={handleSave} className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">Invoice Workflows</h3>
                <p className="text-sm text-gray-500">Control the naming series and print format used by each Sales Invoice workflow from one place.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div>
                        <h4 className="text-base font-semibold text-gray-900">Repair / Service Invoice</h4>
                        <p className="text-sm text-gray-500 mt-1">Used when a Sales Invoice is created from a Repair Order.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Naming Series</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.repair_service_naming_series}
                            onChange={e => updateConfig('repair_service_naming_series', e.target.value)}
                        >
                            <option value="">Use ERPNext default</option>
                            {options.naming_series.map(series => <option key={series} value={series}>{series}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Print Format</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.repair_service_print_format}
                            onChange={e => updateConfig('repair_service_print_format', e.target.value)}
                        >
                            <option value="Standard">Standard</option>
                            {options.print_formats.map(format => <option key={format} value={format}>{format}</option>)}
                        </select>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div>
                        <h4 className="text-base font-semibold text-gray-900">POS Invoice - Standard Tax</h4>
                        <p className="text-sm text-gray-500 mt-1">Applied to normal POS sales that use standard tax handling.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Naming Series</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.pos_standard_naming_series}
                            onChange={e => updateConfig('pos_standard_naming_series', e.target.value)}
                        >
                            <option value="">Use ERPNext default</option>
                            {options.naming_series.map(series => <option key={series} value={series}>{series}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Print Format</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.pos_standard_print_format}
                            onChange={e => updateConfig('pos_standard_print_format', e.target.value)}
                        >
                            <option value="Standard">Standard</option>
                            {options.print_formats.map(format => <option key={format} value={format}>{format}</option>)}
                        </select>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div>
                        <h4 className="text-base font-semibold text-gray-900">POS Invoice - PMS Scheme</h4>
                        <p className="text-sm text-gray-500 mt-1">Used for POS invoices containing PMS items. PMS tax rules still remain under the PMS & VAT tab.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Naming Series</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.pos_pms_naming_series}
                            onChange={e => updateConfig('pos_pms_naming_series', e.target.value)}
                        >
                            <option value="">Use ERPNext default</option>
                            {options.naming_series.map(series => <option key={series} value={series}>{series}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Print Format</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.pos_pms_print_format}
                            onChange={e => updateConfig('pos_pms_print_format', e.target.value)}
                        >
                            <option value="Standard">Standard</option>
                            {options.print_formats.map(format => <option key={format} value={format}>{format}</option>)}
                        </select>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 space-y-4">
                    <div>
                        <h4 className="text-base font-semibold text-gray-900">Repair Order</h4>
                        <p className="text-sm text-gray-500 mt-1">Print format for thermal bag labels (1.5in × 1in) used to track repair jobs.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bag Label Print Format</label>
                        <select
                            className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                            value={config.ro_label_print_format}
                            onChange={e => updateConfig('ro_label_print_format', e.target.value)}
                        >
                            <option value="">Select format…</option>
                            {options.repair_order_print_formats.map(format => <option key={format} value={format}>{format}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {WORKFLOW_CARD_META.map(item => (
                    <div key={item.key} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{item.workflow}</p>
                        <p className="text-xs text-gray-500 mb-2">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 break-words">{config[item.key] || 'ERPNext default / fallback'}</p>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
                <p className={`text-sm ${saveMsg.toLowerCase().includes('fail') ? 'text-red-500' : 'text-green-600'}`}>
                    {saveMsg || 'Save changes to apply centralized invoice identity and print behavior.'}
                </p>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                    {isSaving ? <><Spinner size="sm" /> Saving…</> : 'Save Invoice Workflows'}
                </button>
            </div>
        </form>
    );
};

const PmsVatSection: React.FC = () => {
    const [config, setConfig] = useState<PmsConfiguration | null>(null);
    const [options, setOptions] = useState<PmsConfigurationOptions | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setSaveMsg('');
        try {
            const data = await getPmsConfiguration();
            setConfig(data.config);
            setOptions(data.options);
        } catch (e: any) {
            setSaveMsg(e?.message || 'Failed to load PMS settings.');
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const updateConfig = <K extends keyof PmsConfiguration>(field: K, value: PmsConfiguration[K]) => {
        setConfig(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;
        setIsSaving(true);
        setSaveMsg('');
        try {
            const result = await savePmsConfiguration(config);
            setConfig(result.config);
            setSaveMsg('PMS/VAT settings saved successfully.');
        } catch (e: any) {
            setSaveMsg(e?.message || 'Failed to save PMS/VAT settings.');
        }
        setIsSaving(false);
    };

    if (isLoading) return <LoadingSpinner />;
    if (!config || !options) return <EmptyState message={saveMsg || 'Unable to load PMS/VAT settings.'} />;

    return (
        <form onSubmit={handleSave} className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1">PMS & VAT Configuration</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="flex items-center gap-3 cursor-pointer select-none bg-gray-50 border border-gray-100 rounded-xl p-4 md:col-span-2">
                    <input
                        type="checkbox"
                        className="w-4 h-4 text-purple-600 rounded"
                        checked={!!config.pms_enabled}
                        onChange={e => updateConfig('pms_enabled', e.target.checked ? 1 : 0)}
                    />
                    <div>
                        <span className="text-sm font-medium text-gray-800">Enable Profit Margin Scheme</span>
                        <p className="text-xs text-gray-500 mt-0.5">When enabled, every PMS/VAT field below must be explicitly configured.</p>
                    </div>
                </label>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PMS Item Group</label>
                    <select
                        className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                        value={config.pms_item_group}
                        onChange={e => updateConfig('pms_item_group', e.target.value)}
                    >
                        <option value="">Select item group…</option>
                        {options.item_groups.map(group => <option key={group} value={group}>{group}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PMS VAT Account</label>
                    <select
                        className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                        value={config.pms_vat_account}
                        onChange={e => updateConfig('pms_vat_account', e.target.value)}
                    >
                        <option value="">Select tax account…</option>
                        {options.tax_accounts.map(account => <option key={account} value={account}>{account}</option>)}
                    </select>
                </div>

                <Input
                    label="PMS VAT Divisor"
                    type="number"
                    min={0.000001}
                    step="0.000001"
                    value={config.pms_vat_divisor}
                    onChange={e => updateConfig('pms_vat_divisor', Number(e.target.value) || 0)}
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Standard Sales Taxes Template</label>
                    <select
                        className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                        value={config.standard_sales_taxes_template}
                        onChange={e => updateConfig('standard_sales_taxes_template', e.target.value)}
                    >
                        <option value="">Use ERPNext default / none</option>
                        {options.sales_taxes_templates.map(template => <option key={template} value={template}>{template}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Standard Item Tax Template</label>
                    <select
                        className="w-full p-2.5 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white"
                        value={config.standard_item_tax_template}
                        onChange={e => updateConfig('standard_item_tax_template', e.target.value)}
                    >
                        <option value="">None</option>
                        {options.item_tax_templates.map(template => <option key={template} value={template}>{template}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PMS Print Format</label>
                    <div className="w-full p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700">
                        {config.pms_print_format || 'Configured in Invoice Workflows'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Manage the PMS invoice print format in the Invoice Workflows tab.</p>
                </div>

                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">PMS Disclaimer</label>
                    <textarea
                        className="w-full min-h-[96px] p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-purple-500 focus:border-purple-500 bg-white text-sm"
                        value={config.pms_disclaimer}
                        onChange={e => updateConfig('pms_disclaimer', e.target.value)}
                        placeholder="Enter the customer-facing PMS disclaimer"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'PMS Item Group', value: config.pms_item_group || 'Not set' },
                    { label: 'PMS VAT Account', value: config.pms_vat_account || 'Not set' },
                    { label: 'PMS Print Format', value: config.pms_print_format || 'Configured in Invoice Workflows' },
                ].map(item => (
                    <div key={item.label} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-800 break-words">{item.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
                <p className={`text-sm ${saveMsg.toLowerCase().includes('fail') ? 'text-red-500' : 'text-green-600'}`}>
                    {saveMsg || 'Save changes to apply the configured PMS/VAT behavior.'}
                </p>
                <button
                    type="submit"
                    disabled={isSaving}
                    className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                    {isSaving ? <><Spinner size="sm" /> Saving…</> : 'Save PMS/VAT Settings'}
                </button>
            </div>
        </form>
    );
};

// ─────────────────────────────────────────────────────────────
// Tab navigation config
// ─────────────────────────────────────────────────────────────
// WhatsApp Templates Section
// ─────────────────────────────────────────────────────────────

// These must mirror PLACEHOLDER_DEFINITIONS / PLACEHOLDER_SAMPLES in service.py.
// Used for client-side live preview without a round-trip.
const DEFAULT_PLACEHOLDERS: WhatsAppPlaceholder[] = [
    { token: '{{1}}', label: 'Customer Name',    sample: 'Abdullah Al-Rashid' },
    { token: '{{2}}', label: 'Order ID',         sample: 'RO-2024-0042' },
    { token: '{{3}}', label: 'Current Status',   sample: 'Ready for Collection' },
    { token: '{{4}}', label: 'Shop Name',        sample: 'Watch Doctor' },
    { token: '{{5}}', label: 'Promised Date',    sample: '20 Apr 2026' },
    { token: '{{6}}', label: 'Watch Details',    sample: 'Omega Seamaster (SN: A12345)' },
    { token: '{{7}}', label: 'Recommended Works', sample: 'Movement service, Gasket replacement' },
    { token: '{{8}}', label: 'Estimate Total',   sample: 'BHD 68.000' },
    { token: '{{9}}', label: 'Diagnosis Summary', sample: 'Circuit damage, Movement wear' },
];

function applyPreview(body: string, placeholders: WhatsAppPlaceholder[]): string {
    return placeholders.reduce((acc, p) => acc.split(p.token).join(p.sample), body);
}

const WhatsAppSection: React.FC = () => {
    const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
    const [config, setConfig] = useState<WhatsAppConfig | null>(null);
    const [placeholders, setPlaceholders] = useState<WhatsAppPlaceholder[]>(DEFAULT_PLACEHOLDERS);
    const [isLoading, setIsLoading] = useState(true);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [editActive, setEditActive] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const [tpls, cfg, phDefs] = await Promise.allSettled([
                getWhatsAppTemplates(),
                getWhatsAppConfig(),
                getTemplatePlaceholders(),
            ]);
            if (tpls.status === 'fulfilled') setTemplates(tpls.value);
            if (cfg.status === 'fulfilled') setConfig(cfg.value);
            if (phDefs.status === 'fulfilled' && phDefs.value.length > 0) setPlaceholders(phDefs.value);
        } catch {
            // feature may not be configured yet
        }
        setIsLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleEdit = (t: WhatsAppTemplate) => {
        setEditingKey(t.notification_key);
        setEditBody(t.message_body);
        setEditActive(t.is_active);
        setShowPreview(false);
    };

    const handleSave = async () => {
        if (!editingKey) return;
        setIsSaving(true);
        try {
            await saveWhatsAppTemplate(editingKey, editBody, editActive);
            setEditingKey(null);
            await load();
        } catch (e: any) {
            alert(e.message || 'Failed to save template');
        }
        setIsSaving(false);
    };

    const handleInsertPlaceholder = (token: string) => {
        const el = textareaRef.current;
        if (!el) {
            setEditBody(prev => prev + token);
            return;
        }
        const start = el.selectionStart ?? editBody.length;
        const end = el.selectionEnd ?? editBody.length;
        const updated = editBody.slice(0, start) + token + editBody.slice(end);
        setEditBody(updated);
        // Restore cursor after inserted token
        requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + token.length;
            el.focus();
        });
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">WhatsApp Notifications</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Configure message templates sent to customers via WhatsApp.</p>
                </div>
            </div>

            {/* Status Banner */}
            <div className={`mb-5 p-4 rounded-xl border ${config?.enabled ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{config?.enabled ? '✅' : '⚠️'}</span>
                    <div>
                        <p className={`font-semibold ${config?.enabled ? 'text-green-800' : 'text-amber-800'}`}>
                            {config?.enabled ? 'WhatsApp Notifications Enabled' : 'WhatsApp Notifications Disabled'}
                        </p>
                        <p className="text-sm text-gray-500">
                            {config?.enabled
                                ? `Cooldown: ${config.cooldown_minutes} minutes between duplicate notifications`
                                : 'Set whatsapp_enabled = true in site_config.json to enable.'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Placeholder Legend */}
            <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Available Placeholders</p>
                <div className="flex flex-wrap gap-2">
                    {placeholders.map(p => (
                        <span key={p.token} className="inline-flex items-center gap-1.5 bg-white border border-blue-200 rounded-lg px-2.5 py-1 text-xs">
                            <code className="font-mono font-semibold text-purple-700">{p.token}</code>
                            <span className="text-gray-500">= {p.label}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Templates */}
            <div className="space-y-3">
                {templates.map(t => (
                    <div key={t.notification_key} className="border rounded-xl p-4" style={{ borderColor: '#F0EEEB' }}>
                        {editingKey === t.notification_key ? (
                            <div>
                                {/* Edit header */}
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span className="font-semibold text-gray-900">{t.label}</span>
                                        <span className="text-xs text-gray-400 ml-2">({t.notification_key})</span>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={editActive === 1}
                                            onChange={e => setEditActive(e.target.checked ? 1 : 0)}
                                            className="rounded"
                                        />
                                        Active
                                    </label>
                                </div>

                                {/* Quick-insert placeholder chips */}
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {placeholders.map(p => (
                                        <button
                                            key={p.token}
                                            type="button"
                                            onClick={() => handleInsertPlaceholder(p.token)}
                                            title={`Insert ${p.label} (${p.token})`}
                                            className="inline-flex items-center text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded px-2 py-0.5 font-mono transition-colors"
                                        >
                                            + {p.token}
                                        </button>
                                    ))}
                                </div>

                                {/* Textarea */}
                                <textarea
                                    ref={textareaRef}
                                    value={editBody}
                                    onChange={e => setEditBody(e.target.value)}
                                    rows={4}
                                    className="w-full border rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
                                    style={{ borderColor: '#E0DCD7' }}
                                />

                                {/* Preview toggle */}
                                <div className="mt-2 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowPreview(v => !v)}
                                        className="text-xs text-purple-600 hover:text-purple-800 font-medium underline underline-offset-2"
                                    >
                                        {showPreview ? 'Hide Preview' : 'Show Preview'}
                                    </button>
                                </div>

                                {showPreview && (
                                    <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Live Preview — sample data</p>
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{applyPreview(editBody, placeholders)}</p>
                                        <p className="text-xs text-gray-400 mt-2 italic">
                                            Sample: {placeholders.map(p => `${p.token} → "${p.sample}"`).join(' · ')}
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-gray-900">{t.label}</span>
                                        <span className="text-xs text-gray-400">({t.notification_key})</span>
                                        {t.is_active ? (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
                                        ) : (
                                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap font-mono">{t.message_body}</p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => handleEdit(t)} className="ml-3 shrink-0">
                                    Edit
                                </Button>
                            </div>
                        )}
                    </div>
                ))}

                {templates.length === 0 && (
                    <EmptyState message="No WhatsApp templates found. Run bench migrate to seed defaults." />
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
interface TabDef {
    id: SettingsTab;
    label: string;
    icon: React.ReactNode;
}

const tabs: TabDef[] = [
    {
        id: 'general',
        label: 'General',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
    {
        id: 'invoice-workflows',
        label: 'Invoice Workflows',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
            </svg>
        ),
    },
    {
        id: 'pos-config',
        label: 'POS Config',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        id: 'pms-vat',
        label: 'PMS & VAT',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-2.21 0-4 1.12-4 2.5S9.79 13 12 13s4 1.12 4 2.5S14.21 18 12 18m0-10V6m0 12v-2m8-4a8 8 0 11-16 0 8 8 0 0116 0z" />
            </svg>
        ),
    },
    {
        id: 'payment-modes',
        label: 'Payment Modes',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
        ),
    },
    {
        id: 'technicians',
        label: 'Technicians',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
        ),
    },
    {
        id: 'sales-persons',
        label: 'Sales Persons',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        ),
    },
    {
        id: 'country-codes',
        label: 'Country Codes',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
        ),
    },
    {
        id: 'task-templates',
        label: 'Task Templates',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
        ),
    },
    {
        id: 'issue-templates',
        label: 'Issue Templates',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        ),
    },
    {
        id: 'watch-condition-templates',
        label: 'Watch Conditions',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-9 8h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2zm3-13h6" />
            </svg>
        ),
    },
    {
        id: 'diagnosis-summary-templates',
        label: 'Diagnosis Summaries',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h8M8 14h5M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
        ),
    },
    {
        id: 'recommended-work-templates',
        label: 'Recommended Work',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
        ),
    },
    {
        id: 'movement-type-templates',
        label: 'Movement Types',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        id: 'movement-caliber-templates',
        label: 'Movement Calibers',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-7 4h8m-9 4h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
    },
    {
        id: 'watch-brands',
        label: 'Watch Brands',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
        ),
    },
    {
        id: 'watch-models',
        label: 'Watch Models',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        id: 'whatsapp',
        label: 'WhatsApp',
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
        ),
    },
];

// ─────────────────────────────────────────────────────────────
// Main Settings Page
// ─────────────────────────────────────────────────────────────
const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');

    if (!isErpNext) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-gray-500 font-medium">Settings are only available when connected to Frappe/ERPNext.</p>
                    <p className="text-gray-400 text-sm mt-1">Run the app in production mode to manage configuration.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-6 min-h-full">
            {/* Left: vertical tab nav */}
            <aside className="w-52 flex-shrink-0">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">Configuration</p>
                    <nav className="space-y-0.5">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${activeTab === tab.id
                                    ? 'bg-purple-50 text-purple-700 font-semibold'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                                    }`}
                            >
                                <span className={activeTab === tab.id ? 'text-purple-600' : 'text-gray-400'}>
                                    {tab.icon}
                                </span>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </aside>

            {/* Right: section content */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                {activeTab === 'general' && <GeneralSection />}
                {activeTab === 'invoice-workflows' && <InvoiceWorkflowsSection />}
                {activeTab === 'pos-config' && <PosConfigurationSection />}
                {activeTab === 'pms-vat' && <PmsVatSection />}
                {activeTab === 'payment-modes' && <PaymentModesSection />}
                {activeTab === 'technicians' && <TechniciansSection />}
                {activeTab === 'sales-persons' && <SalesPersonsSection />}
                {activeTab === 'country-codes' && <CountryCodesSection />}
                {activeTab === 'task-templates' && <TaskTemplatesSection />}
                {activeTab === 'issue-templates' && <IssueTemplatesSection />}
                {activeTab === 'watch-condition-templates' && <WatchConditionTemplatesSection />}
                {activeTab === 'diagnosis-summary-templates' && <DiagnosisSummaryTemplatesSection />}
                {activeTab === 'recommended-work-templates' && <RecommendedWorkTemplatesSection />}
                {activeTab === 'movement-type-templates' && <MovementTypeTemplatesSection />}
                {activeTab === 'movement-caliber-templates' && <MovementCaliberTemplatesSection />}
                {activeTab === 'watch-brands' && <WatchBrandsSection />}
                {activeTab === 'watch-models' && <WatchModelsSection />}
                {activeTab === 'whatsapp' && <WhatsAppSection />}
            </div>
        </div>
    );
};

export default Settings;
