/**
 * Edits that used to live in the 1,500-line order form: order details,
 * one watch's details, adding a watch, and the invoice view. Each saves
 * one narrow change.
 */
import React, { useEffect, useState } from 'react';
import type { RepairItem, RepairOrder } from '../../types';
import type { OrderContext } from '../../services/deskApi';
import * as deskApi from '../../services/deskApi';
import * as apiService from '../../services/apiService';
import { Button, DatePicker, Field, Icon, SearchField, Sheet, Spinner, TextArea, formatDay, toISODate, useToast } from '../../design/kit';
import { WatchForm, emptyWatch, watchReady, type WatchDraft } from '../shared/WatchForm';

type Run = (key: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

export const OrderDetailsSheet: React.FC<{ open: boolean; onClose: () => void; order: RepairOrder; ctx: OrderContext; run: Run }> = ({ open, onClose, order, ctx, run }) => {
    const [received, setReceived] = useState<string | null>(order.received_date);
    const [customer, setCustomer] = useState<deskApi.CustomerHit | null>(null);
    const [text, setText] = useState('');
    const [hits, setHits] = useState<deskApi.CustomerHit[] | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) { setReceived(order.received_date); setCustomer(null); setText(''); setHits(null); } }, [open, order.received_date]);

    const search = (q: string) => {
        if (!q) { setHits(null); return; }
        deskApi.findCustomers(q).then(setHits).catch(() => setHits([]));
    };
    const dirty = (received && received !== order.received_date) || !!customer;
    const save = async () => {
        setBusy(true);
        try {
            await run('details', () => deskApi.updateOrderDetails(order.name, {
                ...(received && received !== order.received_date ? { received_date: received } as Record<string, string> : {}),
                ...(customer ? { customer: customer.name } as Record<string, string> : {}),
            }), 'Order saved');
            onClose();
        } catch { /* toast shown */ } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title="Order details" description={`Order ${order.name}`} dismissable={!busy}
            footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!dirty} onClick={() => void save()}>Save</Button></>}>
            <div className="flex flex-col gap-4">
                <Field label="Customer">
                    {customer ? (
                        <div className="flex items-center gap-3 p-3 rounded-dw-control border border-dw-accent bg-[#EEF3FC]">
                            <span className="flex-1 text-[14px] font-bold">{customer.customer_name} <span className="font-semibold text-dw-caption">{customer.mobile_no}</span></span>
                            <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Undo</Button>
                        </div>
                    ) : (
                        <>
                            <p className="m-0 text-[14px] font-bold">{ctx.customer?.customer_name || order.customer} <span className="font-semibold text-dw-caption">{ctx.customer?.mobile}</span></p>
                            <SearchField value={text} onChange={setText} onSearch={search} placeholder="Change to: mobile or name" label="Find another customer" className="mt-2" />
                            {hits && (
                                <div className="mt-1 border border-dw-border rounded-dw-control overflow-hidden max-h-[220px] overflow-y-auto">
                                    {hits.length === 0 ? <p className="m-0 p-3 text-[13px] text-dw-caption">No match. New customers are added from New order.</p> : hits.map(h => (
                                        <button key={h.name} type="button" onClick={() => setCustomer(h)} className="w-full px-3 py-2.5 text-left border-b border-dw-line last:border-b-0 hover:bg-dw-ground">
                                            <span className="block text-[14px] font-bold">{h.customer_name}</span>
                                            <span className="block text-[12px] text-dw-caption">{h.mobile_no} · {h.orders} orders</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </Field>
                <Field label="Received" hint="Promised date, priority and tag are edited on the order page.">
                    <DatePicker value={received} max={toISODate(new Date())} onChange={setReceived} aria-label="Received" />
                </Field>
            </div>
        </Sheet>
    );
};

const draftFrom = (item: RepairItem, models: Record<string, string>): WatchDraft => ({
    ...emptyWatch(),
    brand: item.watch_brand || '',
    model: item.watch_model || '',
    modelLabel: models[item.watch_model] || item.watch_model || '',
    serial: item.serial_number || '',
    conditions: item.pre_existing_condition || [],
    more: !!(item.case_type || item.strap_bracelet || item.watch_type || item.dial),
    case_type: item.case_type || '',
    strap_bracelet: item.strap_bracelet || '',
    watch_type: item.watch_type || '',
    dial: item.dial || '',
});

const fieldsFrom = (w: WatchDraft): deskApi.WatchFields => ({
    watch_brand: w.brand,
    watch_model: w.model,
    serial_number: w.serial.trim(),
    case_type: w.case_type,
    strap_bracelet: w.strap_bracelet,
    watch_type: w.watch_type,
    dial: w.dial,
    pre_existing_condition: w.conditions,
});

/** Edit one watch (item given) or add a watch to the order (no item). */
export const WatchDetailsSheet: React.FC<{ open: boolean; onClose: () => void; order: RepairOrder; ctx: OrderContext; item: RepairItem | null; run: Run }> = ({ open, onClose, order, ctx, item, run }) => {
    const [w, setW] = useState<WatchDraft>(emptyWatch());
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setW(item ? draftFrom(item, ctx.models) : emptyWatch()); }, [open, item, ctx.models]);

    const save = async () => {
        setBusy(true);
        try {
            if (item) await run(`watch:${item.name}`, () => deskApi.updateWatchDetails(item.name!, fieldsFrom(w)), 'Watch saved');
            else await run('addwatch', () => deskApi.addWatch(order.name, fieldsFrom(w)), 'Watch added. Add what the customer says on its card.');
            onClose();
        } catch { /* toast shown */ } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onClose={onClose} title={item ? 'Watch details' : 'Add a watch'} description={`Order ${order.name}`} width={680} dismissable={!busy}
            footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!watchReady(w)} onClick={() => void save()}>{item ? 'Save watch' : 'Add watch'}</Button></>}>
            {open && <WatchForm w={w} onChange={p => setW(cur => ({ ...cur, ...p }))} full={false} />}
        </Sheet>
    );
};

export const InvoiceSheet: React.FC<{ open: boolean; onClose: () => void; invoice: NonNullable<OrderContext['invoice']>; format: string; money: (n: number) => string }> = ({ open, onClose, invoice, format, money }) => {
    const toast = useToast();
    const [note, setNote] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setEditing(false);
        apiService.getDoc('Sales Invoice', invoice.name)
            .then(d => setNote((d?.dw_invoice_note ?? d?.invoice_note ?? '') as string))
            .catch(() => setNote(''));
    }, [open, invoice.name]);

    const save = async () => {
        setBusy(true);
        try {
            const r = await apiService.setInvoiceNote(invoice.name, note || '');
            setNote(r.note);
            setEditing(false);
            toast.success('Note saved');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Note not saved.');
        } finally {
            setBusy(false);
        }
    };

    const link = 'inline-flex items-center justify-center gap-2 h-[42px] px-4 rounded-dw-control border border-dw-border-strong text-[14px] font-bold text-dw-text no-underline hover:bg-dw-ground';
    return (
        <Sheet open={open} onClose={onClose} title={`Invoice ${invoice.name}`} description={`${formatDay(invoice.posting_date)} · ${invoice.status}`}>
            <div className="flex flex-col gap-4">
                <div>
                    {[['Total', money(invoice.grand_total)], ['Paid', money(invoice.grand_total - invoice.outstanding_amount)], ['Balance due', money(invoice.outstanding_amount)]].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-2 border-b border-dw-line last:border-b-0 text-[14px]"><span className="text-dw-body font-semibold">{k}</span><span className="font-extrabold tabular-nums">{v}</span></div>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <a className={link} href={deskApi.printUrl('Sales Invoice', invoice.name, format) + '&trigger_print=1'} target="_blank" rel="noreferrer"><Icon name="print" size={18} />Reprint</a>
                    <a className={link} href={deskApi.printUrl('Sales Invoice', invoice.name, format, true)} target="_blank" rel="noreferrer"><Icon name="download" size={18} />PDF</a>
                </div>
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-bold">Note printed on the invoice</span>
                        {!editing && note !== null && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{note ? 'Edit' : 'Add'}</Button>}
                    </div>
                    {note === null ? <Spinner /> : editing ? (
                        <>
                            <TextArea value={note} onChange={e => setNote(e.target.value)} rows={3} autoFocus aria-label="Invoice note" />
                            <div className="flex justify-end gap-2 mt-2">
                                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                                <Button size="sm" variant="primary" busy={busy} onClick={() => void save()}>Save note</Button>
                            </div>
                        </>
                    ) : <p className="m-0 text-[14px] text-dw-body whitespace-pre-wrap">{note || 'None.'}</p>}
                </div>
            </div>
        </Sheet>
    );
};
