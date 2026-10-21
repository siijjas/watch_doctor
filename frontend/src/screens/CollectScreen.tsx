/**
 * Collect & invoice (canvas D6): pick the ready watches being handed over,
 * see the amount from those watches only, discount, warranty note, payment
 * (single / split / credit) with change due, print. Replaces the create
 * invoice and payment windows.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RepairItem } from '../types';
import { goBack, navigate, path as buildPath } from '../router';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, Chips, ConfirmSheet, EmptyState, Icon, IconButton, MoneyInput, PaymentModes, Segmented, Spinner,
    StageBadge, TextInput, Toggle, addDays, cx, formatDay, isCashMode, paymentError, roundMoney, toISODate, useToast,
    type PaymentValue,
} from '../design/kit';
import * as apiService from '../services/apiService';
import * as deskApi from '../services/deskApi';
import { useOrder, watchPrice, watchStage, watchTitle } from './order/useOrder';

const NOTES = ['6 months warranty', '1 year warranty', 'No water-resistance guarantee', 'Warranty recheck, no charge'];

const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

/** Hands the PDF to the phone's share sheet (WhatsApp etc.); elsewhere opens it to download. */
async function sharePdf(url: string, fileName: string, text: string) {
    const blob = await fetch(url, { credentials: 'include' }).then(r => { if (!r.ok) throw new Error('The PDF could not be made.'); return r.blob(); });
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
    else window.open(url, '_blank');
}

const CollectScreen: React.FC<{ name: string; preselect?: string | null }> = ({ name, preselect }) => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const { data, error, refresh } = useOrder(name);
    const [picked, setPicked] = useState<string[] | null>(null);
    const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
    const [discountInput, setDiscountInput] = useState<number | null>(null);
    const [note, setNote] = useState('');
    const [modes, setModes] = useState<string[]>([]);
    const [pay, setPay] = useState<PaymentValue>({ kind: 'single', mode: '', tendered: null });
    const [print, setPrint] = useState(true);
    const [thankYou, setThankYou] = useState(false);
    const [preview, setPreview] = useState<deskApi.CollectPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<(deskApi.CollectResult & { mode: string; tendered: number | null; labels: string[]; left: number }) | null>(null);
    const [closeOpen, setCloseOpen] = useState(false);
    const [bill, setBill] = useState<{ quotation: string; total: number; key: string } | null>(null);
    const [billing, setBilling] = useState(false);
    const req = useRef(0);
    const printWin = useRef<Window | null>(null);

    const order = data?.order;
    const ctx = data?.ctx;
    const ready = useMemo(() => (order ? order.items.filter(i => watchStage(i, order).stage === 'ready') : []), [order]);
    const returning = useMemo(() => (order ? order.items.filter(i => watchStage(i, order).stage === 'return') : []), [order]);
    const others = useMemo(() => (order ? order.items.filter(i => !['ready', 'return', 'collected'].includes(watchStage(i, order).stage)) : []), [order]);

    useEffect(() => {
        apiService.getPaymentModes().then(r => {
            const list = r.map((m: { mode_of_payment: string }) => m.mode_of_payment);
            setModes(list);
            setPay(p => (p.kind === 'single' && !p.mode ? { ...p, mode: list[0] || '' } : p));
        }).catch(() => setModes([]));
    }, []);

    useEffect(() => {
        if (!order || picked) return;
        const pre = ready.find(i => i.name === preselect);
        setPicked(pre && ready.length > 1 ? [pre.name!] : ready.map(i => i.name!));
    }, [order, ready, picked, preselect]);

    const chosen = ready.filter(i => picked?.includes(i.name!));
    const subtotal = ctx ? roundMoney(chosen.reduce((s, i) => s + watchPrice(i, ctx), 0)) : 0;
    const discount = roundMoney(discountMode === 'percent' ? subtotal * Math.min(100, discountInput || 0) / 100 : Math.min(subtotal, discountInput || 0));

    // The server's own totals (VAT, rounding), so payment always matches the invoice.
    useEffect(() => {
        if (!chosen.length) { setPreview(null); return; }
        const id = ++req.current;
        setPreviewing(true);
        const t = window.setTimeout(() => {
            deskApi.previewCollect(name, chosen.map(i => i.name!), discount)
                .then(p => { if (id === req.current) setPreview(p); })
                .catch(() => { if (id === req.current) setPreview(null); })
                .finally(() => { if (id === req.current) setPreviewing(false); });
        }, 350);
        return () => window.clearTimeout(t);
        // chosen is derived from picked; keyed on the names and the discount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, picked?.join(','), discount, data]);

    if (error && !data) return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="alert" title="Could not open this order" body={error} /></Card>;
    if (!order || !ctx || !picked) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

    const total = preview ? preview.grand_total : roundMoney(subtotal - discount);
    const custName = ctx.customer?.customer_name || order.customer;
    // Warranty rechecks (or a full discount) cost nothing: no payment to take.
    const noCharge = !!preview && !previewing && total === 0;
    const payErr = chosen.length && !noCharge ? paymentError(pay, total) : null;
    const canFinish = chosen.length > 0 && !payErr && !previewing && !!preview && order.docstatus === 0;
    const invFormat = ctx.invoice_print_format || 'Standard';

    const qFormat = ctx.quotation_print_format || 'Standard';
    // A bill is only offered while the watches, discount and note it was made for are unchanged.
    const billKey = `${chosen.map(i => i.name).join(',')}|${discount}|${note}`;
    const currentBill = bill && bill.key === billKey ? bill : null;

    const makeBill = async () => {
        setBilling(true);
        try {
            const r = await deskApi.createEstimate(order.name, chosen.map(i => i.name!), 'Final', '', note, discount);
            setBill({ quotation: r.quotation, total: r.grand_total, key: billKey });
            toast.success('Bill made');
            void refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'The bill was not made.');
        } finally {
            setBilling(false);
        }
    };

    const shareBill = async (q: string) => {
        try {
            await sharePdf(deskApi.printUrl('Quotation', q, qFormat, true), `${q}.pdf`, `${custName}, your watch is ready. Bill ${q}.`);
        } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error(e instanceof Error ? e.message : 'Not shared.');
        }
    };

    const toggle = (item: RepairItem) => setPicked(cur => (cur!.includes(item.name!) ? cur!.filter(n => n !== item.name) : [...cur!, item.name!]));

    const finish = async () => {
        if (print) printWin.current = window.open('about:blank', '_blank');
        setBusy(true);
        try {
            const r = await deskApi.collectWatches(order.name, {
                itemNames: chosen.map(i => i.name!),
                discount,
                mode: pay.kind === 'single' && !noCharge ? pay.mode : undefined,
                payments: pay.kind === 'split' && !noCharge ? pay.parts.map(p => ({ mode_of_payment: p.mode, amount: p.amount || 0 })) : undefined,
                credit: pay.kind === 'credit' && !noCharge ? { dueDate: pay.dueDate || addDays(toISODate(new Date()), 15) } : null,
                note,
            });
            setDone({
                ...r,
                mode: noCharge ? 'none' : pay.kind === 'single' ? pay.mode : pay.kind === 'split' ? 'split' : 'credit',
                tendered: pay.kind === 'single' && !noCharge ? pay.tendered : null,
                labels: chosen.map(i => watchTitle(i, ctx.models)),
                left: others.length + returning.length + ready.length - chosen.length,
            });
            const url = deskApi.printUrl('Sales Invoice', r.invoice_name, r.print_format || invFormat) + '&trigger_print=1';
            if (printWin.current && !printWin.current.closed) printWin.current.location.href = url;
            if (thankYou) {
                apiService.notifyCustomer(order.name).then(() => toast.success('Thank-you sent on WhatsApp')).catch(e => toast.error(e instanceof Error ? `WhatsApp not sent: ${e.message}` : 'WhatsApp not sent.'));
            }
            void refresh();
        } catch (e) {
            printWin.current?.close();
            toast.error(e instanceof Error ? e.message : 'Nothing was charged. Try again.');
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        const change = done.tendered != null && isCashMode(done.mode) ? roundMoney(done.tendered - done.invoice_total) : 0;
        return (
            <div className="max-w-[720px] mx-auto">
                <Card className="border-[#B9E2C7] p-6">
                    <div className="flex items-center gap-4">
                        <span className="w-12 h-12 rounded-full bg-dw-success-soft text-dw-success flex items-center justify-center shrink-0"><Icon name="check" size={26} strokeWidth={2.4} /></span>
                        <div>
                            <h1 className="m-0 text-[20px] font-extrabold">Invoice {done.invoice_name} · {formatCurrency(done.invoice_total)} {done.is_credit_sale ? 'on credit' : done.mode === 'none' ? 'no charge' : done.mode === 'split' ? 'paid, split' : `paid by ${done.mode}`}</h1>
                            <p className="m-0 text-[13px] font-semibold text-dw-caption">
                                {done.labels.join(', ')} collected · {done.order_closed ? 'order closed' : `order ${order.name} stays open for the other ${done.left === 1 ? 'watch' : `${done.left} watches`}`}
                            </p>
                        </div>
                    </div>
                    {change > 0 && <p className="m-0 mt-4 p-3 rounded-dw-control bg-dw-success-soft text-dw-success text-[18px] font-extrabold">Give change: {formatCurrency(change)}</p>}
                    {done.is_credit_sale ? <p className="m-0 mt-4 text-[14px] text-dw-body">{formatCurrency(done.outstanding_amount)} is owed. It shows under balance due on the Orders screen.</p> : null}
                    <div className="flex flex-wrap gap-2 mt-5">
                        <Button variant="primary" onClick={() => navigate('/desk')}>Back to front desk</Button>
                        <Button onClick={() => navigate(buildPath('orders', order.name), { replace: true })}>Open the order</Button>
                        <a href={deskApi.printUrl('Sales Invoice', done.invoice_name, done.print_format || invFormat) + '&trigger_print=1'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-[42px] px-4 rounded-dw-control border border-dw-border-strong text-[14px] font-bold text-dw-text no-underline hover:bg-dw-ground"><Icon name="print" size={18} />Reprint</a>
                        <a href={deskApi.printUrl('Sales Invoice', done.invoice_name, done.print_format || invFormat, true)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-[42px] px-4 rounded-dw-control border border-dw-border-strong text-[14px] font-bold text-dw-text no-underline hover:bg-dw-ground"><Icon name="download" size={18} />PDF</a>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="max-w-[1180px] mx-auto">
            <div className="flex flex-wrap items-center gap-3">
                <IconButton icon="chevronLeft" label="Back to the order" onClick={() => goBack(buildPath('orders', order.name))} />
                <div className="flex-1 min-w-[200px]">
                    <h1 className="m-0 text-[20px] font-extrabold">Collect &amp; invoice · {order.name} · {custName}</h1>
                    <p className="m-0 text-[12px] font-semibold text-dw-caption">The invoice charges only the watches ticked below, at the prices on the order.</p>
                </div>
            </div>

            {ready.length === 0 ? (
                <Card className="mt-5">
                    <EmptyState icon="clock" title="No watch is ready to collect"
                        body={returning.length && !others.length ? 'The watches here go back without repair, so no invoice is needed.' : 'Watches appear here once every task is ticked or the desk marks them Ready.'}
                        action={returning.length && !others.length
                            ? <Button variant="primary" onClick={() => setCloseOpen(true)}>Return and close the order</Button>
                            : <Button onClick={() => navigate(buildPath('orders', order.name))}>Back to the order</Button>} />
                </Card>
            ) : (
                <div className="mt-5 flex flex-col lg:flex-row gap-5 items-start">
                    <section className="w-full lg:flex-1 min-w-0 flex flex-col gap-4">
                        <Card>
                            <h2 className="m-0 mb-3 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">1 · Being collected today</h2>
                            <div className="flex flex-col gap-2">
                                {ready.map(i => {
                                    const on = picked.includes(i.name!);
                                    return (
                                        <button key={i.name} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(i)}
                                            className={cx('w-full flex items-center gap-3 p-3 rounded-dw-control border text-left', on ? 'border-dw-success bg-[#F0F9F3]' : 'border-dw-border bg-dw-surface hover:bg-dw-ground')}>
                                            <span className={cx('w-6 h-6 rounded-[7px] border-2 flex items-center justify-center shrink-0', on ? 'bg-dw-success border-dw-success text-white' : 'border-dw-border-strong')}>{on && <Icon name="check" size={14} strokeWidth={3} />}</span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[15px] font-extrabold truncate">{watchTitle(i, ctx.models)} <StageBadge stage="ready" className="ml-1 align-middle" /></span>
                                                <span className="block text-[12px] font-semibold text-dw-caption truncate">{[i.serial_number && `S/N ${i.serial_number}`, (i.recommended_work || []).join(' + ')].filter(Boolean).join(' · ')}</span>
                                            </span>
                                            <span className="text-[15px] font-extrabold tabular-nums">{formatCurrency(watchPrice(i, ctx))}</span>
                                        </button>
                                    );
                                })}
                                {[...others, ...returning].map(i => (
                                    <div key={i.name} className="flex items-center gap-3 p-3 rounded-dw-control border border-dw-border opacity-60">
                                        <span className="w-6 h-6 rounded-[7px] border-2 border-dw-border shrink-0" />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[15px] font-extrabold truncate">{watchTitle(i, ctx.models)} <StageBadge stage={watchStage(i, order).stage} className="ml-1 align-middle" /></span>
                                            <span className="block text-[12px] font-semibold text-dw-caption">{watchStage(i, order).stage === 'return' ? 'Goes back at no charge, never on an invoice' : 'Stays on the order until it is ready'}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card>
                            <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">2 · Amount</h2>
                            {chosen.map(i => (
                                <div key={i.name} className="flex justify-between gap-3 py-2 border-b border-dw-line text-[14px]">
                                    <span className="text-dw-body font-semibold">{watchTitle(i, ctx.models)}</span><span className="font-bold tabular-nums">{formatCurrency(watchPrice(i, ctx))}</span>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-dw-line">
                                <span className="text-[14px] text-dw-body font-semibold">Discount</span>
                                <div className="flex items-center gap-2">
                                    <Segmented<'amount' | 'percent'> label="Discount as" size="sm" value={discountMode} onChange={m => { setDiscountMode(m); setDiscountInput(null); }}
                                        options={[{ value: 'amount', label: 'BHD' }, { value: 'percent', label: '%' }]} className="w-[110px]" />
                                    <MoneyInput value={discountInput} onChange={setDiscountInput} currency="" max={discountMode === 'percent' ? 100 : subtotal} aria-label="Discount" className="w-[120px]" />
                                </div>
                            </div>
                            {discount > 0 && discountMode === 'percent' && <p className="m-0 py-1 text-right text-[12px] font-semibold text-dw-caption">{formatCurrency(discount)} off</p>}
                            {preview && preview.taxes > 0 && (
                                <div className="flex justify-between py-2 border-b border-dw-line text-[14px]">
                                    {/* Inclusive tax templates leave the total unchanged; say so instead of implying it is added. */}
                                    <span className="text-dw-body font-semibold">{Math.abs(preview.grand_total - (preview.net_total - preview.discount)) < 0.001 ? 'Includes VAT' : 'VAT'}</span>
                                    <span className="font-bold tabular-nums">{formatCurrency(preview.taxes)}</span>
                                </div>
                            )}
                            {ctx.paid_amount > 0 && (
                                <div className="flex justify-between py-2 border-b border-dw-line text-[13px]"><span className="text-dw-caption font-semibold">Already paid on this order</span><span className="font-semibold text-dw-caption tabular-nums">{formatCurrency(ctx.paid_amount)}</span></div>
                            )}
                            <div className="flex justify-between items-center py-3 text-[18px]">
                                <span className="font-extrabold">To pay today</span>
                                <span className="font-extrabold tabular-nums flex items-center gap-2">{previewing && <Spinner />}{formatCurrency(total)}</span>
                            </div>
                            <div>
                                <p className="m-0 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Note printed on the invoice</p>
                                <Chips label="Common notes" options={NOTES.map(n => ({ value: n, label: n }))} value={NOTES.includes(note) ? note : null} onChange={v => setNote(v || '')} allowNone />
                                <TextInput className="mt-2" value={note} onChange={e => setNote(e.target.value)} placeholder="Or type a note, e.g. strap replaced at customer's request" maxLength={240} />
                            </div>
                        </Card>

                        {chosen.length > 0 && (
                            <Card>
                                <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Bill before collection <span className="normal-case tracking-normal font-semibold">· optional</span></h2>
                                <p className="m-0 mb-3 text-[13px] text-dw-body">Not collecting yet? Make a bill with the amount, discount and note above, and send it to the customer before they come. Nothing is charged.</p>
                                {currentBill ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="flex-1 min-w-[160px] text-[14px] font-bold">{currentBill.quotation} · {formatCurrency(currentBill.total)}</span>
                                        <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground" href={deskApi.printUrl('Quotation', currentBill.quotation, qFormat)} target="_blank" rel="noreferrer"><Icon name="print" size={16} />Print</a>
                                        <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground" href={deskApi.printUrl('Quotation', currentBill.quotation, qFormat, true)} target="_blank" rel="noreferrer"><Icon name="download" size={16} />PDF</a>
                                        {canShareFiles && <Button size="sm" icon="whatsapp" onClick={() => void shareBill(currentBill.quotation)}>Share</Button>}
                                    </div>
                                ) : (
                                    <Button icon="print" busy={billing} disabled={previewing || !preview || order.docstatus !== 0} onClick={() => void makeBill()}>Make bill · {formatCurrency(total)}</Button>
                                )}
                            </Card>
                        )}

                        <Card>
                            <h2 className="m-0 mb-3 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">3 · Payment</h2>
                            {noCharge ? <p className="m-0 text-[14px] font-semibold text-dw-success">Nothing to pay. The invoice is made for {formatCurrency(0)} and marked paid.</p> : modes.length === 0 ? <p className="m-0 text-[13px] text-dw-danger font-semibold">No payment modes are set up. Add them under Settings.</p> : (
                                <PaymentModes modes={modes} total={total} value={pay} onChange={setPay} creditPaidNow={false} />
                            )}
                        </Card>

                        <Card className="flex flex-col gap-3">
                            <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">4 · After payment</h2>
                            <Toggle checked={print} onChange={setPrint} label="Print the invoice" description={invFormat} />
                            {ctx.whatsapp_enabled && <Toggle checked={thankYou} onChange={setThankYou} label="WhatsApp thank-you" description="Uses the template for the order's new status" />}
                        </Card>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="m-0 text-[13px] font-semibold text-dw-caption max-w-[460px]">
                                {payErr || (others.length ? `Marks ${chosen.length === 1 ? 'this watch' : 'these watches'} collected; the order stays open for the rest.` : 'Marks the watches collected and closes the order.')}
                            </p>
                            <div className="flex gap-2">
                                <Button onClick={() => goBack(buildPath('orders', order.name))}>Cancel</Button>
                                <Button variant="success" size="lg" busy={busy} disabled={!canFinish} onClick={() => void finish()}>
                                    {noCharge ? 'Hand over, no charge' : pay.kind === 'credit' ? 'Hand over on credit' : `Take ${formatCurrency(total)} & hand over`}
                                </Button>
                            </div>
                        </div>
                    </section>

                    <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                        <Card>
                            <p className="m-0 text-[15px] font-extrabold">{custName}</p>
                            <p className="m-0 text-[13px] text-dw-body">{ctx.customer?.mobile || 'No mobile'}</p>
                        </Card>
                        <Card>
                            <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Order money</h2>
                            {[
                                ['Estimate', ctx.quotation ? formatCurrency(ctx.quotation.grand_total) : 'none'],
                                ['Invoiced before', formatCurrency(ctx.invoiced_amount)],
                                ['Paid before', formatCurrency(ctx.paid_amount)],
                                ['This invoice', formatCurrency(total)],
                            ].map(([k, v]) => (
                                <div key={k} className="flex justify-between py-2 border-b border-dw-line last:border-b-0 text-[14px]"><span className="text-dw-body font-semibold">{k}</span><span className="font-bold tabular-nums">{v}</span></div>
                            ))}
                            {ctx.quotation && <p className="m-0 mt-2 text-[12px] font-semibold text-dw-caption">Estimate made {formatDay(ctx.quotation.transaction_date)}. If prices changed since, the invoice uses the order's current prices.</p>}
                        </Card>
                    </aside>
                </div>
            )}

            <ConfirmSheet
                open={closeOpen}
                onClose={() => setCloseOpen(false)}
                title="Return without repair?"
                body="Every watch on this order goes back unrepaired, so no invoice is made. The order closes as collected."
                confirmLabel="Return and close order"
                onConfirm={async () => {
                    try {
                        await apiService.closeOrderWithoutInvoice(order.name);
                        toast.success('Order closed. Watch returned.');
                        navigate(buildPath('orders', order.name), { replace: true });
                    } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'The order was not closed.');
                        throw e;
                    }
                }}
            />
        </div>
    );
};

export default CollectScreen;
