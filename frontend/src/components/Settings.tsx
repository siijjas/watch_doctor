import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getList, getDoc, saveDoc, deleteDoc, isErpNext, uploadFile, saveLogoUrl } from '../services/apiService';
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
    | 'payment-modes'
    | 'technicians'
    | 'country-codes'
    | 'task-templates'
    | 'issue-templates'
    | 'watch-brands'
    | 'watch-models';

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
    const [saveMsg, setSaveMsg] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setLogoPreview(config.logoUrl); }, [config.logoUrl]);

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
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Tab navigation config
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
                {activeTab === 'payment-modes' && <PaymentModesSection />}
                {activeTab === 'technicians' && <TechniciansSection />}
                {activeTab === 'country-codes' && <CountryCodesSection />}
                {activeTab === 'task-templates' && <TaskTemplatesSection />}
                {activeTab === 'issue-templates' && <IssueTemplatesSection />}
                {activeTab === 'watch-brands' && <WatchBrandsSection />}
                {activeTab === 'watch-models' && <WatchModelsSection />}
            </div>
        </div>
    );
};

export default Settings;
