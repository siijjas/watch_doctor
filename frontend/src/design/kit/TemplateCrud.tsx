import React, { useMemo, useState } from 'react';
import { DataTable, type Column } from './DataTable';
import { SearchField } from './SearchField';
import { ConfirmSheet, Sheet } from './Sheet';
import { Toggle } from './Choice';
import { MoneyInput, formatMoney } from './Inputs';
import { Button, Field, SelectInput, TextArea, TextInput, cx } from './primitives';

export type FieldType = 'text' | 'textarea' | 'money' | 'number' | 'toggle' | 'select';

export interface CrudField<T> {
    key: keyof T & string;
    label: string;
    type: FieldType;
    /** Plain values, or value/label pairs when the stored value is a code. */
    options?: Array<string | { value: string; label: string }>;
    required?: boolean;
    /** Show as a column in the list. */
    inList?: boolean;
    hint?: string;
}

interface TemplateCrudProps<T extends Record<string, unknown>> {
    title: string;
    /** "service", "complaint" — used in buttons and confirmations. */
    singular: string;
    fields: CrudField<T>[];
    items: T[];
    getId: (item: T) => string;
    blank: () => T;
    onSave: (item: T, isNew: boolean) => Promise<void> | void;
    onDelete?: (item: T) => Promise<void> | void;
    loading?: boolean;
    /** Text under the title, e.g. where the list is used. */
    description?: string;
}

const optionLabel = <T,>(f: CrudField<T>, v: unknown) => {
    const hit = (f.options ?? []).find(o => (typeof o === 'string' ? o : o.value) === v);
    return hit ? (typeof hit === 'string' ? hit : hit.label) : String(v ?? '');
};

/**
 * The one editor behind every settings list (services, complaints,
 * conditions, payment modes, staff...). List + search + edit sheet.
 */
export function TemplateCrud<T extends Record<string, unknown>>({
    title, singular, fields, items, getId, blank, onSave, onDelete, loading, description,
}: TemplateCrudProps<T>) {
    const [q, setQ] = useState('');
    const [editing, setEditing] = useState<{ item: T; isNew: boolean } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const listFields = fields.filter(f => f.inList);
    const shown = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return items;
        return items.filter(it => fields.some(f => String(it[f.key] ?? '').toLowerCase().includes(needle)));
    }, [items, q, fields]);

    const columns: Column<T>[] = listFields.map(f => ({
        key: f.key,
        header: f.label,
        numeric: f.type === 'money' || f.type === 'number',
        render: (row: T) => {
            const v = row[f.key];
            if (f.type === 'money') return formatMoney(Number(v) || 0, '');
            if (f.type === 'toggle') return <span className={cx('text-[12px] font-bold', v ? 'text-dw-success' : 'text-dw-caption')}>{v ? 'Yes' : 'No'}</span>;
            if (f.type === 'select') return optionLabel(f, v);
            return String(v ?? '');
        },
    }));

    const set = (key: string, v: unknown) => setEditing(e => (e ? { ...e, item: { ...e.item, [key]: v } } : e));

    const save = async () => {
        if (!editing) return;
        const errs: Record<string, string> = {};
        fields.forEach(f => {
            const v = editing.item[f.key];
            if (f.required && (v == null || String(v).trim() === '')) errs[f.key] = `${f.label} is required.`;
        });
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setSaving(true);
        try {
            await onSave(editing.item, editing.isNew);
            setEditing(null);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="flex flex-col gap-3" aria-label={title}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="mr-auto min-w-0">
                    <h3 className="m-0 text-[17px] font-extrabold">{title} <span className="text-dw-caption font-bold text-[14px]">{items.length}</span></h3>
                    {description && <p className="m-0 text-[12px] font-semibold text-dw-caption">{description}</p>}
                </div>
                <SearchField value={q} onChange={setQ} placeholder={`Search ${title.toLowerCase()}`} className="w-full sm:w-64" />
                <Button variant="primary" icon="plus" onClick={() => { setErrors({}); setEditing({ item: blank(), isNew: true }); }}>Add {singular}</Button>
            </div>
            <DataTable
                columns={columns}
                rows={shown}
                rowKey={getId}
                loading={loading}
                onRowClick={row => { setErrors({}); setEditing({ item: { ...row }, isNew: false }); }}
                empty={{ title: q ? `No ${title.toLowerCase()} match "${q}"` : `No ${title.toLowerCase()} yet`, body: q ? undefined : `Add the first ${singular} to use it on orders.` }}
            />
            <Sheet
                open={!!editing}
                onClose={() => setEditing(null)}
                dismissable={!saving}
                title={editing?.isNew ? `New ${singular}` : `Edit ${singular}`}
                footer={<>
                    {onDelete && editing && !editing.isNew && (
                        <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)} disabled={saving}>Delete</Button>
                    )}
                    <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                    <Button variant="primary" onClick={save} busy={saving}>Save</Button>
                </>}
            >
                {editing && (
                    <div className="flex flex-col gap-4">
                        {fields.map(f => {
                            const id = `crud-${f.key}`;
                            const v = editing.item[f.key];
                            if (f.type === 'toggle') {
                                return <Toggle key={f.key} label={f.label} description={f.hint} checked={!!v} onChange={c => set(f.key, c ? 1 : 0)} />;
                            }
                            return (
                                <Field key={f.key} label={f.label} htmlFor={id} hint={f.hint} error={errors[f.key]} optional={!f.required}>
                                    {f.type === 'textarea' ? (
                                        <TextArea id={id} value={String(v ?? '')} onChange={e => set(f.key, e.target.value)} />
                                    ) : f.type === 'money' ? (
                                        <MoneyInput id={id} value={v == null || v === '' ? null : Number(v)} onChange={n => set(f.key, n)} />
                                    ) : f.type === 'select' ? (
                                        <SelectInput id={id} value={String(v ?? '')} onChange={e => set(f.key, e.target.value)}>
                                            <option value="">Choose…</option>
                                            {(f.options ?? []).map(o => {
                                                const { value, label } = typeof o === 'string' ? { value: o, label: o } : o;
                                                return <option key={value} value={value}>{label}</option>;
                                            })}
                                        </SelectInput>
                                    ) : (
                                        <TextInput
                                            id={id}
                                            type={f.type === 'number' ? 'number' : 'text'}
                                            inputMode={f.type === 'number' ? 'numeric' : undefined}
                                            value={String(v ?? '')}
                                            onChange={e => set(f.key, f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                                        />
                                    )}
                                </Field>
                            );
                        })}
                    </div>
                )}
            </Sheet>
            {onDelete && editing && (
                <ConfirmSheet
                    open={confirmDelete}
                    onClose={() => setConfirmDelete(false)}
                    tone="danger"
                    title={`Delete this ${singular}?`}
                    body={`Orders that already use it keep their copy. New orders will not offer it.`}
                    confirmLabel="Delete"
                    onConfirm={async () => { await onDelete(editing.item); setEditing(null); }}
                />
            )}
        </section>
    );
}

interface UnsavedBarProps {
    dirty: boolean;
    saving?: boolean;
    onSave: () => void;
    onDiscard: () => void;
    message?: string;
}

/** Sticky bar for settings forms: nothing saves silently, nothing is lost silently. */
export const UnsavedBar: React.FC<UnsavedBarProps> = ({ dirty, saving, onSave, onDiscard, message = 'You have unsaved changes' }) => {
    if (!dirty) return null;
    return (
        <div className="dw-anim-pop sticky bottom-3 z-30 mx-auto w-full max-w-[640px] flex items-center gap-3 rounded-[14px] bg-[#1F2933] text-white pl-4 pr-2 py-2 shadow-dw-pop" role="region" aria-label="Unsaved changes">
            <span className="flex-1 text-[14px] font-semibold">{message}</span>
            <button type="button" onClick={onDiscard} disabled={saving} className="h-9 px-3 rounded-lg text-[13px] font-bold text-white/80 hover:bg-white/10">Discard</button>
            <Button variant="primary" size="sm" onClick={onSave} busy={saving}>Save changes</Button>
        </div>
    );
};
