/**
 * One watch's intake details (canvas D7 step 2 / M6): brand and model
 * search-or-create, serial, complaints, condition on arrival, photos and
 * the optional extra details. Used by the intake and by "Edit watch".
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { IssueTemplate, WatchConditionTemplate } from '../../types';
import * as apiService from '../../services/apiService';
import {
    Button, Chips, Field, Icon, PhotoRow, SelectInput, Spinner, TextInput, Toggle, cx, inputClass, useToast,
} from '../../design/kit';

export interface WatchDraft {
    key: string;
    brand: string;
    model: string;
    modelLabel: string;
    serial: string;
    issues: string[];
    other: string;
    conditions: string[];
    photos: string[];
    more: boolean;
    case_type: string;
    strap_bracelet: string;
    watch_type: string;
    dial: string;
}

export const emptyWatch = (): WatchDraft => ({
    key: Math.random().toString(36).slice(2),
    brand: '', model: '', modelLabel: '', serial: '', issues: [], other: '', conditions: [], photos: [],
    more: false, case_type: '', strap_bracelet: '', watch_type: '', dial: '',
});

export const watchReady = (w: WatchDraft) => !!w.brand && !!w.model;

let issueCache: Promise<IssueTemplate[]> | null = null;
let conditionCache: Promise<WatchConditionTemplate[]> | null = null;
const loadIssues = () => (issueCache ??= apiService.getIssueTemplates().catch(e => { issueCache = null; throw e; }));
const loadConditions = () => (conditionCache ??= apiService.getWatchConditionTemplates().catch(e => { conditionCache = null; throw e; }));

const CATEGORY_ORDER = ['Case & Exterior', 'Crystal & Water Resistance', 'Bracelet & Strap', 'History & Other'];
const CATEGORY_LABEL: Record<string, string> = {
    'Case & Exterior': 'Case',
    'Crystal & Water Resistance': 'Crystal & water',
    'Bracelet & Strap': 'Strap',
    'History & Other': 'History & other',
};

// ---------------------------------------------------------------- Search-or-create

interface Hit { value: string; label: string }

const Lookup: React.FC<{
    id: string;
    label: string;
    value: string;
    display: string;
    placeholder: string;
    disabled?: boolean;
    search: (q: string) => Promise<Hit[]>;
    create: (text: string) => Promise<Hit>;
    onPick: (hit: Hit | null) => void;
    createLabel: (text: string) => string;
}> = ({ id, label, value, display, placeholder, disabled, search, create, onPick, createLabel }) => {
    const toast = useToast();
    const [text, setText] = useState(display);
    const [open, setOpen] = useState(false);
    const [hits, setHits] = useState<Hit[]>([]);
    const [busy, setBusy] = useState(false);
    const [active, setActive] = useState(0);
    const req = useRef(0);
    const listId = useId();

    useEffect(() => { setText(display); }, [display]);
    useEffect(() => {
        if (!open) return;
        const id = ++req.current;
        const t = window.setTimeout(() => {
            search(text.trim()).then(r => { if (id === req.current) { setHits(r.slice(0, 8)); setActive(0); } }).catch(() => undefined);
        }, 200);
        return () => window.clearTimeout(t);
    }, [text, open, search]);

    const exact = hits.find(h => h.label.toLowerCase() === text.trim().toLowerCase());
    const options: Array<Hit | { create: string }> = [...hits, ...(text.trim() && !exact ? [{ create: text.trim() }] : [])];

    const choose = async (o: Hit | { create: string }) => {
        if ('create' in o) {
            setBusy(true);
            try {
                const made = await create(o.create);
                onPick(made);
                setText(made.label);
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Could not add it.');
            } finally {
                setBusy(false);
            }
        } else {
            onPick(o);
            setText(o.label);
        }
        setOpen(false);
    };

    return (
        <div className="relative">
            <label htmlFor={id} className="block mb-1.5 text-[13px] font-bold">{label}</label>
            <div className="relative">
                <input
                    id={id}
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    autoComplete="off"
                    disabled={disabled}
                    value={text}
                    placeholder={placeholder}
                    onFocus={() => setOpen(true)}
                    onBlur={() => window.setTimeout(() => { setOpen(false); if (!value) setText(''); else setText(display); }, 150)}
                    onChange={e => { setText(e.target.value); setOpen(true); if (value) onPick(null); }}
                    onKeyDown={e => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, options.length - 1)); }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
                        if (e.key === 'Enter' && open && options[active]) { e.preventDefault(); void choose(options[active]); }
                        if (e.key === 'Escape') setOpen(false);
                    }}
                    className={cx(inputClass, value && 'pr-9')}
                />
                {busy ? <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner /></span>
                    : value && <Icon name="check" size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-dw-success" />}
            </div>
            {open && !disabled && options.length > 0 && (
                <ul id={listId} role="listbox" className="absolute z-20 left-0 right-0 mt-1 m-0 p-1 list-none bg-dw-surface border border-dw-border rounded-dw-control shadow-dw-pop max-h-[260px] overflow-y-auto">
                    {options.map((o, i) => (
                        <li
                            key={'create' in o ? `+${o.create}` : o.value}
                            role="option"
                            aria-selected={i === active}
                            onMouseDown={e => { e.preventDefault(); void choose(o); }}
                            className={cx('px-3 py-2.5 rounded-[8px] text-[14px] cursor-pointer', i === active ? 'bg-dw-ground' : '', 'create' in o && 'font-bold text-dw-accent')}
                        >
                            {'create' in o ? <><Icon name="plus" size={14} className="inline mr-1.5" />{createLabel(o.create)}</> : o.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export const BrandModel: React.FC<{ w: Pick<WatchDraft, 'brand' | 'model' | 'modelLabel'>; onChange: (p: Partial<WatchDraft>) => void }> = ({ w, onChange }) => {
    const bid = useId();
    const mid = useId();
    const searchBrands = useMemo(() => async (q: string) =>
        (await apiService.getWatchBrands(q)).map(b => ({ value: b.name, label: b.brand_name || b.name })), []);
    const searchModels = useMemo(() => async (q: string) =>
        (w.brand ? await apiService.getWatchModels(w.brand, q) : []).map(m => ({ value: m.name, label: m.model_name })), [w.brand]);
    return (
        <>
            <Lookup
                id={bid}
                label="Brand"
                value={w.brand}
                display={w.brand}
                placeholder="Type to search"
                search={searchBrands}
                create={async t => { const b = await apiService.createWatchBrand(t); return { value: b.name, label: b.brand_name || b.name }; }}
                createLabel={t => `Add brand “${t}”`}
                onPick={h => onChange(h ? { brand: h.value, model: '', modelLabel: '' } : { brand: '', model: '', modelLabel: '' })}
            />
            <Lookup
                id={mid}
                label="Model"
                value={w.model}
                display={w.modelLabel}
                placeholder={w.brand ? 'Type, or “Unknown”' : 'Choose the brand first'}
                disabled={!w.brand}
                search={searchModels}
                create={async t => { const m = await apiService.createWatchModel(w.brand, t); return { value: m.name, label: m.model_name }; }}
                createLabel={t => `Add model “${t}” to ${w.brand}`}
                onPick={h => onChange(h ? { model: h.value, modelLabel: h.label } : { model: '', modelLabel: '' })}
            />
        </>
    );
};

// ---------------------------------------------------------------- Conditions

export const ConditionPicker: React.FC<{ value: string[]; onChange: (v: string[]) => void }> = ({ value, onChange }) => {
    const [templates, setTemplates] = useState<WatchConditionTemplate[] | null>(null);
    const [tab, setTab] = useState(CATEGORY_ORDER[0]);
    const [own, setOwn] = useState('');
    useEffect(() => { loadConditions().then(setTemplates).catch(() => setTemplates([])); }, []);
    const groups = useMemo(() => {
        const map = new Map<string, string[]>();
        for (const t of templates || []) {
            const c = CATEGORY_ORDER.includes(t.category || '') ? t.category! : 'History & Other';
            map.set(c, [...(map.get(c) || []), t.condition_name]);
        }
        return CATEGORY_ORDER.filter(c => map.has(c)).map(c => ({ category: c, items: map.get(c)! }));
    }, [templates]);
    const known = new Set(groups.flatMap(g => g.items));
    const custom = value.filter(v => !known.has(v));
    const current = groups.find(g => g.category === tab) ?? groups[0];
    const addOwn = () => { const t = own.trim(); if (t && !value.includes(t)) onChange([...value, t]); setOwn(''); };

    if (!templates) return <Spinner />;
    return (
        <div className="flex flex-col gap-2.5">
            {groups.length > 1 && (
                <div className="flex gap-1 overflow-x-auto -mx-1 px-1" role="tablist" aria-label="Condition type">
                    {groups.map(g => {
                        const n = g.items.filter(i => value.includes(i)).length;
                        const on = g.category === current?.category;
                        return (
                            <button key={g.category} type="button" role="tab" aria-selected={on} onClick={() => setTab(g.category)}
                                className={cx('shrink-0 h-8 px-3 rounded-full text-[12px] font-bold', on ? 'bg-dw-sunken text-dw-text' : 'text-dw-caption hover:text-dw-text')}>
                                {CATEGORY_LABEL[g.category] || g.category}{n > 0 && <span className="ml-1 text-dw-accent">{n}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            {current && (
                <Chips multiple label={current.category} options={current.items.map(i => ({ value: i, label: i }))} value={value.filter(v => current.items.includes(v))}
                    onChange={v => onChange([...value.filter(x => !current.items.includes(x)), ...v])} />
            )}
            {custom.length > 0 && (
                <Chips multiple label="Other conditions" options={custom.map(c => ({ value: c, label: c }))} value={custom} onChange={v => onChange(value.filter(x => known.has(x) || v.includes(x)))} />
            )}
            <div className="flex gap-2">
                <TextInput value={own} onChange={e => setOwn(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOwn(); } }} placeholder="Something else, e.g. dent at 4 o'clock" aria-label="Other condition" className="h-10" />
                <Button size="sm" className="h-10" disabled={!own.trim()} onClick={addOwn}>Add</Button>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- Whole watch

export const MoreDetails: React.FC<{ w: Pick<WatchDraft, 'case_type' | 'strap_bracelet' | 'watch_type' | 'dial'>; onChange: (p: Partial<WatchDraft>) => void }> = ({ w, onChange }) => (
    <div className="grid grid-cols-2 gap-3">
        <Field label="Case"><TextInput value={w.case_type} onChange={e => onChange({ case_type: e.target.value })} placeholder="e.g. Steel" /></Field>
        <Field label="Strap / bracelet"><TextInput value={w.strap_bracelet} onChange={e => onChange({ strap_bracelet: e.target.value })} placeholder="e.g. Leather" /></Field>
        <Field label="Type">
            <SelectInput value={w.watch_type} onChange={e => onChange({ watch_type: e.target.value })}>
                <option value="">Not set</option>
                {['Automatic', 'Mechanical', 'Quartz', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
            </SelectInput>
        </Field>
        <Field label="Dial"><TextInput value={w.dial} onChange={e => onChange({ dial: e.target.value })} placeholder="e.g. Blue" /></Field>
    </div>
);

interface WatchFormProps {
    w: WatchDraft;
    onChange: (p: Partial<WatchDraft>) => void;
    /** Intake shows complaints and photos; editing an existing watch does that on the card. */
    full?: boolean;
}

export const WatchForm: React.FC<WatchFormProps> = ({ w, onChange, full = true }) => {
    const toast = useToast();
    const [issues, setIssues] = useState<IssueTemplate[] | null>(null);
    const [uploading, setUploading] = useState(0);
    const serialId = useId();
    useEffect(() => { if (full) loadIssues().then(setIssues).catch(() => setIssues([])); }, [full]);

    const addPhotos = async (files: File[]) => {
        setUploading(n => n + files.length);
        const urls: string[] = [];
        for (const f of files) {
            try { urls.push(await apiService.uploadFile(f)); } catch (e) { toast.error(e instanceof Error ? `Photo not uploaded: ${e.message}` : 'Photo not uploaded.'); }
            setUploading(n => n - 1);
        }
        if (urls.length) onChange({ photos: [...w.photos, ...urls] });
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
                <BrandModel w={w} onChange={onChange} />
                <Field label="Serial no." optional htmlFor={serialId}>
                    <TextInput id={serialId} value={w.serial} onChange={e => onChange({ serial: e.target.value })} autoComplete="off" />
                </Field>
            </div>

            {full && (
                <div>
                    <p className="m-0 mb-2 text-[13px] font-bold">Customer says <span className="font-semibold text-dw-caption">· tap all that apply</span></p>
                    {!issues ? <Spinner /> : (
                        <Chips multiple label="Customer says" options={issues.map(i => ({ value: i.name, label: i.issue_name }))} value={w.issues} onChange={v => onChange({ issues: v })} />
                    )}
                    <TextInput className="mt-2" value={w.other} onChange={e => onChange({ other: e.target.value })} placeholder="Anything else, in the customer's words" aria-label="Other complaint" maxLength={140} />
                </div>
            )}

            <div>
                <p className="m-0 mb-2 text-[13px] font-bold">Condition on arrival <span className="font-semibold text-dw-caption">· printed on the receipt the customer signs</span></p>
                <ConditionPicker value={w.conditions} onChange={v => onChange({ conditions: v })} />
            </div>

            {full && (
                <div>
                    <p className="m-0 mb-2 text-[13px] font-bold">Photos on arrival {uploading > 0 && <span className="font-semibold text-dw-caption">· uploading {uploading}…</span>}</p>
                    <PhotoRow
                        photos={w.photos.map((u, i) => ({ id: `${i}:${u}`, url: u, label: `Photo ${i + 1}` }))}
                        onAdd={files => void addPhotos(files)}
                        onRemove={p => onChange({ photos: w.photos.filter((_, i) => `${i}:${w.photos[i]}` !== p.id) })}
                        onOpen={p => window.open(p.url, '_blank', 'noopener')}
                    />
                </div>
            )}

            <div>
                <Toggle checked={w.more} onChange={v => onChange({ more: v })} label="More details" description="Case, strap, movement type and dial" />
                {w.more && <div className="mt-3"><MoreDetails w={w} onChange={onChange} /></div>}
            </div>
        </div>
    );
};
