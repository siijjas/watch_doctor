/**
 * POS back office (canvas D10): held sales, collecting on any unpaid invoice,
 * and returns against a receipt. Replaces the old POS modals.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../router';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    Button, Card, ConfirmSheet, EmptyState, Field, MoneyInput, SearchField, Spinner, StageBadge, TextInput,
    cx, formatDay, roundMoney, toISODate, useToast,
} from '../../design/kit';
import * as apiService from '../../services/apiService';
import {
    tillCollect, tillDeleteHeld, tillHeld, tillOutstanding, tillReturn, tillReturnCandidates, tillReturnDetails,
    type HeldSale, type OutstandingInvoice, type ReturnCandidate, type ReturnDetail,
} from '../../services/tillApi';
import { PosTabs } from './PosTabs';

const useModes = () => {
    const [modes, setModes] = useState<string[]>([]);
    useEffect(() => { apiService.getPaymentModes().then(r => setModes(r.map((m: { mode_of_payment: string }) => m.mode_of_payment))).catch(() => undefined); }, []);
    return modes;
};

const ModeGrid: React.FC<{ modes: string[]; value: string; onChange: (m: string) => void }> = ({ modes, value, onChange }) => (
    <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-2 gap-2">
        {modes.map(m => (
            <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}
                className={cx('h-11 rounded-dw-control border text-[13px] font-bold', value === m ? 'border-dw-accent bg-dw-accent-soft text-[#1F4B9B] ring-1 ring-dw-accent' : 'border-dw-border-strong bg-dw-surface hover:bg-dw-ground')}>
                {m}
            </button>
        ))}
    </div>
);

// ---------------------------------------------------------------- Held

const Held: React.FC = () => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const [rows, setRows] = useState<HeldSale[] | null>(null);
    const [del, setDel] = useState<HeldSale | null>(null);
    const load = () => tillHeld().then(setRows).catch(() => setRows([]));
    useEffect(() => { void load(); }, []);
    if (!rows) return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
    return (
        <>
            {rows.length === 0 ? (
                <Card><EmptyState icon="clock" title="No held sales" body="Press Hold on a sale to park it here, for example while the customer fetches their card." /></Card>
            ) : (
                <Card pad={false} className="overflow-hidden">
                    {rows.map(r => (
                        <div key={r.name} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0">
                            <span className="flex-1 min-w-[220px]">
                                <span className="block text-[15px] font-extrabold">{r.customer_name}</span>
                                <span className="block text-[13px] text-dw-body truncate">{r.items.join(' · ')}</span>
                                <span className="block text-[12px] font-semibold text-dw-caption">{r.name} · held {formatDay(r.modified)} by {r.by}</span>
                            </span>
                            <span className="text-[16px] font-extrabold tabular-nums">{formatCurrency(r.grand_total)}</span>
                            <Button size="sm" variant="primary" onClick={() => navigate(`/pos?held=${encodeURIComponent(r.name)}`)}>Resume</Button>
                            <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
                        </div>
                    ))}
                </Card>
            )}
            <p className="mt-3 text-[12px] font-semibold text-dw-caption">Resuming a held sale keeps every change you make before charging it.</p>
            <ConfirmSheet open={!!del} onClose={() => setDel(null)} title="Delete this held sale?" tone="danger" confirmLabel="Delete"
                body={del ? `${del.customer_name} · ${formatCurrency(del.grand_total)}. Nothing was charged, so nothing is refunded.` : ''}
                onConfirm={async () => {
                    try { await tillDeleteHeld(del!.name); toast.success('Held sale deleted'); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not deleted.'); throw e; }
                }} />
        </>
    );
};

// ---------------------------------------------------------------- Collect

const Collect: React.FC = () => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const modes = useModes();
    const [text, setText] = useState('');
    const [rows, setRows] = useState<OutstandingInvoice[] | null>(null);
    const [sel, setSel] = useState<OutstandingInvoice | null>(null);
    const [amount, setAmount] = useState<number | null>(null);
    const [mode, setMode] = useState('');
    const [ref, setRef] = useState('');
    const [busy, setBusy] = useState(false);
    const load = (q: string) => tillOutstanding(q).then(setRows).catch(() => setRows([]));
    useEffect(() => { void load(''); }, []);
    useEffect(() => { if (!mode && modes.length) setMode(modes[0]); }, [modes, mode]);
    const today = toISODate(new Date());

    const record = async () => {
        if (!sel || !amount) return;
        setBusy(true);
        try {
            const r = await tillCollect(sel.name, mode, amount, ref);
            toast.success(`${formatCurrency(r.amount_collected)} recorded on ${sel.name}${r.outstanding_amount > 0 ? `, ${formatCurrency(r.outstanding_amount)} still due` : ''}`);
            setSel(null); setAmount(null); setRef('');
            await load(text);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Payment not recorded.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            <section className="min-w-0">
                <SearchField value={text} onChange={setText} onSearch={q => void load(q)} placeholder="Invoice no., customer or mobile" label="Find unpaid invoice" />
                {!rows ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? (
                    <Card className="mt-3"><EmptyState icon="check" title="Nothing unpaid" body={text ? 'No unpaid invoice matches.' : 'Every invoice is paid.'} /></Card>
                ) : (
                    <Card pad={false} className="mt-3 overflow-hidden">
                        {rows.map(r => {
                            const late = r.due_date && r.due_date < today;
                            return (
                                <button key={r.name} type="button" onClick={() => { setSel(r); setAmount(r.outstanding_amount); }}
                                    className={cx('w-full flex flex-wrap items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0 text-left', sel?.name === r.name ? 'bg-[#EEF3FC]' : 'hover:bg-dw-ground')}>
                                    <span className="flex-1 min-w-[200px]">
                                        <span className="block text-[14px] font-extrabold">{r.name} {r.dw_is_credit_sale ? <StageBadge stage="customer" dot={false} className="ml-1 align-middle">Credit sale</StageBadge> : null}</span>
                                        <span className="block text-[13px] text-dw-body">{r.customer_name}{r.mobile_no ? ` · ${r.mobile_no}` : ''}</span>
                                    </span>
                                    <span className="text-[12px] font-semibold text-dw-caption">{formatDay(r.posting_date)} · <span className={cx(late && 'text-dw-danger font-bold')}>{late ? `due ${formatDay(r.due_date)}, overdue` : `due ${formatDay(r.due_date)}`}</span></span>
                                    <span className={cx('text-[15px] font-extrabold tabular-nums', late ? 'text-dw-danger' : 'text-dw-warning')}>{formatCurrency(r.outstanding_amount)}</span>
                                </button>
                            );
                        })}
                    </Card>
                )}
            </section>
            <Card className="lg:sticky lg:top-4">
                {!sel ? <p className="m-0 py-6 text-center text-[13px] font-semibold text-dw-caption">Pick an invoice to collect on.</p> : (
                    <div className="flex flex-col gap-3">
                        <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Collect on {sel.name}</h2>
                        <div className="flex justify-between text-[14px]"><span className="text-dw-body font-semibold">Outstanding</span><span className="font-extrabold tabular-nums">{formatCurrency(sel.outstanding_amount)}</span></div>
                        <Field label="Amount now"><MoneyInput value={amount} max={sel.outstanding_amount} onChange={setAmount} /></Field>
                        <ModeGrid modes={modes} value={mode} onChange={setMode} />
                        <Field label="Reference" optional hint="Card slip or transfer id"><TextInput value={ref} onChange={e => setRef(e.target.value)} /></Field>
                        <Button variant="success" size="lg" block busy={busy} disabled={!amount || amount <= 0 || !mode} onClick={() => void record()}>Record {formatCurrency(amount || 0)}</Button>
                        <p className="m-0 text-[12px] font-semibold text-dw-caption">Creates a payment entry. If the invoice belongs to a repair order, the order's balance updates too.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

// ---------------------------------------------------------------- Returns

const Returns: React.FC = () => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const modes = useModes();
    const [text, setText] = useState('');
    const [rows, setRows] = useState<ReturnCandidate[] | null>(null);
    const [detail, setDetail] = useState<ReturnDetail | null>(null);
    const [qty, setQty] = useState<Record<string, number>>({});
    const [mode, setMode] = useState('');
    const [refund, setRefund] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState<{ name: string; total: number; refunded: number } | null>(null);

    const load = (q: string) => tillReturnCandidates(q).then(setRows).catch(() => setRows([]));
    useEffect(() => { void load(''); }, []);

    const open = async (name: string) => {
        try {
            const d = await tillReturnDetails(name);
            setDetail(d);
            setQty(Object.fromEntries(d.items.map(i => [i.row_name, 0])));
            setMode(d.paid_modes[0] || modes[0] || '');
            setDone(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'That invoice cannot be returned.');
        }
    };

    const value = useMemo(() => (detail ? roundMoney(detail.items.reduce((s, i) => s + (qty[i.row_name] || 0) * i.rate, 0)) : 0), [detail, qty]);
    const maxRefund = detail ? Math.min(value, detail.amount_paid) : 0;
    useEffect(() => { setRefund(maxRefund || null); }, [maxRefund]);

    const submit = async () => {
        if (!detail) return;
        setBusy(true);
        try {
            const r = await tillReturn(detail.invoice_name,
                detail.items.filter(i => qty[i.row_name] > 0).map(i => ({ row_name: i.row_name, qty: qty[i.row_name] })),
                refund && refund > 0 ? [{ mode_of_payment: mode, amount: refund }] : []);
            setDone({ name: r.return_invoice, total: Math.abs(r.grand_total), refunded: r.refunded_amount });
            setDetail(null);
            toast.success(`Credit note ${r.return_invoice} issued`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'The return was not made.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            <section className="min-w-0">
                {done && (
                    <div className="mb-3 p-4 rounded-dw-control bg-dw-success-soft text-dw-success">
                        <p className="m-0 text-[15px] font-extrabold">Credit note {done.name} · {formatCurrency(done.total)}</p>
                        <p className="m-0 text-[13px] font-semibold">{done.refunded > 0 ? `${formatCurrency(done.refunded)} handed back.` : 'Nothing handed back; the amount stays as credit on the customer.'} Stock is back in.</p>
                    </div>
                )}
                {!detail ? (
                    <>
                        <SearchField value={text} onChange={setText} onSearch={q => void load(q)} placeholder="Receipt no., customer or mobile" label="Find receipt" />
                        {!rows ? <div className="flex justify-center py-10"><Spinner /></div> : rows.length === 0 ? (
                            <Card className="mt-3"><EmptyState icon="search" title="No receipt matches" /></Card>
                        ) : (
                            <Card pad={false} className="mt-3 overflow-hidden">
                                {rows.map(r => (
                                    <button key={r.name} type="button" onClick={() => void open(r.name)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0 text-left hover:bg-dw-ground">
                                        <span className="flex-1 min-w-[200px]">
                                            <span className="block text-[14px] font-extrabold">{r.name}</span>
                                            <span className="block text-[13px] text-dw-body">{r.customer_name}{r.mobile_no ? ` · ${r.mobile_no}` : ''}</span>
                                        </span>
                                        <span className="text-[12px] font-semibold text-dw-caption">{formatDay(r.posting_date)}</span>
                                        <span className="text-[15px] font-extrabold tabular-nums">{formatCurrency(r.grand_total)}</span>
                                    </button>
                                ))}
                            </Card>
                        )}
                    </>
                ) : (
                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div>
                                <h2 className="m-0 text-[16px] font-extrabold">{detail.invoice_name}</h2>
                                <p className="m-0 text-[13px] font-semibold text-dw-caption">{detail.customer_name} · {formatDay(detail.posting_date)} · paid {formatCurrency(detail.amount_paid)}{detail.paid_modes.length ? ` by ${detail.paid_modes.join(', ')}` : ''}</p>
                            </div>
                            <Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => setDetail(null)}>Other receipt</Button>
                        </div>
                        {detail.items.map(i => (
                            <div key={i.row_name} className="flex flex-wrap items-center gap-3 py-2.5 border-b border-dw-line last:border-b-0">
                                <span className="flex-1 min-w-[180px] text-[14px] font-bold">{i.item_name}<span className="block text-[12px] font-semibold text-dw-caption">{formatCurrency(i.rate)} each · {i.returnable_qty} can be returned</span></span>
                                <label className="flex items-center gap-2 text-[12px] font-bold text-dw-caption">Return
                                    <input type="number" min={0} max={i.returnable_qty} value={qty[i.row_name] || 0} aria-label={`Return quantity of ${i.item_name}`}
                                        onChange={e => setQty(q => ({ ...q, [i.row_name]: Math.max(0, Math.min(i.returnable_qty, Math.floor(Number(e.target.value) || 0))) }))}
                                        className="w-16 h-9 text-center rounded-[8px] border border-dw-border-strong text-[14px] font-bold text-dw-text" />
                                </label>
                                <span className="w-[90px] text-right text-[14px] font-extrabold tabular-nums">{formatCurrency(roundMoney((qty[i.row_name] || 0) * i.rate))}</span>
                            </div>
                        ))}
                        {detail.has_pms_items ? <p className="m-0 mt-3 text-[12px] font-semibold text-dw-caption">The VAT charged on a pre-owned (PMS) watch is reversed automatically.</p> : null}
                    </Card>
                )}
            </section>
            <Card className="lg:sticky lg:top-4">
                {!detail ? <p className="m-0 py-6 text-center text-[13px] font-semibold text-dw-caption">Find the receipt the customer is returning against.</p> : (
                    <div className="flex flex-col gap-3">
                        <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Refund</h2>
                        <div className="flex justify-between text-[14px]"><span className="text-dw-body font-semibold">Returning (before VAT)</span><span className="font-extrabold tabular-nums">{formatCurrency(value)}</span></div>
                        <Field label="Hand back now" hint={detail.amount_paid < value ? `Only ${formatCurrency(detail.amount_paid)} was paid on this receipt.` : 'Anything not handed back stays as credit on the customer.'}>
                            <MoneyInput value={refund} max={maxRefund} onChange={setRefund} />
                        </Field>
                        {(refund || 0) > 0 && <ModeGrid modes={modes} value={mode} onChange={setMode} />}
                        {detail.paid_modes[0] && mode !== detail.paid_modes[0] && (refund || 0) > 0 && <p className="m-0 text-[12px] font-bold text-dw-warning">The customer paid by {detail.paid_modes[0]}.</p>}
                        <Button variant="danger" size="lg" block busy={busy} disabled={value <= 0 || ((refund || 0) > 0 && !mode)} onClick={() => void submit()}>Issue credit note</Button>
                        <p className="m-0 text-[12px] font-semibold text-dw-caption">Stock comes back in. The credit note total includes VAT and may differ slightly from the figure above.</p>
                    </div>
                )}
            </Card>
        </div>
    );
};

// ---------------------------------------------------------------- Screen

const TITLES = {
    held: ['Held sales', 'Sales parked on the till, waiting to be charged'],
    collect: ['Collect payment', 'Any unpaid invoice: credit sales and repair balances'],
    returns: ['Returns', 'Return items against a receipt and refund or credit'],
} as const;

const PosBackOffice: React.FC<{ tab: keyof typeof TITLES }> = ({ tab }) => (
    <div className="max-w-[1400px] mx-auto">
        <PosTabs />
        <div className="mt-4 mb-4">
            <h1 className="m-0 text-[22px] font-extrabold">{TITLES[tab][0]}</h1>
            <p className="m-0 text-[13px] font-semibold text-dw-caption">{TITLES[tab][1]}</p>
        </div>
        {tab === 'held' ? <Held /> : tab === 'collect' ? <Collect /> : <Returns />}
    </div>
);

export default PosBackOffice;

