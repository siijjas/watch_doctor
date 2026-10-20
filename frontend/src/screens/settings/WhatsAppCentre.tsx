/**
 * WhatsApp centre (canvas D14): templates with placeholders and a live
 * preview, the message log the app keeps, and the owner's daily summary.
 * Every message is still sent by a person pressing a button.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, path as buildPath } from '../../router';
import {
    Button, Card, EmptyState, Field, SearchField, Segmented, SelectInput, Sheet, Spinner, StageBadge, TextArea, TextInput, Toggle, UnsavedBar,
    cx, formatDay, useToast,
} from '../../design/kit';
import * as apiService from '../../services/apiService';
import type { GeneralConfiguration, WhatsAppPlaceholder, WhatsAppTemplate } from '../../services/apiService';

const call = async <T,>(method: string, args: Record<string, unknown> = {}): Promise<T> =>
    (await apiService.apiFetchRaw(`/api/method/watch_doctor.api.${method}`, { method: 'POST', body: JSON.stringify(args) })).message as T;

const WHEN: Record<string, string> = {
    order_received: 'Order received · Message button on a new order',
    in_progress: 'In progress · Message button while in the workshop',
    awaiting_parts: 'Waiting for parts · Message button while held for a part',
    ready_for_collection: 'Ready · Message button and the collect thank-you',
    delivered: 'Collected · thank-you after collection',
    watch_estimate_ready: 'Estimate · Send on WhatsApp on the estimate screen, one per watch',
};

const Templates: React.FC = () => {
    const toast = useToast();
    const [list, setList] = useState<WhatsAppTemplate[] | null>(null);
    const [ph, setPh] = useState<WhatsAppPlaceholder[]>([]);
    const [key, setKey] = useState('');
    const [body, setBody] = useState('');
    const [activeOn, setActiveOn] = useState(true);
    const [busy, setBusy] = useState(false);
    const area = useRef<HTMLTextAreaElement>(null);

    const load = useCallback(() => apiService.getWhatsAppTemplates().then(r => { setList(r); return r; }), []);
    useEffect(() => {
        void load().then(r => { if (r[0]) { setKey(r[0].notification_key); setBody(r[0].message_body); setActiveOn(!!r[0].is_active); } }).catch(() => setList([]));
        apiService.getTemplatePlaceholders().then(setPh).catch(() => undefined);
    }, [load]);
    const cur = list?.find(t => t.notification_key === key);
    const dirty = !!cur && (cur.message_body !== body || !!cur.is_active !== activeOn);

    const pick = (t: WhatsAppTemplate) => {
        if (dirty && !window.confirm('Discard the changes to this template?')) return;
        setKey(t.notification_key); setBody(t.message_body); setActiveOn(!!t.is_active);
    };
    const insert = (token: string) => {
        const el = area.current;
        if (!el) { setBody(b => b + token); return; }
        const s = el.selectionStart ?? body.length; const e = el.selectionEnd ?? body.length;
        const next = body.slice(0, s) + token + body.slice(e);
        setBody(next);
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
    };
    const save = async () => {
        setBusy(true);
        try { await apiService.saveWhatsAppTemplate(key, body, activeOn ? 1 : 0); toast.success('Template saved'); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
    };
    const preview = ph.reduce((t, p) => t.split(p.token).join(p.sample), body);

    if (!list) return <Spinner />;
    if (!list.length) return <EmptyState icon="whatsapp" title="No templates" body="Templates are created when the app is installed. Run bench migrate." />;
    return (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] items-start">
            <Card pad={false} className="overflow-hidden">
                {list.map(t => (
                    <button key={t.notification_key} type="button" onClick={() => pick(t)} aria-current={t.notification_key === key ? 'true' : undefined}
                        className={cx('w-full flex items-center gap-2 px-4 py-3 border-b border-dw-line last:border-b-0 text-left', t.notification_key === key ? 'bg-[#EEF3FC]' : 'hover:bg-dw-ground')}>
                        <span className="flex-1 min-w-0"><span className="block text-[14px] font-extrabold truncate">{t.label}</span><span className="block text-[12px] text-dw-caption truncate">{WHEN[t.notification_key]?.split(' · ')[1] || t.notification_key}</span></span>
                        <span className={cx('text-[11px] font-bold', t.is_active ? 'text-dw-success' : 'text-dw-caption')}>{t.is_active ? 'On' : 'Off'}</span>
                    </button>
                ))}
            </Card>
            {cur && (
                <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><h3 className="m-0 text-[16px] font-extrabold">{cur.label}</h3><p className="m-0 text-[12px] text-dw-caption">key {cur.notification_key} · {WHEN[cur.notification_key] || 'sent from the order page'}</p></div>
                        <Toggle checked={activeOn} onChange={setActiveOn} label="Active" />
                    </div>
                    <div>
                        <p className="m-0 mb-1.5 text-[13px] font-bold">Message <span className="font-semibold text-dw-caption">· tap a placeholder to insert it</span></p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {ph.map(p => <button key={p.token} type="button" onClick={() => insert(p.token)} className="h-8 px-3 rounded-full border border-dw-border-strong text-[12px] font-bold hover:bg-dw-ground">{p.label}</button>)}
                        </div>
                        <TextArea ref={area} rows={7} value={body} onChange={e => setBody(e.target.value)} aria-label="Message" />
                    </div>
                    <div>
                        <p className="m-0 mb-1.5 text-[13px] font-bold">Preview with sample values</p>
                        <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap bg-[#DCF8C6]">{preview || ' '}</div>
                    </div>
                    <div className="flex justify-end"><Button variant="primary" busy={busy} disabled={!dirty || !body.trim()} onClick={() => void save()}>Save template</Button></div>
                </Card>
            )}
        </div>
    );
};

interface LogRow { name: string; creation: string; sent_at: string | null; repair_order: string; customer: string; customer_name: string; phone_number: string; notification_key: string; label: string; status: string; error_detail: string | null; message_body: string; sent_by: string }

const Log: React.FC = () => {
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    const [key, setKey] = useState('');
    const [days, setDays] = useState<'7' | '30' | '90'>('30');
    const [rows, setRows] = useState<LogRow[] | null>(null);
    const [open, setOpen] = useState<LogRow | null>(null);
    const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
    useEffect(() => { apiService.getWhatsAppTemplates().then(setTemplates).catch(() => undefined); }, []);
    useEffect(() => { setRows(null); call<LogRow[]>('whatsapp_log', { search, key, days: Number(days) }).then(setRows).catch(() => setRows([])); }, [search, key, days]);
    return (
        <>
            <Card className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <SearchField value={text} onChange={setText} onSearch={setSearch} placeholder="Order, customer or phone" className="lg:flex-1" />
                <SelectInput aria-label="Template" value={key} onChange={e => setKey(e.target.value)} className="lg:w-[220px]">
                    <option value="">All templates</option>
                    {templates.map(t => <option key={t.notification_key} value={t.notification_key}>{t.label}</option>)}
                </SelectInput>
                <Segmented<'7' | '30' | '90'> label="Period" size="sm" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
            </Card>
            <Card pad={false} className="overflow-hidden">
                {!rows ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? <EmptyState icon="whatsapp" title="No messages" body="Nothing was sent in this period." /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-[13px]">
                            <thead><tr className="text-[11px] uppercase tracking-[.05em] text-dw-caption bg-dw-ground"><th className="text-left px-4 py-2">When</th><th className="text-left px-2">Order</th><th className="text-left px-2">Customer · phone</th><th className="text-left px-2">Template</th><th className="text-left px-2">Status</th><th className="text-left px-2">By</th><th /></tr></thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.name} className="border-t border-dw-line">
                                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDay(r.sent_at || r.creation)} {String(r.sent_at || r.creation).slice(11, 16)}</td>
                                        <td className="px-2">{r.repair_order ? <Link to={buildPath('orders', r.repair_order)}>{r.repair_order}</Link> : '—'}</td>
                                        <td className="px-2">{r.customer_name} · {r.phone_number}</td>
                                        <td className="px-2">{r.label}</td>
                                        <td className="px-2"><StageBadge stage={r.status === 'Sent' ? 'ready' : r.status === 'Failed' ? 'return' : 'received'} dot={false}>{r.status}</StageBadge></td>
                                        <td className="px-2 text-dw-body">{r.sent_by}</td>
                                        <td className="px-4 text-right"><button type="button" onClick={() => setOpen(r)} className="font-bold text-dw-accent">View</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
            <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.label || ''} description={open ? `${open.customer_name} · ${open.phone_number} · ${open.status}` : ''}>
                {open && (
                    <div className="flex flex-col gap-3">
                        <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap bg-[#DCF8C6]">{open.message_body}</div>
                        {open.error_detail && <p className="m-0 p-3 rounded-[10px] bg-dw-danger-soft text-dw-danger text-[13px] font-semibold">{open.error_detail}</p>}
                        {open.status === 'Failed' && <p className="m-0 text-[12px] text-dw-caption">To try again, open the order and press Message.</p>}
                    </div>
                )}
            </Sheet>
        </>
    );
};

const Summary: React.FC = () => {
    const toast = useToast();
    const [saved, setSaved] = useState<GeneralConfiguration | null>(null);
    const [v, setV] = useState<GeneralConfiguration | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'send' | null>(null);
    const load = useCallback(() => apiService.getGeneralConfiguration().then(r => { setSaved(r.config); setV(r.config); }), []);
    useEffect(() => { void load(); call<{ text: string }>('daily_summary_preview').then(r => setPreview(r.text)).catch(() => setPreview('')); }, [load]);
    if (!v || !saved) return <Spinner />;
    const dirty = JSON.stringify(v) !== JSON.stringify(saved);
    const save = async () => {
        setBusy('save');
        try { await apiService.saveGeneralConfiguration(v); toast.success('Saved'); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(null); }
    };
    const send = async () => {
        setBusy('send');
        try { const r = await apiService.sendDailySummaryNow(); toast.success(`Sent to ${r.sent_to}`); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not sent.'); } finally { setBusy(null); }
    };
    return (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 items-start">
            <Card className="flex flex-col gap-4">
                <Toggle checked={!!v.daily_summary_enabled} onChange={c => setV({ ...v, daily_summary_enabled: c ? 1 : 0 })} label="Daily summary to the owner" description="Sent every morning at 08:00." />
                <Field label="Send to" hint="WhatsApp number with country code, e.g. +973 3xxx xxxx.">
                    <TextInput type="tel" value={v.daily_summary_whatsapp_no || ''} onChange={e => setV({ ...v, daily_summary_whatsapp_no: e.target.value })} />
                </Field>
                <Button icon="whatsapp" busy={busy === 'send'} disabled={dirty || !saved.daily_summary_whatsapp_no} onClick={() => void send()}>Send it now</Button>
                {dirty && <p className="m-0 text-[12px] font-semibold text-dw-caption">Save first; “Send it now” uses the saved number.</p>}
            </Card>
            <Card>
                <p className="m-0 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">What it says today</p>
                {preview === null ? <Spinner /> : <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap bg-[#DCF8C6]">{preview || 'Nothing to report.'}</div>}
            </Card>
            <UnsavedBar dirty={dirty} saving={busy === 'save'} onSave={() => void save()} onDiscard={() => setV(saved)} />
        </div>
    );
};

const WhatsAppCentre: React.FC = () => {
    const [tab, setTab] = useState<'templates' | 'log' | 'summary'>('templates');
    const [cfg, setCfg] = useState<{ enabled: boolean; cooldown_minutes: number } | null>(null);
    useEffect(() => { apiService.getWhatsAppConfig().then(setCfg).catch(() => setCfg(null)); }, []);
    return (
        <>
            <Card className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                    <h2 className="m-0 text-[18px] font-extrabold">WhatsApp</h2>
                    <p className="m-0 text-[13px] text-dw-caption">Messages go out only when someone presses a button. The same message to the same order waits {cfg?.cooldown_minutes ?? 60} minutes before it can be sent again.</p>
                </div>
                <StageBadge stage={cfg?.enabled ? 'ready' : 'return'} dot={false}>{cfg?.enabled ? 'Connected' : 'Switched off'}</StageBadge>
            </Card>
            <Segmented<'templates' | 'log' | 'summary'> label="WhatsApp" value={tab} onChange={setTab} className="max-w-[460px]"
                options={[{ value: 'templates', label: 'Templates' }, { value: 'log', label: 'Message log' }, { value: 'summary', label: 'Owner summary' }]} />
            {tab === 'templates' && <Templates />}
            {tab === 'log' && <Log />}
            {tab === 'summary' && <Summary />}
            {cfg && !cfg.enabled && <p className="m-0 text-[12px] font-semibold text-dw-caption">WhatsApp is switched on in the site configuration (whatsapp_enabled and the whapi token), not here.</p>}
        </>
    );
};

export default WhatsAppCentre;
