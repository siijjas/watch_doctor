/**
 * Order page (canvas D4 / M5). One card per watch with the stage select
 * (desk only), technician, complaints, photos, diagnosis, tasks, parts,
 * parts hold and note; a right rail with customer, dates and money.
 *
 * Every edit is a narrow, one-watch call (spec B5.4). The estimate (D5)
 * and collect (D6) steps are their own screens.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { RepairItem, RepairOrder } from '../types';
import { Link, goBack, navigate, path as buildPath, useLocation } from '../router';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, ConfirmSheet, DatePicker, EmptyState, Icon, IconButton, Segmented, Sheet, Spinner,
    StageBadge, TextInput, formatDay, useToast, type StageChange,
} from '../design/kit';
import { orderLeadStage, stageOfWatch, summariseOrder } from '../design/stages';
import * as apiService from '../services/apiService';
import * as deskApi from '../services/deskApi';
import { useOrder, watchStage, watchTitle } from './order/useOrder';
import { WatchCard, specLine } from './order/WatchCard';
import { AssignSheet } from './shared/AssignSheet';
import { NotifyCustomerModal } from '../components/NotifyCustomerModal';
import { InvoiceSheet, OrderDetailsSheet, WatchDetailsSheet } from './order/EditSheets';

const PRINTS = [
    { id: 'label', label: 'Bag label', hint: 'For the Zebra label printer', format: '', size: { w: 400, h: 320 }, auto: true },
    { id: 'receipt', label: 'Drop-off receipt', hint: 'Customer copy', format: 'DW RO Repair Order' },
    { id: 'condition', label: 'Condition report with photos', hint: 'What the watch looked like on arrival', format: 'DW Product Visible Condition Report' },
] as const;

const NOT_INVOICED = new Set(['Delivered', 'Not Repairable', 'Declined']);

const Rail: React.FC<{ title: string; children: React.ReactNode; action?: React.ReactNode }> = ({ title, children, action }) => (
    <Card>
        <div className="flex items-center justify-between mb-2">
            <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{title}</h2>
            {action}
        </div>
        {children}
    </Card>
);

const KV: React.FC<{ k: React.ReactNode; children: React.ReactNode; tone?: string }> = ({ k, children, tone }) => (
    <div className="flex items-center justify-between gap-3 min-h-[36px] text-[14px] border-b border-dw-line last:border-b-0">
        <span className="text-dw-body font-semibold">{k}</span>
        <span className={`font-extrabold text-right tabular-nums ${tone || ''}`}>{children}</span>
    </div>
);

const OrderScreen: React.FC<{ name: string }> = ({ name }) => {
    const { hasRole, userInfo } = useAuth();
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const { query } = useLocation();
    const desk = hasRole('executive', 'data_entry');
    const { data, error, busy, refresh, run } = useOrder(name);

    const [assignFor, setAssignFor] = useState<RepairItem | null>(null);
    const [answerFor, setAnswerFor] = useState<RepairItem | null>(null);
    const [printOpen, setPrintOpen] = useState(false);
    const [invoiceOpen, setInvoiceOpen] = useState(false);
    const [notifyOpen, setNotifyOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [watchEdit, setWatchEdit] = useState<{ item: RepairItem | null } | null>(null);
    const [closeOpen, setCloseOpen] = useState(false);
    const [returnBlocked, setReturnBlocked] = useState<string | null>(null);
    const [tag, setTag] = useState('');

    const order = data?.order;
    const ctx = data?.ctx;
    useEffect(() => { setTag(order?.reference_number || ''); }, [order?.reference_number]);

    // A technician opening an order with one of their watches goes straight to that job (QR on the bag).
    const myTech = userInfo?.technician?.name;
    const myWatches = useMemo(() => (order && !desk ? order.items.filter(i => !myTech || i.technician === myTech) : []), [order, desk, myTech]);
    useEffect(() => {
        if (!desk && order && myWatches.length === 1 && myWatches[0].name) {
            navigate(buildPath('orders', name, 'watch', myWatches[0].name), { replace: true });
        }
    }, [desk, order, myWatches, name]);

    if (error && !data) {
        return (
            <Card className="max-w-md mx-auto mt-10">
                <EmptyState icon="alert" title={`Order ${name} could not be opened`} body={desk ? error : `${error} Ask the front desk if you should be working on it.`} action={<Button onClick={() => navigate(desk ? '/desk' : '/bench', { replace: true })}>Back to {desk ? 'the front desk' : 'my bench'}</Button>} />
            </Card>
        );
    }
    if (!order || !ctx) {
        return <div className="flex justify-center py-16 text-dw-caption" role="status" aria-label="Loading order"><Spinner size={28} /></div>;
    }

    const collected = order.docstatus === 1;
    const open = order.docstatus === 0;
    const lead = orderLeadStage(order.items, order.docstatus);
    const readyItems = order.items.filter(i => watchStage(i, order).stage === 'ready');
    const stillOpen = order.items.filter(i => !['ready', 'return', 'collected'].includes(watchStage(i, order).stage));

    function collect(item: RepairItem, o: RepairOrder = order!) {
        const stage = stageOfWatch(item, o.docstatus).stage;
        if (stage === 'return') {
            const pending = o.items.filter(i => !NOT_INVOICED.has(i.status));
            if (pending.length === 0) { setCloseOpen(true); return; }
            const ready = pending.filter(i => i.status === 'Completed');
            setReturnBlocked(ready.length === pending.length
                ? 'Collect and invoice the ready watches first; the order then closes with this one returned.'
                : `The order closes when every watch is finished. ${pending.length} other ${pending.length === 1 ? 'watch is' : 'watches are'} still in the workshop.`);
            return;
        }
        navigate(`${buildPath('orders', o.name, 'collect')}?watch=${encodeURIComponent(item.name || '')}`);
    }

    const onStage = async (item: RepairItem, change: StageChange) => {
        await run(`stage:${item.name}`, () => deskApi.setWatchStage(item.name!, change.to, change.reason, change.returnAs), 'Stage changed');
    };

    const print = (p: typeof PRINTS[number]) => {
        setPrintOpen(false);
        const go = (format: string) => {
            if (!deskApi.openPrint(order.name, format, 'auto' in p && p.auto, 'size' in p ? p.size : undefined)) {
                toast.error('The browser blocked the print window. Allow pop-ups for this site and try again.');
            }
        };
        if (p.id === 'label') {
            apiService.getRepairOrderLabelPrintFormat()
                .then(r => go(r.print_format || 'DW RO Bag Label'))
                .catch(() => go('DW RO Bag Label'));
        } else {
            go(p.format);
        }
    };

    const watchesFor = desk ? order.items : myWatches;
    const custName = ctx.customer?.customer_name || order.customer_name || order.customer;
    const mobile = ctx.customer?.mobile || '';

    const customerCard = (
        <Card>
            <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-[12px] bg-dw-sunken flex items-center justify-center font-extrabold shrink-0">
                    {custName.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                </span>
                <span className="min-w-0">
                    <Link to={buildPath('customers', order.customer)} className="block text-[15px] font-extrabold truncate text-dw-text no-underline hover:underline">{custName}</Link>
                    <span className="block text-[13px] text-dw-body">
                        {mobile || 'No mobile'}{ctx.customer?.previous_orders ? ` · ${ctx.customer.previous_orders} other ${ctx.customer.previous_orders === 1 ? 'order' : 'orders'}` : ''}
                    </span>
                </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
                {mobile ? (
                    <a href={`tel:${mobile.replace(/\s/g, '')}`} className="inline-flex items-center justify-center gap-2 h-9 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground">
                        <Icon name="phone" size={16} />Call
                    </a>
                ) : <span />}
                {ctx.whatsapp_enabled && open && (
                    <Button size="sm" icon="whatsapp" onClick={() => setNotifyOpen(true)}>Message</Button>
                )}
            </div>
            {ctx.last_message && (
                <p className="m-0 mt-2.5 text-[12px] font-semibold text-dw-caption">
                    Last message: {ctx.last_message.label} · {formatDay(ctx.last_message.sent_at)} · {ctx.last_message.status.toLowerCase()}
                </p>
            )}
        </Card>
    );

    return (
        <div className="max-w-[1320px] mx-auto">
            {/* Header */}
            <div className="flex flex-wrap items-start gap-3">
                <IconButton icon="chevronLeft" label="Back" onClick={() => goBack(desk ? '/desk' : '/bench')} />
                <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="m-0 text-[22px] lg:text-[24px] font-extrabold tracking-[-.01em]">{order.name}</h1>
                        <StageBadge stage={lead}>{summariseOrder(order.items, order.docstatus)}</StageBadge>
                        {order.priority && order.priority !== 'Normal' && <StageBadge stage="estimate" dot={false}>{order.priority}</StageBadge>}
                        {order.docstatus === 2 && <StageBadge stage="return" dot={false}>Cancelled</StageBadge>}
                    </div>
                    <p className="m-0 mt-0.5 text-[13px] font-semibold text-dw-caption">
                        {[order.reference_number && `Tag ${order.reference_number}`,
                            `received ${formatDay(order.received_date)}${ctx.received_by ? ` by ${ctx.received_by}` : ''}`,
                            collected ? (order.delivery_date ? `collected ${formatDay(order.delivery_date)}` : 'collected') : order.promised_delivery_date && `promised ${formatDay(order.promised_delivery_date)}`,
                            `${order.items.length} ${order.items.length === 1 ? 'watch' : 'watches'}`].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {desk && <Button icon="print" onClick={() => setPrintOpen(true)}>Print</Button>}
                    {desk && open && <Button icon="edit" onClick={() => setDetailsOpen(true)}>Order details</Button>}
                </div>
            </div>

            <div className="mt-5 flex flex-col lg:flex-row gap-5 items-start">
                {/* Watches */}
                <section className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">
                    {desk && <div className="lg:hidden">{customerCard}</div>}
                    {desk ? watchesFor.map((item, i) => (
                        <WatchCard
                            key={item.name || i}
                            item={item}
                            index={i}
                            count={order.items.length}
                            order={order}
                            ctx={ctx}
                            run={run}
                            busy={busy}
                            money={formatCurrency}
                            actions={{
                                onStage,
                                onAssign: setAssignFor,
                                onEstimate: () => navigate(buildPath('orders', order.name, 'estimate')),
                                onAnswer: setAnswerFor,
                                onCollect: it => collect(it),
                                onEdit: it => setWatchEdit({ item: it }),
                            }}
                        />
                    )) : watchesFor.length === 0 ? (
                        <Card><EmptyState icon="wrench" title="None of these watches is assigned to you" body="Ask the front desk if you should be working on this order." /></Card>
                    ) : watchesFor.map(item => {
                        const s = watchStage(item, order);
                        return (
                            <Link key={item.name} to={buildPath('orders', order.name, 'watch', item.name!)} className="block no-underline text-dw-text">
                                <Card className="hover:border-dw-border-strong">
                                    <div className="flex items-center gap-3">
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[16px] font-extrabold truncate">{watchTitle(item, ctx.models)}</span>
                                            <span className="block text-[12px] font-semibold text-dw-caption truncate">{specLine(item)}</span>
                                        </span>
                                        <StageBadge stage={s.stage} />
                                        <Icon name="chevronRight" size={18} className="text-dw-caption" />
                                    </div>
                                </Card>
                            </Link>
                        );
                    })}

                    {desk && open && (
                        <Button icon="plus" className="border-dashed self-start" onClick={() => setWatchEdit({ item: null })}>Add another watch to this order</Button>
                    )}
                    {desk && (
                        <Card>
                            <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Activity</h2>
                            <ol className="m-0 p-0 list-none">
                                {ctx.activity.map((a, i) => (
                                    <li key={i} className="flex gap-4 py-2.5 border-b border-dw-line last:border-b-0 text-[13px]">
                                        <span className="w-[64px] shrink-0 text-dw-caption font-semibold">{formatDay(a.at)}</span>
                                        <span className="flex-1 min-w-0">{a.text}<span className="text-dw-caption"> · {a.by}</span></span>
                                    </li>
                                ))}
                            </ol>
                        </Card>
                    )}
                </section>

                {/* Right rail; on phones it follows the watches and the customer card sits on top */}
                {desk && (
                    <aside className="w-full lg:w-[340px] shrink-0 flex flex-col gap-4">
                        <div className="hidden lg:block">{customerCard}</div>

                        <Rail title="Dates">
                            <KV k="Received">{formatDay(order.received_date)}</KV>
                            {open ? (
                                <>
                                    <div className="py-2 border-b border-dw-line">
                                        <span className="block text-[14px] font-semibold text-dw-body mb-1.5">Promised</span>
                                        <DatePicker
                                            value={order.promised_delivery_date || null}
                                            min={order.received_date}
                                            aria-label="Promised date"
                                            onChange={v => void run('promised', () => deskApi.updateOrderDetails(order.name, { promised_delivery_date: v || '' }), 'Promised date changed').catch(() => undefined)}
                                        />
                                    </div>
                                    <div className="py-2 border-b border-dw-line">
                                        <span className="block text-[14px] font-semibold text-dw-body mb-1.5">Priority</span>
                                        <Segmented
                                            label="Priority"
                                            size="sm"
                                            value={(order.priority || 'Normal') as string}
                                            options={[{ value: 'Normal', label: 'Normal' }, { value: 'Urgent', label: 'Urgent' }, { value: 'VIP', label: 'VIP' }]}
                                            onChange={v => void run('priority', () => deskApi.updateOrderDetails(order.name, { priority: v }), `Priority: ${v}`).catch(() => undefined)}
                                        />
                                    </div>
                                    <div className="py-2">
                                        <label htmlFor="bag-tag" className="block text-[14px] font-semibold text-dw-body mb-1.5">Bag tag</label>
                                        <TextInput
                                            id="bag-tag"
                                            value={tag}
                                            placeholder="Tag number"
                                            onChange={e => setTag(e.target.value)}
                                            onBlur={() => { if (tag.trim() !== (order.reference_number || '')) void run('tag', () => deskApi.updateOrderDetails(order.name, { reference_number: tag.trim() }), 'Tag saved').catch(() => undefined); }}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <KV k="Promised">{formatDay(order.promised_delivery_date) || '—'}</KV>
                                    {order.delivery_date && <KV k="Collected">{formatDay(order.delivery_date)}</KV>}
                                </>
                            )}
                        </Rail>

                        <Rail title="Money">
                            {ctx.quotation ? (
                                <KV k={`Estimate · ${ctx.quotation.status.toLowerCase()}`}>{formatCurrency(ctx.quotation.grand_total)}</KV>
                            ) : <KV k="Estimate"><span className="text-dw-caption font-semibold">none yet</span></KV>}
                            {ctx.invoice ? (
                                <>
                                    <KV k="Invoiced">{formatCurrency(ctx.invoice.grand_total)}</KV>
                                    <KV k="Paid">{formatCurrency(ctx.invoice.grand_total - ctx.invoice.outstanding_amount)}</KV>
                                    <KV k="Balance due" tone={ctx.invoice.outstanding_amount > 0 ? 'text-dw-warning' : 'text-dw-success'}>{formatCurrency(ctx.invoice.outstanding_amount)}</KV>
                                </>
                            ) : <KV k="Invoice"><span className="text-dw-caption font-semibold">not yet</span></KV>}
                            <div className="flex gap-2 mt-3 flex-wrap">
                                {open && <Button size="sm" onClick={() => navigate(buildPath('orders', order.name, 'estimate'))}>{ctx.quotation ? 'Estimates' : 'Make estimate'}</Button>}
                                {ctx.quotation && (
                                    <a href={deskApi.printUrl('Quotation', ctx.quotation.name, ctx.quotation_print_format || 'Standard')} target="_blank" rel="noreferrer"
                                        className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground">
                                        <Icon name="print" size={16} />Estimate
                                    </a>
                                )}
                                {ctx.invoice && <Button size="sm" onClick={() => setInvoiceOpen(true)}>Invoice</Button>}
                            </div>
                        </Rail>

                        {open && readyItems.length > 0 && (
                            <>
                                <Button variant="primary" size="lg" block onClick={() => collect(readyItems[0])}>
                                    Collect &amp; invoice {readyItems.length === 1 ? 'ready watch' : `${readyItems.length} ready watches`}
                                </Button>
                                {stillOpen.length > 0 && (
                                    <p className="m-0 -mt-2 text-[12px] font-semibold text-dw-caption text-center">
                                        {stillOpen.map(i => watchTitle(i, ctx.models)).join(', ')} {stillOpen.length === 1 ? 'is' : 'are'} still in progress. Collecting now leaves the order open for {stillOpen.length === 1 ? 'it' : 'them'}.
                                    </p>
                                )}
                            </>
                        )}
                    </aside>
                )}
            </div>

            {/* Sheets */}
            <Sheet open={printOpen} onClose={() => setPrintOpen(false)} title="Print" description={`Order ${order.name}`}>
                <div className="flex flex-col gap-1">
                    {PRINTS.map(p => (
                        <button key={p.id} type="button" onClick={() => print(p)} className="flex items-center gap-3 min-h-[52px] px-3 rounded-[10px] text-left hover:bg-dw-ground">
                            <Icon name="print" size={18} className="text-dw-caption" />
                            <span className="flex-1"><span className="block text-[14px] font-bold">{p.label}</span><span className="block text-[12px] text-dw-caption">{p.hint}</span></span>
                        </button>
                    ))}
                </div>
            </Sheet>

            <AssignSheet
                open={!!assignFor}
                onClose={() => setAssignFor(null)}
                watch={assignFor ? watchTitle(assignFor, ctx.models) : ''}
                current={assignFor?.technician}
                technicians={ctx.technicians}
                onAssign={tech => run(`assign:${assignFor?.name}`, () => deskApi.assignTechnician(assignFor!.name!, tech), tech ? 'Technician assigned' : 'Technician removed')}
            />

            <Sheet open={!!answerFor} onClose={() => setAnswerFor(null)} title="What did the customer say?" description={answerFor ? watchTitle(answerFor, ctx.models) : ''}>
                {answerFor && (
                    <div className="flex flex-col gap-2">
                        <Button variant="success" size="lg" block icon="check" busy={busy === 'answer'} onClick={() => void run('answer', () => deskApi.runStageAction(answerFor.name!, 'approve'), 'Approved. The technician can start.').then(() => setAnswerFor(null)).catch(() => undefined)}>
                            Approved, go ahead
                        </Button>
                        <Button variant="danger" size="lg" block icon="x" disabled={busy === 'answer'} onClick={() => void run('answer', () => deskApi.runStageAction(answerFor.name!, 'decline'), 'Declined. Listed to return.').then(() => setAnswerFor(null)).catch(() => undefined)}>
                            Declined, return the watch
                        </Button>
                    </div>
                )}
            </Sheet>

            <ConfirmSheet
                open={closeOpen}
                onClose={() => setCloseOpen(false)}
                title="Return without repair?"
                body="Every watch on this order is going back unrepaired, so no invoice is made. The order closes as collected."
                confirmLabel="Return and close order"
                onConfirm={() => run('close', () => apiService.closeOrderWithoutInvoice(order.name), 'Order closed. Watch returned.')}
            />

            <Sheet open={!!returnBlocked} onClose={() => setReturnBlocked(null)} title="Not yet" footer={<Button variant="primary" onClick={() => setReturnBlocked(null)}>OK</Button>}>
                <p className="m-0 text-[14px] text-dw-body leading-relaxed">{returnBlocked}</p>
            </Sheet>

            {desk && <OrderDetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} order={order} ctx={ctx} run={run} />}
            {desk && <WatchDetailsSheet open={!!watchEdit} onClose={() => setWatchEdit(null)} order={order} ctx={ctx} item={watchEdit?.item ?? null} run={run} />}
            {ctx.invoice && <InvoiceSheet open={invoiceOpen} onClose={() => setInvoiceOpen(false)} invoice={ctx.invoice} format={ctx.invoice_print_format || 'Standard'} money={formatCurrency} />}
            {ctx.whatsapp_enabled && (
                <NotifyCustomerModal isOpen={notifyOpen} onClose={() => setNotifyOpen(false)} orderName={order.name} orderStatus={order.status} onSuccess={() => void refresh()} />
            )}
        </div>
    );
};

export default OrderScreen;
