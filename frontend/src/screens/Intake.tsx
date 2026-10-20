/**
 * New repair order (canvas D7 / M6). One intake for every new order:
 * customer and order details, the watches, then review. Once the order is
 * created, the bag label (with QR), drop-off receipt and WhatsApp "order
 * received" are offered there. Editing an existing order happens on the
 * order page.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { RepairOrder } from '../types';
import { Link, goBack, navigate, path as buildPath } from '../router';
import { useAuth } from '../context/AuthContext';
import * as apiService from '../services/apiService';
import {
    findCustomers, checkPhone, createCustomer, listOrderHistory, type CustomerHit, type HistoryOrder,
} from '../services/deskApi';
import {
    Button, Card, DatePicker, Field, Icon, IconButton, SearchField, Segmented, SelectInput, Spinner,
    TextInput, addDays, cx, formatDay, toISODate, useToast,
} from '../design/kit';
import { WatchForm, emptyWatch, watchReady, type WatchDraft } from './shared/WatchForm';
import { summariseOrder } from '../design/stages';

type Step = 1 | 2 | 3;

interface Draft {
    customer: CustomerHit | null;
    priority: 'Normal' | 'Urgent' | 'VIP';
    received: string;
    promised: string | null;
    tag: string;
    watches: WatchDraft[];
    step: Step;
}

const DRAFT_KEY = 'dw.intake.draft.v1';
const today = () => toISODate(new Date());
const freshDraft = (): Draft => ({
    customer: null, priority: 'Normal', received: today(), promised: addDays(today(), 7), tag: '', watches: [emptyWatch()], step: 1,
});

const readDraft = (): Draft | null => {
    try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw) as Draft;
        return d && Array.isArray(d.watches) ? d : null;
    } catch {
        return null;
    }
};
const writeDraft = (d: Draft | null) => {
    try {
        if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
        else window.localStorage.removeItem(DRAFT_KEY);
    } catch { /* private window: drafts just are not kept */ }
};
const isBlank = (d: Draft) => !d.customer && !d.tag && d.watches.every(w => !w.brand && !w.serial && !w.issues.length && !w.photos.length);

const watchLabel = (w: WatchDraft) => [w.brand, w.modelLabel].filter(Boolean).join(' ') || 'New watch';

// ---------------------------------------------------------------- Step 1: customer

const NewCustomer: React.FC<{ seed: string; onCreated: (c: CustomerHit) => void; onCancel: () => void; onPickExisting: (name: string) => void }> = ({ seed, onCreated, onCancel, onPickExisting }) => {
    const toast = useToast();
    const looksLikePhone = /^[\d\s+()-]{4,}$/.test(seed.trim());
    const [name, setName] = useState(looksLikePhone ? '' : seed.trim());
    const [code, setCode] = useState('+973');
    const [mobile, setMobile] = useState(looksLikePhone ? seed.replace(/[^\d]/g, '').replace(/^(00)?973(?=\d{8})/, '') : '');
    const [whatsapp, setWhatsapp] = useState('');
    const [email, setEmail] = useState('');
    const [codes, setCodes] = useState<string[]>(['+973']);
    const [dups, setDups] = useState<Array<{ name: string; customer_name: string; mobile_no: string }>>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        apiService.getCountryCodes().then(r => setCodes(Array.from(new Set(['+973', ...r.map(c => c.code)])))).catch(() => undefined);
    }, []);
    useEffect(() => {
        const digits = mobile.replace(/\D/g, '');
        if (digits.length < 7) { setDups([]); return; }
        const t = window.setTimeout(() => { checkPhone(`${code}${digits}`).then(setDups).catch(() => setDups([])); }, 300);
        return () => window.clearTimeout(t);
    }, [mobile, code]);

    const full = (n: string) => { const d = n.replace(/\D/g, ''); return d ? `${code}${d}` : ''; };
    const save = async () => {
        setBusy(true);
        try {
            onCreated(await createCustomer({ customer_name: name, mobile: full(mobile), whatsapp: full(whatsapp), email }));
            toast.success('Customer added');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not add the customer.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 p-4 rounded-dw-control bg-dw-ground border border-dw-border flex flex-col gap-3 dw-anim-pop">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Full name"><TextInput value={name} onChange={e => setName(e.target.value)} autoFocus={!name} placeholder="As on the ID" /></Field>
                <Field label="Mobile">
                    <div className="flex gap-2">
                        <SelectInput aria-label="Country code" value={code} onChange={e => setCode(e.target.value)} className="w-[96px] shrink-0">
                            {codes.map(c => <option key={c} value={c}>{c}</option>)}
                        </SelectInput>
                        <TextInput type="tel" inputMode="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="3xxx xxxx" autoFocus={!!name} />
                    </div>
                </Field>
                <Field label="WhatsApp" optional hint="Only if different from the mobile"><TextInput type="tel" inputMode="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} /></Field>
                <Field label="Email" optional><TextInput type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
            </div>
            {dups.length > 0 && (
                <div className="p-3 rounded-[10px] bg-dw-warning-soft text-dw-warning text-[13px] font-semibold flex flex-wrap items-center gap-2" role="alert">
                    <Icon name="alert" size={16} />
                    <span className="flex-1">{dups[0].customer_name} already has this number ({dups[0].mobile_no}).</span>
                    <Button size="sm" onClick={() => onPickExisting(dups[0].customer_name)}>Use {dups[0].customer_name.split(' ')[0]}</Button>
                </div>
            )}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
                <Button variant="primary" busy={busy} disabled={!name.trim() || mobile.replace(/\D/g, '').length < 7 || dups.length > 0} onClick={() => void save()}>Save customer</Button>
            </div>
        </div>
    );
};

const CustomerStep: React.FC<{ value: CustomerHit | null; onChange: (c: CustomerHit | null) => void }> = ({ value, onChange }) => {
    const [text, setText] = useState('');
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<CustomerHit[] | null>(null);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (!query) { setHits(null); return; }
        let live = true;
        findCustomers(query).then(r => live && setHits(r)).catch(() => live && setHits([]));
        return () => { live = false; };
    }, [query]);

    if (value) {
        return (
            <div className="flex items-center gap-3 p-3 rounded-dw-control border border-dw-accent bg-[#EEF3FC]">
                <span className="w-10 h-10 rounded-[12px] bg-dw-surface flex items-center justify-center font-extrabold">{value.customer_name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}</span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-extrabold truncate">{value.customer_name}</span>
                    <span className="block text-[13px] text-dw-body">{value.mobile_no || 'No mobile'} · {value.orders ? `${value.orders} previous ${value.orders === 1 ? 'order' : 'orders'}` : 'first visit'}{value.open_orders ? ` · ${value.open_orders} open` : ''}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row gap-2">
                <SearchField value={text} onChange={setText} onSearch={setQuery} placeholder="Mobile number or name" label="Find customer" autoFocus className="flex-1" />
                <Button icon="plus" onClick={() => setAdding(a => !a)} aria-expanded={adding}>New customer</Button>
            </div>
            {adding && (
                <NewCustomer
                    seed={text}
                    onCancel={() => setAdding(false)}
                    onCreated={c => { setAdding(false); onChange(c); }}
                    onPickExisting={n => { setAdding(false); setText(n); setQuery(n); }}
                />
            )}
            {!adding && hits && (
                <div className="mt-2 border border-dw-border rounded-dw-control overflow-hidden bg-dw-surface">
                    {hits.length === 0 ? (
                        <div className="p-4 text-[14px] text-dw-body flex flex-wrap items-center gap-3">
                            <span className="flex-1">No customer matches “{query}”.</span>
                            <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>Add as new customer</Button>
                        </div>
                    ) : hits.map(h => (
                        <button key={h.name} type="button" onClick={() => onChange(h)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0 text-left hover:bg-dw-ground">
                            <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-extrabold truncate">{h.customer_name}</span>
                                <span className="block text-[12px] font-semibold text-dw-caption">
                                    {[h.mobile_no, h.orders ? `${h.orders} ${h.orders === 1 ? 'order' : 'orders'}` : 'no orders yet', h.open_orders ? `${h.open_orders} open` : '', h.last_order && `last ${formatDay(h.last_order)}`].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            <Icon name="chevronRight" size={16} className="text-dw-caption" />
                        </button>
                    ))}
                </div>
            )}
            {!adding && !hits && <p className="mt-2 text-[12px] font-semibold text-dw-caption">Search ignores spaces, +973 and leading zeros, and also finds WhatsApp numbers.</p>}
        </div>
    );
};

// ---------------------------------------------------------------- Screen

const Intake: React.FC = () => {
    const toast = useToast();
    const { userInfo } = useAuth();
    const restored = useRef(readDraft());
    const [d, setD] = useState<Draft>(() => restored.current ?? freshDraft());
    const [showRestored, setShowRestored] = useState(!!restored.current && !isBlank(restored.current));
    const [saving, setSaving] = useState(false);
    const [created, setCreated] = useState<{ name: string; watches: number } | null>(null);
    const [whatsapp, setWhatsapp] = useState<'idle' | 'sending' | 'sent'>('idle');
    const [whatsappOn, setWhatsappOn] = useState(false);
    const [history, setHistory] = useState<HistoryOrder[] | null>(null);
    const [triedNext, setTriedNext] = useState(false);

    useEffect(() => { if (!created) writeDraft(isBlank(d) ? null : d); }, [d, created]);
    useEffect(() => { apiService.getWhatsAppConfig().then(c => setWhatsappOn(!!c.enabled)).catch(() => undefined); }, []);
    useEffect(() => {
        setHistory(null);
        if (!d.customer) return;
        let live = true;
        listOrderHistory(0, 5, { search: d.customer.customer_name }).then(r => live && setHistory(r.orders.filter(o => o.customer === d.customer!.name))).catch(() => live && setHistory([]));
        return () => { live = false; };
    }, [d.customer]);

    const set = (p: Partial<Draft>) => setD(cur => ({ ...cur, ...p }));
    const setWatch = (key: string, p: Partial<WatchDraft>) => setD(cur => ({ ...cur, watches: cur.watches.map(w => (w.key === key ? { ...w, ...p } : w)) }));

    const step1Error = !d.customer ? 'Choose or add the customer.'
        : d.promised && d.promised < d.received ? 'The promised date cannot be before the received date.' : null;
    const step2Error = d.watches.some(w => !watchReady(w)) ? 'Every watch needs a brand and a model.' : null;

    const go = (to: Step) => {
        if (to > 1 && step1Error) { setTriedNext(true); set({ step: 1 }); return; }
        if (to > 2 && step2Error) { setTriedNext(true); set({ step: 2 }); return; }
        setTriedNext(false);
        set({ step: to });
        window.scrollTo({ top: 0 });
    };

    const print = useCallback((orderName: string, kind: 'label' | 'receipt') => {
        // Open the window inside the click so pop-up blockers allow it.
        const w = window.open('about:blank', '_blank');
        void (async () => {
            let format = 'DW RO Repair Order';
            if (kind === 'label') {
                format = 'DW RO Bag Label';
                try { format = (await apiService.getRepairOrderLabelPrintFormat()).print_format || format; } catch { /* default */ }
            }
            const url = `/printview?doctype=DW%20Repair%20Order&name=${encodeURIComponent(orderName)}&format=${encodeURIComponent(format)}&no_letterhead=1&trigger_print=1`;
            if (w && !w.closed) w.location.href = url;
            else if (!window.open(url, '_blank')) toast.error('The browser blocked the print window. Allow pop-ups for this site.');
        })();
    }, [toast]);

    const sendWhatsapp = (orderName: string) => {
        setWhatsapp('sending');
        apiService.notifyCustomer(orderName)
            .then(() => { setWhatsapp('sent'); toast.success('“Order received” sent on WhatsApp'); })
            .catch(e => { setWhatsapp('idle'); toast.error(e instanceof Error ? `WhatsApp not sent: ${e.message}` : 'WhatsApp not sent.'); });
    };

    const create = async () => {
        if (step1Error || step2Error) { go(step1Error ? 1 : 2); return; }
        setSaving(true);
        try {
            const order = {
                name: '',
                customer: d.customer!.name,
                contact_person: '',
                status: 'Pending',
                priority: d.priority,
                received_date: d.received,
                promised_delivery_date: d.promised || '',
                reference_number: d.tag.trim() || undefined,
                items: d.watches.map(w => ({
                    watch_brand: w.brand,
                    watch_model: w.model,
                    serial_number: w.serial.trim(),
                    case_type: w.case_type,
                    strap_bracelet: w.strap_bracelet,
                    watch_type: w.watch_type,
                    dial: w.dial,
                    pre_existing_condition: w.conditions,
                    issues: [
                        ...w.issues.map(i => ({ issue: i, is_other: false })),
                        ...(w.other.trim() ? [{ issue: 'Other', is_other: true, other_description: w.other.trim() }] : []),
                    ],
                    photos: w.photos.map(p => ({ image: p })),
                    tasks: [],
                    parts_used: [],
                    status: 'Pending',
                })),
            } as unknown as RepairOrder;
            const saved = await apiService.saveRepairOrder(order);
            writeDraft(null);
            setWhatsapp('idle');
            setCreated({ name: saved.name, watches: d.watches.length });
            window.scrollTo({ top: 0 });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'The order was not saved. Check the details and try again.');
        } finally {
            setSaving(false);
        }
    };

    const restart = () => { setCreated(null); setD(freshDraft()); setShowRestored(false); window.scrollTo({ top: 0 }); };

    if (created) {
        return (
            <div className="max-w-[640px] mx-auto">
                <Card className="text-center py-10 px-6">
                    <span className="mx-auto w-16 h-16 rounded-full bg-dw-success-soft text-dw-success flex items-center justify-center"><Icon name="check" size={32} strokeWidth={2.4} /></span>
                    <h1 className="m-0 mt-5 text-[22px] font-extrabold">Order {created.name} created</h1>
                    <p className="m-0 mt-1 text-[14px] font-semibold text-dw-caption">
                        {created.watches} {created.watches === 1 ? 'watch is' : 'watches are'} in the Received queue, no technician yet.
                    </p>
                    <div className="mt-6 grid gap-2 sm:grid-cols-2 text-left">
                        <Button size="lg" icon="print" onClick={() => print(created.name, 'label')}>Print bag label</Button>
                        <Button size="lg" icon="print" onClick={() => print(created.name, 'receipt')}>Print drop-off receipt</Button>
                        {whatsappOn && (
                            <Button size="lg" icon={whatsapp === 'sent' ? 'check' : 'whatsapp'} busy={whatsapp === 'sending'} disabled={whatsapp === 'sent'} onClick={() => sendWhatsapp(created.name)} className="sm:col-span-2">
                                {whatsapp === 'sent' ? 'WhatsApp “order received” sent' : 'Send WhatsApp “order received”'}
                            </Button>
                        )}
                    </div>
                    <div className="mt-6 pt-6 border-t border-dw-line flex flex-col sm:flex-row gap-2 justify-center">
                        <Button variant="primary" size="lg" onClick={() => navigate(buildPath('orders', created.name), { replace: true })}>Open order · assign technician</Button>
                        <Button size="lg" onClick={restart}>Next customer</Button>
                    </div>
                </Card>
            </div>
        );
    }

    const steps: Array<{ n: Step; label: string }> = [{ n: 1, label: 'Customer & order' }, { n: 2, label: 'Watches' }, { n: 3, label: 'Review' }];

    return (
        <div className="max-w-[1180px] mx-auto pb-24 lg:pb-0">
            <div className="flex flex-wrap items-center gap-3">
                <IconButton icon="x" label="Cancel" onClick={() => goBack('/desk')} />
                <div className="flex-1 min-w-[180px]">
                    <h1 className="m-0 text-[22px] font-extrabold tracking-[-.01em]">New repair order</h1>
                    <p className="m-0 text-[12px] font-semibold text-dw-caption">Draft saved on this device as you type</p>
                </div>
                <ol className="m-0 p-0 list-none flex gap-4" aria-label="Steps">
                    {steps.map(s => {
                        const done = d.step > s.n;
                        const on = d.step === s.n;
                        return (
                            <li key={s.n}>
                                <button type="button" onClick={() => go(s.n)} aria-current={on ? 'step' : undefined} className={cx('flex items-center gap-2 text-[13px] font-bold', on ? 'text-dw-text' : 'text-dw-caption')}>
                                    <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-extrabold', done ? 'bg-dw-success text-white' : on ? 'bg-dw-accent text-white' : 'bg-dw-sunken')}>
                                        {done ? <Icon name="check" size={14} strokeWidth={2.6} /> : s.n}
                                    </span>
                                    <span className="hidden md:inline">{s.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </div>

            {showRestored && (
                <div className="mt-4 p-3 rounded-dw-control bg-[#EEF3FC] text-[13px] font-semibold text-[#1F4B9B] flex flex-wrap items-center gap-3">
                    <span className="flex-1">Your unfinished order was restored{d.customer ? ` (${d.customer.customer_name})` : ''}.</span>
                    <Button size="sm" variant="ghost" onClick={() => { writeDraft(null); restart(); }}>Start over</Button>
                    <IconButton size="sm" variant="ghost" icon="x" label="Dismiss" onClick={() => setShowRestored(false)} />
                </div>
            )}

            <div className="mt-5 flex flex-col lg:flex-row gap-5 items-start">
                <section className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">
                    {d.step === 1 && (
                        <>
                            <Card>
                                <h2 className="m-0 mb-3 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Customer</h2>
                                <CustomerStep value={d.customer} onChange={c => set({ customer: c })} />
                                {triedNext && !d.customer && <p className="m-0 mt-2 text-[13px] font-semibold text-dw-danger" role="alert">Choose or add the customer.</p>}
                            </Card>
                            <Card className="grid gap-4 sm:grid-cols-2">
                                <Field label="Priority" className="sm:col-span-2">
                                    <Segmented label="Priority" value={d.priority} onChange={v => set({ priority: v })}
                                        options={[{ value: 'Normal', label: 'Normal' }, { value: 'Urgent', label: 'Urgent' }, { value: 'VIP', label: 'VIP' }]} />
                                </Field>
                                <Field label="Received"><DatePicker value={d.received} max={today()} onChange={v => set({ received: v || today() })} aria-label="Received" /></Field>
                                <Field label="Promised" optional error={d.promised && d.promised < d.received ? 'Cannot be before the received date.' : null}>
                                    <DatePicker value={d.promised} min={d.received} quick={[3, 7, 14]} onChange={v => set({ promised: v })} aria-label="Promised" />
                                </Field>
                                <Field label="Bag tag / ref. no." optional><TextInput value={d.tag} onChange={e => set({ tag: e.target.value })} placeholder="e.g. 0418" /></Field>
                            </Card>
                        </>
                    )}

                    {d.step === 2 && (
                        <>
                            {d.watches.map((w, i) => (
                                <Card key={w.key}>
                                    <div className="flex items-center justify-between gap-2 mb-4">
                                        <h2 className="m-0 text-[16px] font-extrabold">Watch {i + 1}{watchReady(w) ? ` · ${watchLabel(w)}` : ''}</h2>
                                        <div className="flex gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => setD(cur => ({ ...cur, watches: [...cur.watches.slice(0, i + 1), { ...w, key: emptyWatch().key, serial: '', photos: [] }, ...cur.watches.slice(i + 1)] }))}>Duplicate</Button>
                                            {d.watches.length > 1 && <Button size="sm" variant="ghost" className="text-dw-danger" onClick={() => setD(cur => ({ ...cur, watches: cur.watches.filter(x => x.key !== w.key) }))}>Remove</Button>}
                                        </div>
                                    </div>
                                    <WatchForm w={w} onChange={p => setWatch(w.key, p)} />
                                    {triedNext && !watchReady(w) && <p className="m-0 mt-3 text-[13px] font-semibold text-dw-danger" role="alert">Choose the brand and model.</p>}
                                </Card>
                            ))}
                            <Button icon="plus" size="lg" className="border-dashed" onClick={() => setD(cur => ({ ...cur, watches: [...cur.watches, emptyWatch()] }))}>Add another watch to this order</Button>
                        </>
                    )}

                    {d.step === 3 && (
                        <>
                            <Card>
                                {[
                                    ['Customer', d.customer ? `${d.customer.customer_name}${d.customer.mobile_no ? ` · ${d.customer.mobile_no}` : ''}` : '—'],
                                    ['Priority', d.priority],
                                    ['Received → promised', `${formatDay(d.received)} → ${d.promised ? formatDay(d.promised) : 'no date'}`],
                                    ['Bag tag', d.tag || '—'],
                                    ['Received by', userInfo?.user || ''],
                                ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-3 py-2.5 border-b border-dw-line last:border-b-0 text-[14px]">
                                        <span className="text-dw-body font-semibold">{k}</span><span className="font-bold text-right">{v}</span>
                                    </div>
                                ))}
                            </Card>
                            {d.watches.map((w, i) => {
                                const issueText = [...w.issues, ...(w.other.trim() ? [w.other.trim()] : [])].join(', ') || 'nothing noted';
                                return (
                                    <Card key={w.key}>
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="m-0 text-[15px] font-extrabold">{i + 1}. {watchLabel(w)} <span className="text-[12px] font-semibold text-dw-caption">{[w.serial && `S/N ${w.serial}`, w.photos.length && `${w.photos.length} photo${w.photos.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></h3>
                                            <Button size="sm" variant="ghost" onClick={() => go(2)}>Edit</Button>
                                        </div>
                                        <p className="m-0 mt-2 text-[13px]"><strong>Says:</strong> {issueText}</p>
                                        <p className="m-0 mt-1 text-[13px]"><strong>On arrival:</strong> {w.conditions.join(', ') || 'nothing noted'}</p>
                                    </Card>
                                );
                            })}
                        </>
                    )}

                    {/* Step navigation: sticky above the tab bar on phones */}
                    <div className="fixed lg:static bottom-[68px] inset-x-0 z-20 bg-[rgba(255,255,255,.96)] lg:bg-transparent backdrop-blur lg:backdrop-blur-none border-t lg:border-0 border-dw-border px-4 py-3 lg:p-0 flex gap-2 justify-end">
                        {d.step > 1 && <Button size="lg" onClick={() => go((d.step - 1) as Step)} className="flex-1 lg:flex-none">Back</Button>}
                        {d.step < 3
                            ? <Button size="lg" variant="primary" onClick={() => go((d.step + 1) as Step)} className="flex-[2] lg:flex-none">Continue</Button>
                            : <Button size="lg" variant="primary" busy={saving} onClick={() => void create()} className="flex-[2] lg:flex-none">Create order</Button>}
                    </div>
                    {triedNext && (step1Error || step2Error) && <p className="m-0 text-[13px] font-semibold text-dw-danger text-right" role="alert">{d.step === 1 ? step1Error : step2Error}</p>}
                </section>

                <aside className="w-full lg:w-[320px] shrink-0">
                    <Card>
                        <h2 className="m-0 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{d.customer ? `${d.customer.customer_name.split(' ')[0]}'s history` : 'Customer history'}</h2>
                        {!d.customer ? <p className="m-0 text-[13px] text-dw-caption">Choose the customer to see their previous repairs.</p>
                            : !history ? <Spinner />
                                : history.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">First visit.</p>
                                    : history.map(o => {
                                        const doc = o.docstatus === 1 || o.status === 'Delivered' ? 1 : 0;
                                        return (
                                            <Link key={o.name} to={buildPath('orders', o.name)} target="_blank" className="flex justify-between gap-3 py-2.5 border-b border-dw-line last:border-b-0 no-underline text-dw-text hover:bg-dw-ground -mx-2 px-2 rounded">
                                                <span className="min-w-0">
                                                    <span className="block text-[13px] font-extrabold">{o.name}</span>
                                                    <span className="block text-[12px] text-dw-caption truncate">{o.watches.map(w => [w.watch_brand, w.watch_model].filter(Boolean).join(' ')).join(', ')} · {summariseOrder(o.watches.map(w => ({ status: w.status, awaiting_parts: w.awaiting_parts })), doc).toLowerCase()}</span>
                                                </span>
                                                <span className="text-[12px] font-semibold text-dw-caption shrink-0">{formatDay(o.received_date)}</span>
                                            </Link>
                                        );
                                    })}
                    </Card>
                </aside>
            </div>
        </div>
    );
};

export default Intake;
