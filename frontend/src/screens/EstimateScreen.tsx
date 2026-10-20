/**
 * Estimate (canvas D5): review prices per watch → quotation → send →
 * the customer's answer. Prices edited here are saved on the order, so the
 * invoice later charges the same amounts. Replaces the quotation windows.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { RepairItem } from '../types';
import { goBack, navigate, path as buildPath } from '../router';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, Chips, DatePicker, EmptyState, Field, Icon, IconButton, MoneyInput, Segmented, Spinner, StageBadge,
    TextInput, Toggle, addDays, cx, formatDay, roundMoney, toISODate, useToast,
} from '../design/kit';
import * as apiService from '../services/apiService';
import * as deskApi from '../services/deskApi';
import type { OrderContext } from '../services/deskApi';
import { useOrder, partPrice, taskName, taskPrice, watchPrice, watchStage, watchTitle } from './order/useOrder';
import { PartPicker, TaskPicker } from './order/sections';
import { stageOfWatch } from '../design/stages';

type Phase = 'review' | 'send' | 'answer' | 'done';
type Run = (key: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

const NOTES = ['Price may change if more damage is found', 'Parts to be ordered, 5–7 days', 'Original parts only'];

/** A price that saves when the field is left, not on every key. */
const PriceCell: React.FC<{ value: number; label: string; onCommit: (v: number | null) => Promise<void> }> = ({ value, label, onCommit }) => {
    const [v, setV] = useState<number | null>(value);
    useEffect(() => { setV(value); }, [value]);
    return (
        <div
            className="w-[120px] ml-auto"
            onBlur={() => { if (v !== null && roundMoney(v) !== roundMoney(value)) void onCommit(v).catch(() => setV(value)); }}
        >
            <MoneyInput value={v} onChange={setV} currency="" aria-label={label} className="[&_input]:h-9" />
        </div>
    );
};

const WatchPrices: React.FC<{ item: RepairItem; ctx: OrderContext; run: Run; included: boolean; onInclude: (v: boolean) => void; money: (n: number) => string }> = ({ item, ctx, run, included, onInclude, money }) => {
    const [taskOpen, setTaskOpen] = useState(false);
    const [partOpen, setPartOpen] = useState(false);
    const name = item.name!;
    const tasks = item.tasks || [];
    const parts = item.parts_used || [];
    const { stage } = stageOfWatch(item, 0);
    const says = (item.issues || []).map(i => (i.is_other ? i.other_description || 'Other' : i.issue)).join(', ');
    const diag = [...(item.diagnosis_summary || [])].join(', ');
    return (
        <Card className={cx(!included && 'opacity-70')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-[16px] font-extrabold">
                        {watchTitle(item, ctx.models)} {item.serial_number && <span className="text-[13px] font-semibold text-dw-caption">S/N {item.serial_number}</span>}
                    </h2>
                    <p className="m-0 mt-0.5 text-[13px] text-dw-body">
                        {says && <>Says: {says}. </>}
                        {diag && <>Found: {diag}. </>}
                        {item.recommended_work?.length ? <>Work needed: {item.recommended_work.join(', ')}.</> : null}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <StageBadge stage={stage} />
                    <Toggle checked={included} onChange={onInclude} label="In this estimate" hideLabel />
                </div>
            </div>
            {included && (
                <>
                    <table className="w-full mt-3 border-collapse text-[14px]">
                        <thead>
                            <tr className="text-[11px] font-extrabold tracking-[.05em] uppercase text-dw-caption">
                                <th className="text-left py-2 border-b border-dw-border">Work and parts</th>
                                <th className="text-left py-2 border-b border-dw-border hidden sm:table-cell">From</th>
                                <th className="text-right py-2 border-b border-dw-border">Price</th>
                                <th className="w-10 border-b border-dw-border" />
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(t => (
                                <tr key={t.service} className="border-b border-dw-line">
                                    <td className="py-2 font-bold">{taskName(t.service, ctx)}</td>
                                    <td className="py-2 text-[12px] text-dw-caption hidden sm:table-cell">{t.price_manually_set ? 'price set here' : 'task price list'}</td>
                                    <td className="py-1.5"><PriceCell value={taskPrice(t, ctx)} label={`Price of ${taskName(t.service, ctx)}`} onCommit={v => run(`rate:${t.service}`, () => deskApi.setTaskRate(name, t.service, v))} /></td>
                                    <td className="text-right">
                                        {(t as { is_manual?: number }).is_manual === 1 && t.status === 'Pending' && (
                                            <IconButton size="sm" variant="ghost" icon="x" label="Remove" onClick={() => void run(`rm:${t.service}`, () => deskApi.removeTask(name, t.service)).catch(() => undefined)} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {parts.map(p => {
                                const info = ctx.parts[p.part];
                                const each = partPrice({ ...p, quantity: 1 }, ctx);
                                return (
                                    <tr key={p.name || p.part} className="border-b border-dw-line">
                                        <td className="py-2 font-bold">{info?.item_name || p.part} <span className="font-semibold text-dw-caption">× {p.quantity}</span></td>
                                        <td className={cx('py-2 text-[12px] hidden sm:table-cell', info && (info.stock_qty || 0) < p.quantity ? 'text-dw-danger font-bold' : 'text-dw-caption')}>
                                            part · {info ? `${info.stock_qty || 0} in stock` : ''}
                                        </td>
                                        <td className="py-1.5">
                                            <PriceCell value={roundMoney(each * p.quantity)} label={`Price of ${info?.item_name || p.part}`}
                                                onCommit={v => run(`prate:${p.name}`, () => deskApi.setPartLine(name, p.name!, { rate: v == null ? null : roundMoney(v / (p.quantity || 1)) }))} />
                                        </td>
                                        <td className="text-right">
                                            {p.name && <IconButton size="sm" variant="ghost" icon="x" label="Remove part" onClick={() => void run(`rmp:${p.name}`, () => deskApi.removePart(name, p.name!)).catch(() => undefined)} />}
                                        </td>
                                    </tr>
                                );
                            })}
                            {tasks.length === 0 && parts.length === 0 && (
                                <tr><td colSpan={4} className="py-4 text-[13px] text-dw-caption">No work yet. Add the work the customer is being quoted for.</td></tr>
                            )}
                        </tbody>
                    </table>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Button size="sm" icon="plus" onClick={() => setTaskOpen(true)}>Add work</Button>
                        {!partOpen && <Button size="sm" icon="plus" onClick={() => setPartOpen(true)}>Add part</Button>}
                    </div>
                    {partOpen && (
                        <PartPicker item={item} ctx={ctx} onCancel={() => setPartOpen(false)}
                            onAdd={async (part, qty, task) => { await run(`addpart:${name}`, () => deskApi.addPart(name, part, qty, task), 'Part added'); setPartOpen(false); }} />
                    )}
                    <div className="flex justify-end gap-6 mt-3 pt-3 border-t border-dw-line text-[14px]">
                        <span className="text-dw-caption font-semibold">Watch subtotal</span>
                        <span className="text-[16px] font-extrabold tabular-nums">{money(watchPrice(item, ctx))}</span>
                    </div>
                    <TaskPicker open={taskOpen} onClose={() => setTaskOpen(false)} ctx={ctx} existing={tasks.map(t => t.service)}
                        onPick={async s => { await run(`addtask:${name}`, () => deskApi.addTask(name, s), 'Work added'); setTaskOpen(false); }} />
                </>
            )}
        </Card>
    );
};

const EstimateScreen: React.FC<{ name: string }> = ({ name }) => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const { data, error, busy, refresh, run } = useOrder(name);
    const [phase, setPhase] = useState<Phase | null>(null);
    const [included, setIncluded] = useState<Record<string, boolean>>({});
    const [type, setType] = useState<'Estimate' | 'Final'>('Estimate');
    const [validTill, setValidTill] = useState<string | null>(addDays(toISODate(new Date()), 14));
    const [note, setNote] = useState('');
    const [creating, setCreating] = useState(false);
    const [made, setMade] = useState<{ quotation: string; total: number; items: string[] } | null>(null);
    const [preview, setPreview] = useState<apiService.EstimateNotificationPreview | null>(null);
    const [sending, setSending] = useState<'wa' | 'told' | null>(null);
    const [outcome, setOutcome] = useState<'approved' | 'declined' | 'changes' | null>(null);

    const order = data?.order;
    const ctx = data?.ctx;

    // Watches still before repair can be quoted; the ones at "Estimate to send" are ticked.
    const quotable = useMemo(() => (order ? order.items.filter(i => ['received', 'diagnosing', 'estimate', 'customer'].includes(watchStage(i, order).stage)) : []), [order]);
    const waiting = useMemo(() => (order ? order.items.filter(i => watchStage(i, order).stage === 'customer') : []), [order]);

    useEffect(() => {
        if (!order || phase) return;
        const toQuote = order.items.filter(i => watchStage(i, order).stage === 'estimate');
        setIncluded(Object.fromEntries(quotable.map(i => [i.name!, toQuote.length ? toQuote.includes(i) : true])));
        setPhase(toQuote.length === 0 && waiting.length > 0 ? 'answer' : 'review');
    }, [order, phase, quotable, waiting]);

    useEffect(() => {
        if (phase !== 'send' || !made || !ctx?.whatsapp_enabled) return;
        apiService.previewEstimateNotification(name, made.items[0]).then(setPreview).catch(() => setPreview(null));
    }, [phase, made, ctx?.whatsapp_enabled, name]);

    if (error && !data) return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="alert" title="Could not open this order" body={error} /></Card>;
    if (!order || !ctx || !phase) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

    const chosen = quotable.filter(i => included[i.name!]);
    const total = chosen.reduce((s, i) => s + watchPrice(i, ctx), 0);
    const work = chosen.reduce((s, i) => s + (i.tasks || []).reduce((a, t) => a + taskPrice(t, ctx), 0), 0);
    const partsTotal = total - work;
    const custName = ctx.customer?.customer_name || order.customer;
    const qFormat = ctx.quotation_print_format || 'Standard';

    const create = async () => {
        setCreating(true);
        try {
            const r = await deskApi.createEstimate(order.name, chosen.map(i => i.name!), type, validTill || '', note);
            setMade({ quotation: r.quotation, total: r.grand_total, items: chosen.map(i => i.name!) });
            await refresh();
            setPhase('send');
            window.scrollTo({ top: 0 });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'The estimate was not made.');
        } finally {
            setCreating(false);
        }
    };

    const markSent = async (via: 'wa' | 'told') => {
        if (!made) return;
        setSending(via);
        try {
            if (via === 'wa') for (const it of made.items) await apiService.notifyEstimateCustomer(order.name, it);
            for (const it of made.items) {
                const item = order.items.find(i => i.name === it);
                if (item && watchStage(item, order).stage !== 'customer') {
                    await deskApi.setWatchStage(it, 'customer', via === 'wa' ? 'sent on WhatsApp' : 'told the customer');
                }
            }
            await refresh();
            toast.success(via === 'wa' ? 'Estimate sent on WhatsApp' : 'Marked as told');
            setPhase('answer');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Not sent.');
        } finally {
            setSending(null);
        }
    };

    const answer = async (item: RepairItem, a: 'approved' | 'declined' | 'changes') => {
        await run(`answer:${item.name}`, () => (a === 'approved'
            ? deskApi.runStageAction(item.name!, 'approve')
            : a === 'declined'
                ? deskApi.runStageAction(item.name!, 'decline')
                : deskApi.setWatchStage(item.name!, 'estimate', 'customer wants changes')));
        setOutcome(a);
        if (a === 'changes') {
            setIncluded(cur => ({ ...cur, [item.name!]: true }));
            setPhase('review');
        } else if (waiting.length <= 1) {
            setPhase('done');
        }
    };

    const steps: Array<[Phase, string]> = [['review', 'Review prices'], ['send', 'Send'], ['answer', 'Customer’s answer']];
    const stepIndex = phase === 'done' ? 3 : steps.findIndex(s => s[0] === phase);

    return (
        <div className="max-w-[1180px] mx-auto">
            <div className="flex flex-wrap items-center gap-3">
                <IconButton icon="chevronLeft" label="Back to the order" onClick={() => goBack(buildPath('orders', order.name))} />
                <div className="flex-1 min-w-[200px]">
                    <h1 className="m-0 text-[20px] font-extrabold">Estimate · {order.name} · {custName}</h1>
                    <p className="m-0 text-[12px] font-semibold text-dw-caption">{order.items.length} {order.items.length === 1 ? 'watch' : 'watches'} · received {formatDay(order.received_date)}</p>
                </div>
                <ol className="m-0 p-0 list-none flex gap-4" aria-label="Steps">
                    {steps.map(([p, label], i) => (
                        <li key={p} className={cx('flex items-center gap-2 text-[13px] font-bold', i === stepIndex ? 'text-dw-text' : 'text-dw-caption')} aria-current={i === stepIndex ? 'step' : undefined}>
                            <span className={cx('w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-extrabold', i < stepIndex ? 'bg-dw-success text-white' : i === stepIndex ? 'bg-dw-accent text-white' : 'bg-dw-sunken')}>
                                {i < stepIndex ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}
                            </span>
                            <span className="hidden md:inline">{label}</span>
                        </li>
                    ))}
                </ol>
            </div>

            <div className="mt-5 flex flex-col lg:flex-row gap-5 items-start">
                <section className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">
                    {phase === 'review' && (
                        quotable.length === 0 ? (
                            <Card><EmptyState icon="check" title="Nothing to quote" body="Every watch on this order is already in repair, ready or returned." action={<Button onClick={() => navigate(buildPath('orders', order.name))}>Back to the order</Button>} /></Card>
                        ) : (
                            <>
                                {outcome === 'changes' && <p className="m-0 p-3 rounded-dw-control bg-dw-warning-soft text-dw-warning text-[13px] font-semibold">The customer wants changes. Adjust the prices or work, then make a new estimate.</p>}
                                {quotable.map(i => (
                                    <WatchPrices key={i.name} item={i} ctx={ctx} run={run} money={formatCurrency}
                                        included={!!included[i.name!]} onInclude={v => setIncluded(cur => ({ ...cur, [i.name!]: v }))} />
                                ))}
                                <Card className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                                    <Field label="Type">
                                        <Segmented<'Estimate' | 'Final'> label="Estimate type" size="sm" value={type} onChange={setType}
                                            options={[{ value: 'Estimate', label: 'Before repair' }, { value: 'Final', label: 'Final' }]} />
                                    </Field>
                                    <Field label="Valid until"><DatePicker value={validTill} min={toISODate(new Date())} onChange={setValidTill} aria-label="Valid until" /></Field>
                                    <Field label="Note on the estimate" optional className="sm:col-span-3">
                                        <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Printed on the customer's copy" maxLength={240} />
                                        <Chips label="Common notes" options={NOTES.map(n => ({ value: n, label: n }))} value={NOTES.includes(note) ? note : null} onChange={v => setNote(v || '')} allowNone className="mt-2" />
                                    </Field>
                                </Card>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="m-0 text-[13px] font-semibold text-dw-caption max-w-[460px]">Making the estimate does not message the customer. You choose how to send it next.</p>
                                    <div className="flex gap-2">
                                        <Button onClick={() => goBack(buildPath('orders', order.name))}>Cancel</Button>
                                        <Button variant="primary" busy={creating || !!busy} disabled={!chosen.length || total <= 0} onClick={() => void create()}>
                                            Make estimate · {formatCurrency(total)}
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )
                    )}

                    {phase === 'send' && made && (
                        <>
                            <Card className="border-[#B9E2C7]">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="m-0 text-[16px] font-extrabold">Estimate {made.quotation} made</h2>
                                        <p className="m-0 text-[13px] font-semibold text-dw-caption">{type === 'Final' ? 'Final' : 'Before repair'} · {formatCurrency(made.total)}{validTill ? ` · valid until ${formatDay(validTill)}` : ''}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground" href={deskApi.printUrl('Quotation', made.quotation, qFormat)} target="_blank" rel="noreferrer"><Icon name="print" size={16} />Print</a>
                                        <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground" href={deskApi.printUrl('Quotation', made.quotation, qFormat, true)} target="_blank" rel="noreferrer"><Icon name="download" size={16} />PDF</a>
                                    </div>
                                </div>
                            </Card>
                            <Card>
                                <h2 className="m-0 mb-3 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Tell the customer</h2>
                                <div className="flex flex-col md:flex-row gap-4 items-start">
                                    {ctx.whatsapp_enabled ? (
                                        <div className="flex-1 min-w-0">
                                            {preview ? (
                                                <>
                                                    <div className="rounded-2xl rounded-tl-none px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap bg-[#DCF8C6]">{preview.message_body}</div>
                                                    <p className="m-0 mt-1.5 text-[12px] font-semibold text-dw-caption">To {preview.phone_display}{made.items.length > 1 ? ` · one message per watch, ${made.items.length} in all` : ''}</p>
                                                </>
                                            ) : <Spinner />}
                                        </div>
                                    ) : (
                                        <p className="flex-1 m-0 text-[14px] text-dw-body">WhatsApp is not switched on. Call or message the customer, then mark it as told.</p>
                                    )}
                                    <div className="flex flex-col gap-2 w-full md:w-[220px]">
                                        {ctx.whatsapp_enabled && <Button variant="primary" icon="whatsapp" busy={sending === 'wa'} disabled={!!sending || !preview} onClick={() => void markSent('wa')}>Send on WhatsApp</Button>}
                                        {ctx.customer?.mobile && <a href={`tel:${ctx.customer.mobile.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-2 h-[42px] rounded-dw-control border border-dw-border-strong text-[14px] font-bold text-dw-text no-underline hover:bg-dw-ground"><Icon name="phone" size={18} />Call {ctx.customer.mobile}</a>}
                                        <Button busy={sending === 'told'} disabled={!!sending} onClick={() => void markSent('told')}>Told them, mark as sent</Button>
                                        <Button variant="ghost" disabled={!!sending} onClick={() => navigate(buildPath('orders', order.name))}>Send later</Button>
                                    </div>
                                </div>
                                <p className="m-0 mt-3 text-[12px] font-semibold text-dw-caption">Sending moves the {made.items.length === 1 ? 'watch' : 'watches'} to “Waiting customer”.</p>
                            </Card>
                        </>
                    )}

                    {phase === 'answer' && (
                        waiting.length === 0 ? (
                            <Card><EmptyState icon="check" title="No watch is waiting for an answer" action={<Button onClick={() => navigate(buildPath('orders', order.name))}>Back to the order</Button>} /></Card>
                        ) : waiting.map(i => (
                            <Card key={i.name}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h2 className="m-0 text-[16px] font-extrabold">{watchTitle(i, ctx.models)}</h2>
                                        <p className="m-0 text-[13px] font-semibold text-dw-caption">Estimate {formatCurrency(watchPrice(i, ctx))}{ctx.last_message?.sent_at ? ` · last message ${formatDay(ctx.last_message.sent_at)}` : ''}</p>
                                    </div>
                                    <StageBadge stage="customer" />
                                </div>
                                <p className="m-0 mt-4 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">What did the customer say?</p>
                                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
                                    <Button variant="success" size="lg" icon="check" busy={busy === `answer:${i.name}`} onClick={() => void answer(i, 'approved').catch(() => undefined)}>Approved, start</Button>
                                    <Button variant="danger" size="lg" icon="x" disabled={!!busy} onClick={() => void answer(i, 'declined').catch(() => undefined)}>Declined, return</Button>
                                    <Button size="lg" icon="edit" disabled={!!busy} onClick={() => void answer(i, 'changes').catch(() => undefined)}>Wants changes</Button>
                                </div>
                            </Card>
                        ))
                    )}

                    {phase === 'done' && (
                        <Card className={outcome === 'declined' ? 'border-[#F2C4C4]' : 'border-[#B9E2C7]'}>
                            <h2 className="m-0 text-[18px] font-extrabold">{outcome === 'declined' ? 'Declined · the watch is listed to return' : 'Approved · the watch is in repair'}</h2>
                            <p className="m-0 mt-1.5 text-[14px] text-dw-body leading-relaxed">
                                {outcome === 'declined'
                                    ? 'No charge. It shows under “Ready / to return” at the front desk so it can be handed back and the order closed.'
                                    : 'The technician sees it on their bench with the tasks to tick. The desk tells the customer when it is ready.'}
                            </p>
                            <div className="flex gap-2 mt-4">
                                <Button variant="primary" onClick={() => navigate(buildPath('orders', order.name), { replace: true })}>Back to the order</Button>
                                <Button onClick={() => navigate('/desk')}>Front desk</Button>
                            </div>
                        </Card>
                    )}
                </section>

                <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                    <Card>
                        <p className="m-0 text-[15px] font-extrabold">{custName}</p>
                        <p className="m-0 text-[13px] text-dw-body">{ctx.customer?.mobile || 'No mobile'}{ctx.customer?.previous_orders ? ` · ${ctx.customer.previous_orders} other orders` : ' · first repair'}</p>
                    </Card>
                    {phase === 'review' && quotable.length > 0 && (
                        <Card>
                            <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Totals</h2>
                            {[['Work', work], ['Parts', partsTotal]].map(([k, v]) => (
                                <div key={k as string} className="flex justify-between py-2 border-b border-dw-line text-[14px]"><span className="text-dw-body font-semibold">{k}</span><span className="font-bold tabular-nums">{formatCurrency(v as number)}</span></div>
                            ))}
                            <div className="flex justify-between py-2 text-[15px]"><span className="font-extrabold">Estimate total</span><span className="font-extrabold tabular-nums">{formatCurrency(total)}</span></div>
                            <p className="m-0 mt-1 text-[12px] font-semibold text-dw-caption leading-relaxed">The customer's copy shows one line per watch; parts are included in it.</p>
                        </Card>
                    )}
                    <Card>
                        <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Estimates on this order</h2>
                        {ctx.quotations.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">None yet.</p> : ctx.quotations.map(q => (
                            <div key={q.name} className="flex items-center justify-between gap-2 py-2 border-b border-dw-line last:border-b-0">
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-bold">{formatDay(q.transaction_date)} · {formatCurrency(q.grand_total)}</span>
                                    <span className="block text-[12px] text-dw-caption">{q.name} · {q.status.toLowerCase()}</span>
                                </span>
                                <a href={deskApi.printUrl('Quotation', q.name, qFormat)} target="_blank" rel="noreferrer" className="text-[13px] font-bold">Print</a>
                            </div>
                        ))}
                    </Card>
                </aside>
            </div>
        </div>
    );
};

export default EstimateScreen;
