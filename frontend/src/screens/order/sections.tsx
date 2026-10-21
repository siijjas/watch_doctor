/**
 * The parts of one watch that both the desk card (D4/M5) and the
 * technician's job screen (M3) show. Each edit is one narrow call.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { IssueTemplate, Item, RepairItem } from '../../types';
import type { OrderContext } from '../../services/deskApi';
import * as deskApi from '../../services/deskApi';
import * as apiService from '../../services/apiService';
import {
    Button, Chips, DatePicker, Icon, IconButton, MoneyInput, PhotoRow, SearchField, SelectInput, Sheet,
    Spinner, TextArea, TextInput, Toggle, addDays, cx, formatDay, roundMoney, toISODate, useToast, type Photo,
} from '../../design/kit';
import { partPrice, taskName, taskPrice } from './useOrder';

type Run = (key: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

export const SubHead: React.FC<{ title: React.ReactNode; action?: React.ReactNode }> = ({ title, action }) => (
    <div className="flex items-center justify-between gap-2 mb-2 min-h-8">
        <h3 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{title}</h3>
        {action}
    </div>
);

export const LinkButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, ...rest }) => (
    <button type="button" className={cx('inline-flex items-center gap-1 h-8 px-1 text-[13px] font-bold text-dw-accent hover:underline disabled:opacity-50', className)} {...rest} />
);

/** A price that saves when the field is left, not on every key. */
export const PriceCell: React.FC<{ value: number; label: string; onCommit: (v: number | null) => Promise<void> }> = ({ value, label, onCommit }) => {
    const [v, setV] = useState<number | null>(value);
    useEffect(() => { setV(value); }, [value]);
    return (
        <div
            className="w-[120px] ml-auto shrink-0"
            onBlur={() => { if (v !== null && roundMoney(v) !== roundMoney(value)) void onCommit(v).catch(() => setV(value)); }}
        >
            <MoneyInput value={v} onChange={setV} currency="" aria-label={label} className="[&_input]:h-9" />
        </div>
    );
};

// ---------------------------------------------------------------- Tasks

interface TasksProps {
    item: RepairItem;
    ctx: OrderContext;
    run: Run;
    busy: string | null;
    /** Desk may add/remove tasks; technicians tick only. */
    desk: boolean;
    /** Why ticking is not allowed yet, e.g. waiting for approval. */
    lockedReason?: string;
    showPrices?: boolean;
    /** Front desk on an open watch: prices are typed in place. */
    canEditPrice?: boolean;
    large?: boolean;
}

export const TasksSection: React.FC<TasksProps> = ({ item, ctx, run, busy, desk, lockedReason, showPrices = true, canEditPrice, large }) => {
    const [adding, setAdding] = useState(false);
    const tasks = item.tasks || [];
    const done = tasks.filter(t => t.status === 'Completed').length;
    const name = item.name!;

    return (
        <section>
            <SubHead
                title={tasks.length ? `Tasks · ${done} of ${tasks.length} done` : 'Tasks'}
                action={<LinkButton onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add task</LinkButton>}
            />
            {tasks.length === 0 ? (
                <p className="m-0 text-[13px] text-dw-caption">No tasks yet. Work needed in the diagnosis adds them, or add one here.</p>
            ) : (
                <ul className="m-0 p-0 list-none flex flex-col">
                    {tasks.map(t => {
                        const ticked = t.status === 'Completed';
                        const key = `task:${name}:${t.service}`;
                        return (
                            <li key={t.service} className="flex items-center gap-2 border-b border-dw-line last:border-b-0">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={ticked}
                                    disabled={!!lockedReason || busy === key}
                                    title={lockedReason}
                                    onClick={() => void run(key, () => deskApi.setTaskStatus(name, t.service, ticked ? 'In Progress' : 'Completed')).catch(() => undefined)}
                                    className={cx('flex-1 min-w-0 flex items-center gap-3 text-left disabled:cursor-not-allowed', large ? 'min-h-[52px]' : 'min-h-[42px]')}
                                >
                                    <span className={cx(
                                        'shrink-0 rounded-[8px] border-2 flex items-center justify-center',
                                        large ? 'w-7 h-7' : 'w-6 h-6',
                                        ticked ? 'bg-dw-success border-dw-success text-white' : 'border-dw-border-strong bg-dw-surface',
                                        lockedReason && 'opacity-50',
                                    )}>
                                        {busy === key ? <Spinner size={12} /> : ticked && <Icon name="check" size={14} strokeWidth={2.8} />}
                                    </span>
                                    <span className={cx('flex-1 min-w-0 text-[14px] font-semibold', ticked && 'text-dw-caption line-through')}>
                                        {taskName(t.service, ctx)}
                                        {t.status === 'In Progress' && <span className="ml-2 text-[11px] font-bold text-dw-accent no-underline">started</span>}
                                    </span>
                                </button>
                                {showPrices && (canEditPrice
                                    ? <PriceCell value={taskPrice(t, ctx)} label={`Price of ${taskName(t.service, ctx)}`} onCommit={v => run(`rate:${name}:${t.service}`, () => deskApi.setTaskRate(name, t.service, v), 'Price saved')} />
                                    : <span className="text-[14px] font-bold tabular-nums">{taskPrice(t, ctx).toFixed(3)}</span>)}
                                {desk && (t as { is_manual?: number }).is_manual === 1 && t.status === 'Pending' && (
                                    <IconButton size="sm" variant="ghost" icon="x" label={`Remove ${taskName(t.service, ctx)}`} onClick={() => void run(`rmtask:${t.service}`, () => deskApi.removeTask(name, t.service), 'Task removed').catch(() => undefined)} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {lockedReason && tasks.length > 0 && <p className="m-0 mt-1.5 text-[12px] font-semibold text-dw-caption">{lockedReason}</p>}
            <TaskPicker
                open={adding}
                onClose={() => setAdding(false)}
                ctx={ctx}
                existing={tasks.map(t => t.service)}
                onPick={async service => { await run(`addtask:${name}`, () => deskApi.addTask(name, service), 'Task added'); setAdding(false); }}
            />
        </section>
    );
};

export const TaskPicker: React.FC<{ open: boolean; onClose: () => void; ctx: OrderContext; existing: string[]; onPick: (service: string) => Promise<void> }> = ({ open, onClose, ctx, existing, onPick }) => {
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    useEffect(() => { if (open) setQ(''); }, [open]);
    const list = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return ctx.task_templates.filter(t => !existing.includes(t.name) && (!needle || t.task_name.toLowerCase().includes(needle)));
    }, [ctx.task_templates, existing, q]);
    return (
        <Sheet open={open} onClose={onClose} title="Add a task" dismissable={!busy}>
            <SearchField value={q} onChange={setQ} placeholder="Search tasks" label="Search tasks" delay={0} autoFocus />
            <div className="mt-3 flex flex-col max-h-[50vh] overflow-y-auto -mx-1">
                {list.length === 0 && <p className="text-[13px] text-dw-caption px-1">No task matches. Task templates are managed under Settings.</p>}
                {list.slice(0, 60).map(t => (
                    <button
                        key={t.name}
                        type="button"
                        disabled={!!busy}
                        onClick={async () => { setBusy(t.name); try { await onPick(t.name); } catch { /* toast shown */ } finally { setBusy(null); } }}
                        className="flex items-center gap-3 min-h-[46px] px-3 rounded-[10px] text-left hover:bg-dw-ground"
                    >
                        <span className="flex-1 min-w-0 text-[14px] font-bold truncate">{t.task_name}</span>
                        <span className="text-[13px] font-bold text-dw-caption tabular-nums">{Number(t.default_rate || 0).toFixed(3)}</span>
                        {busy === t.name && <Spinner />}
                    </button>
                ))}
            </div>
        </Sheet>
    );
};

// ---------------------------------------------------------------- Parts

export const PartsSection: React.FC<{ item: RepairItem; ctx: OrderContext; run: Run; busy: string | null; showPrices?: boolean; canEditPrice?: boolean }> = ({ item, ctx, run, busy, showPrices = true, canEditPrice }) => {
    const [open, setOpen] = useState(false);
    const parts = item.parts_used || [];
    const name = item.name!;
    return (
        <section>
            <SubHead title="Parts used" action={!open && <LinkButton onClick={() => setOpen(true)}><Icon name="plus" size={14} />Add part</LinkButton>} />
            {parts.length === 0 && !open && <p className="m-0 text-[13px] text-dw-caption">No parts used yet.</p>}
            <ul className="m-0 p-0 list-none">
                {parts.map(p => (
                    <li key={p.name || p.part} className="flex items-center gap-2 min-h-[42px] border-b border-dw-line last:border-b-0">
                        <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">
                            {ctx.parts[p.part]?.item_name || p.part_name || p.part}
                            <span className="text-dw-caption font-semibold"> × {p.quantity}</span>
                        </span>
                        {showPrices && (canEditPrice && p.name
                            ? <PriceCell value={partPrice(p, ctx)} label={`Price of ${ctx.parts[p.part]?.item_name || p.part}`}
                                onCommit={v => run(`prate:${p.name}`, () => deskApi.setPartLine(name, p.name!, { rate: v == null ? null : roundMoney(v / (p.quantity || 1)) }), 'Price saved')} />
                            : <span className="text-[14px] font-bold tabular-nums">{partPrice(p, ctx).toFixed(3)}</span>)}
                        {p.name && (
                            <IconButton size="sm" variant="ghost" icon="x" label="Remove part" disabled={busy === `rmpart:${p.name}`} onClick={() => void run(`rmpart:${p.name}`, () => deskApi.removePart(name, p.name!), 'Part removed').catch(() => undefined)} />
                        )}
                    </li>
                ))}
            </ul>
            {open && (
                <PartPicker
                    item={item}
                    ctx={ctx}
                    onCancel={() => setOpen(false)}
                    onAdd={async (part, qty, task) => { await run(`addpart:${name}`, () => deskApi.addPart(name, part, qty, task), 'Part added'); setOpen(false); }}
                />
            )}
        </section>
    );
};

export const PartPicker: React.FC<{ item: RepairItem; ctx: OrderContext; onCancel: () => void; onAdd: (part: string, qty: number, task?: string) => Promise<void> }> = ({ item, ctx, onCancel, onAdd }) => {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<Item[] | null>(null);
    const [picked, setPicked] = useState<Item | null>(null);
    const [qty, setQty] = useState('1');
    const [task, setTask] = useState(item.tasks?.find(t => t.status !== 'Completed')?.service || '');
    const [busy, setBusy] = useState(false);
    const req = useRef(0);

    const search = async (text: string) => {
        const id = ++req.current;
        if (text.trim().length < 2) { setResults(null); return; }
        try {
            const r = await apiService.searchItems(text);
            if (id === req.current) setResults(r);
        } catch {
            if (id === req.current) setResults([]);
        }
    };

    const add = async () => {
        if (!picked) return;
        setBusy(true);
        try { await onAdd(picked.name, Number(qty) || 1, task || undefined); } catch { /* toast shown */ } finally { setBusy(false); }
    };

    return (
        <div className="mt-2 p-3 rounded-dw-control bg-dw-ground border border-dw-border flex flex-col gap-2 dw-anim-pop">
            {!picked ? (
                <>
                    <SearchField value={q} onChange={setQ} onSearch={v => void search(v)} placeholder="Part name, code or barcode" label="Search parts" autoFocus />
                    {results && (
                        <div className="bg-dw-surface border border-dw-border rounded-[10px] overflow-hidden max-h-[260px] overflow-y-auto">
                            {results.length === 0 && <p className="m-0 p-3 text-[13px] text-dw-caption">No part matches “{q}”.</p>}
                            {results.map(r => {
                                const stock = Number(r.stock_qty || 0);
                                return (
                                    <button key={r.name} type="button" onClick={() => setPicked(r)} className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-dw-line last:border-b-0 text-left hover:bg-dw-ground">
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[13px] font-bold truncate">{r.item_name}</span>
                                            <span className={cx('block text-[12px] font-semibold', stock > 0 ? 'text-dw-caption' : 'text-dw-danger')}>
                                                {stock > 0 ? `${stock} in stock` : 'Out of stock · order from supplier'} · {r.item_code || r.name}
                                            </span>
                                        </span>
                                        <span className="text-[13px] font-extrabold tabular-nums">{Number(r.standard_rate || 0).toFixed(3)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-[14px] font-bold truncate">{picked.item_name}</span>
                        <LinkButton onClick={() => setPicked(null)}>Change</LinkButton>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-[12px] font-bold text-dw-caption">Qty
                            <TextInput type="number" inputMode="decimal" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} className="w-[84px] h-10" />
                        </label>
                        {(item.tasks || []).length > 0 && (
                            <label className="flex-1 min-w-[160px] flex flex-col gap-1 text-[12px] font-bold text-dw-caption">For task
                                <SelectInput value={task} onChange={e => setTask(e.target.value)} className="h-10">
                                    <option value="">No task</option>
                                    {(item.tasks || []).map(t => <option key={t.service} value={t.service}>{taskName(t.service, ctx)}</option>)}
                                </SelectInput>
                            </label>
                        )}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
                        <Button size="sm" variant="primary" busy={busy} disabled={!(Number(qty) > 0)} onClick={() => void add()}>Add part</Button>
                    </div>
                </>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- Waiting for parts

export const PartsHold: React.FC<{ item: RepairItem; run: Run; busy: string | null; desk: boolean; disabled?: boolean }> = ({ item, run, busy, desk, disabled }) => {
    const waiting = !!item.awaiting_parts;
    const [editing, setEditing] = useState(false);
    const [date, setDate] = useState<string | null>(item.parts_expected_date || addDays(toISODate(new Date()), 3));
    const [note, setNote] = useState(item.parts_note || '');
    const name = item.name!;
    const key = `parts:${name}`;
    useEffect(() => { setDate(item.parts_expected_date || addDays(toISODate(new Date()), 3)); setNote(item.parts_note || ''); }, [item.parts_expected_date, item.parts_note]);

    const save = () => run(key, () => deskApi.setAwaitingParts(name, true, desk ? date || undefined : undefined, note), desk ? 'Waiting for the part' : 'The desk will order the part')
        .then(() => setEditing(false)).catch(() => undefined);

    return (
        <section>
            <SubHead title="Waiting for parts?" />
            {waiting && !editing ? (
                <div className="flex items-start gap-3 p-3 rounded-dw-control bg-[#FBEBC2]">
                    <Icon name="box" size={18} className="mt-0.5 text-[#6B4B00]" />
                    <div className="flex-1 min-w-0 text-[13px] font-semibold text-[#6B4B00]">
                        <div className="font-extrabold">Waiting for {item.parts_note || 'a part'}</div>
                        <div>{item.parts_expected_date ? `Expected ${formatDay(item.parts_expected_date)}` : 'No date yet'}</div>
                    </div>
                    {desk && <LinkButton onClick={() => setEditing(true)}>Edit</LinkButton>}
                    <Button size="sm" busy={busy === key} onClick={() => void run(key, () => deskApi.setAwaitingParts(name, false), 'Part arrived').catch(() => undefined)}>Arrived</Button>
                </div>
            ) : editing ? (
                <div className="flex flex-col gap-2 p-3 rounded-dw-control bg-dw-ground border border-dw-border dw-anim-pop">
                    <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Which part, e.g. crystal 30 mm" aria-label="Which part" autoFocus maxLength={140} />
                    {desk && <DatePicker value={date} onChange={setDate} quick={[2, 5, 10]} aria-label="Expected on" />}
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button size="sm" variant="primary" busy={busy === key} onClick={() => void save()}>{desk ? 'Save' : 'Tell the desk'}</Button>
                    </div>
                </div>
            ) : desk ? (
                <Toggle checked={false} disabled={disabled} onChange={() => setEditing(true)} label="Hold for a part" description="Shows on the front desk with the date it is due." />
            ) : (
                <Button icon="box" disabled={disabled} onClick={() => setEditing(true)}>Need a part</Button>
            )}
        </section>
    );
};

// ---------------------------------------------------------------- Internal note

export const NoteSection: React.FC<{ item: RepairItem; run: Run; busy: string | null; title?: string }> = ({ item, run, busy, title = 'Internal note · staff only' }) => {
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(item.internal_note || '');
    const key = `note:${item.name}`;
    useEffect(() => { if (!editing) setText(item.internal_note || ''); }, [item.internal_note, editing]);
    return (
        <section>
            <SubHead title={title} action={!editing && <LinkButton onClick={() => setEditing(true)}>{item.internal_note ? 'Edit' : <><Icon name="plus" size={14} />Add</>}</LinkButton>} />
            {editing ? (
                <div className="flex flex-col gap-2">
                    <TextArea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus aria-label="Internal note" placeholder="Never shown to the customer" />
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                        <Button size="sm" variant="primary" busy={busy === key} onClick={() => void run(key, () => deskApi.setInternalNote(item.name!, text), 'Note saved').then(() => setEditing(false)).catch(() => undefined)}>Save note</Button>
                    </div>
                </div>
            ) : item.internal_note ? (
                <p className="m-0 px-3 py-2.5 rounded-[10px] border border-dashed border-dw-border-strong text-[13px] leading-relaxed whitespace-pre-wrap">{item.internal_note}</p>
            ) : (
                <p className="m-0 text-[13px] text-dw-caption">Nothing yet.</p>
            )}
        </section>
    );
};

// ---------------------------------------------------------------- Customer says (issues + condition on arrival)

let issueTemplates: Promise<IssueTemplate[]> | null = null;
const loadIssues = () => {
    issueTemplates ??= apiService.getIssueTemplates().catch(e => { issueTemplates = null; throw e; });
    return issueTemplates;
};

const issueLabel = (i: { issue: string; is_other?: boolean | number; other_description?: string }) =>
    i.is_other ? (i.other_description || 'Other') : i.issue;

export const IssuesSection: React.FC<{ item: RepairItem; run: Run; canEdit: boolean }> = ({ item, run, canEdit }) => {
    const [open, setOpen] = useState(false);
    const issues = item.issues || [];
    const pre = item.pre_existing_condition || [];
    return (
        <section>
            <SubHead title="Customer says" action={canEdit && <LinkButton onClick={() => setOpen(true)}>{issues.length ? 'Edit' : <><Icon name="plus" size={14} />Add</>}</LinkButton>} />
            {issues.length === 0 && pre.length === 0 && !item.issue_description ? (
                <p className="m-0 text-[13px] text-dw-caption">Nothing recorded at intake.</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {issues.map((i, n) => <span key={`i${n}`} className="inline-flex items-center h-8 px-3 rounded-full bg-dw-sunken text-[13px] font-bold">{issueLabel(i)}</span>)}
                    {pre.map((c, n) => <span key={`p${n}`} className="inline-flex items-center h-8 px-3 rounded-full border border-dashed border-dw-border-strong text-[13px] font-semibold text-dw-body" title="Condition on arrival">{c} <span className="ml-1 text-dw-caption">(on arrival)</span></span>)}
                </div>
            )}
            {item.issue_description && <p className="m-0 mt-2 text-[13px] text-dw-body">{item.issue_description}</p>}
            {canEdit && <IssuesSheet open={open} onClose={() => setOpen(false)} item={item} run={run} />}
        </section>
    );
};

const IssuesSheet: React.FC<{ open: boolean; onClose: () => void; item: RepairItem; run: Run }> = ({ open, onClose, item, run }) => {
    const [templates, setTemplates] = useState<IssueTemplate[] | null>(null);
    const [picked, setPicked] = useState<string[]>([]);
    const [other, setOther] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        const current = item.issues || [];
        setPicked(current.filter(i => !i.is_other).map(i => i.issue));
        setOther(current.find(i => i.is_other)?.other_description || '');
        loadIssues().then(setTemplates).catch(() => setTemplates([]));
    }, [open, item.issues]);

    const save = async () => {
        setBusy(true);
        try {
            const entries: deskApi.IssueEntry[] = [...picked];
            if (other.trim()) entries.push({ issue: 'Other', other_description: other.trim() });
            await run(`issues:${item.name}`, () => deskApi.setWatchIssues(item.name!, entries), 'Saved');
            onClose();
        } catch { /* toast shown */ } finally {
            setBusy(false);
        }
    };

    const options = (templates || []).map(t => ({ value: t.name, label: t.issue_name }));
    for (const p of picked) if (!options.some(o => o.value === p)) options.push({ value: p, label: p });

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="What the customer says"
            dismissable={!busy}
            footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save</Button></>}
        >
            {!templates ? <div className="flex justify-center py-6"><Spinner /></div> : (
                <div className="flex flex-col gap-4">
                    <Chips multiple label="Complaints" options={options} value={picked} onChange={setPicked} />
                    <label className="flex flex-col gap-1.5 text-[13px] font-bold">Something else
                        <TextInput value={other} onChange={e => setOther(e.target.value)} placeholder="In the customer's words" maxLength={140} />
                    </label>
                    <p className="m-0 text-[12px] text-dw-caption">Complaints only suggest tasks while the watch has no diagnosis. Existing tasks are kept.</p>
                </div>
            )}
        </Sheet>
    );
};

// ---------------------------------------------------------------- Photos

export const PhotosSection: React.FC<{ item: RepairItem; run: Run; canEdit: boolean; title?: string }> = ({ item, run, canEdit, title = 'Photos on arrival' }) => {
    const [pending, setPending] = useState<Photo[]>([]);
    const toast = useToast();
    const photos = item.photos || [];
    const shown: Photo[] = [
        ...photos.map((p, i) => ({ id: p.name || `${i}`, url: p.image, label: p.caption || `Photo ${i + 1}` })),
        ...pending,
    ];

    const add = async (files: File[]) => {
        const temp = files.map((f, i) => ({ id: `new${Date.now()}${i}`, url: URL.createObjectURL(f), pending: true }));
        setPending(temp);
        try {
            const urls: string[] = [];
            try {
                for (const f of files) urls.push(await apiService.uploadFile(f));
            } catch (e) {
                toast.error(e instanceof Error ? `Upload failed: ${e.message}` : 'Upload failed. Try again.');
                throw e;
            }
            await run(`photos:${item.name}`, () => apiService.updateRepairItemPhotos(item.name!, {
                photos: [...photos.map(p => ({ image: p.image, caption: p.caption })), ...urls.map(u => ({ image: u }))],
            }), files.length === 1 ? 'Photo added' : `${files.length} photos added`);
        } catch { /* toast already shown */ } finally {
            temp.forEach(t => URL.revokeObjectURL(t.url));
            setPending([]);
        }
    };

    const remove = (photo: Photo) => void run(`photos:${item.name}`, () => apiService.updateRepairItemPhotos(item.name!, {
        photos: photos.filter((p, i) => (p.name || `${i}`) !== photo.id).map(p => ({ image: p.image, caption: p.caption })),
    }), 'Photo removed').catch(() => undefined);

    return (
        <section>
            <SubHead title={title} />
            {shown.length === 0 && !canEdit ? <p className="m-0 text-[13px] text-dw-caption">No photos.</p> : (
                <PhotoRow
                    photos={shown}
                    label={title}
                    onAdd={canEdit ? files => void add(files) : undefined}
                    onRemove={canEdit ? remove : undefined}
                    onOpen={p => window.open(p.url, '_blank', 'noopener')}
                />
            )}
        </section>
    );
};
