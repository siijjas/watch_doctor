/**
 * Point of sale (canvas D9). Scan or tap items; the cart shows the totals the
 * invoice will really charge (VAT, PMS margin VAT, rounding) from a rolled-back
 * draft; PMS items are badged and a PMS/standard mix is blocked before Pay;
 * discount stays an amount; held sales keep their edits; change is shown.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate, useLocation } from '../../router';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    Button, Card, EmptyState, Field, Icon, IconButton, MoneyInput, PaymentModes, Segmented, SelectInput, Sheet, Spinner,
    StageBadge, TextInput, addDays, cx, isCashMode, paymentError, roundMoney, toISODate, useToast, type PaymentValue,
} from '../../design/kit';
import * as apiService from '../../services/apiService';
import * as deskApi from '../../services/deskApi';
import {
    tillCategories, tillCharge, tillConfig, tillHold, tillItems, tillLoad, tillPreview,
    type CartLine, type ChargeResult, type DiscountType, type TillItem, type TillOptions, type TillPreview,
} from '../../services/tillApi';
import type { POSRuntimeConfig } from '../../services/apiService';
import { PosTabs } from './PosTabs';
import { isNetworkError, newRef, usePendingSales } from './pendingSales';

interface Customer { name: string; customer_name: string; mobile?: string | null }

// ---------------------------------------------------------------- customer picker

const CustomerPicker: React.FC<{ value: Customer; isDefault: boolean; onChange: (c: Customer) => void; onReset: () => void }> = ({ value, isDefault, onChange, onReset }) => {
    const toast = useToast();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [hits, setHits] = useState<deskApi.CustomerHit[] | null>(null);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open || q.trim().length < 2) { setHits(null); return; }
        const t = window.setTimeout(() => { deskApi.findCustomers(q.trim()).then(setHits).catch(() => setHits([])); }, 250);
        return () => window.clearTimeout(t);
    }, [q, open]);

    const pick = (c: Customer) => { onChange(c); setOpen(false); setQ(''); setAdding(false); };
    const create = async () => {
        setBusy(true);
        try {
            const c = await deskApi.createCustomer({ customer_name: name, mobile: `+973${mobile.replace(/\D/g, '')}` });
            pick({ name: c.name, customer_name: c.customer_name, mobile: c.mobile_no });
            toast.success('Customer added');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Customer not added.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-dw-control bg-dw-ground">
                <Icon name="user" size={18} className="text-dw-caption" />
                <span className="flex-1 min-w-0 text-[14px] font-bold truncate">{value.customer_name}{value.mobile ? <span className="font-semibold text-dw-caption"> · {value.mobile}</span> : null}</span>
                {!isDefault && <button type="button" onClick={onReset} className="text-[12px] font-bold text-dw-caption hover:text-dw-text">Walk-in</button>}
                <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="text-[13px] font-bold text-dw-accent">{isDefault ? 'Choose' : 'Change'}</button>
            </div>
            {open && (
                <div className="mt-1.5 border border-dw-border rounded-dw-control bg-dw-surface overflow-hidden dw-anim-pop">
                    {!adding ? (
                        <>
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Name or mobile" aria-label="Find customer"
                                className="w-full h-10 px-3 border-0 border-b border-dw-line text-[14px] font-semibold outline-none" />
                            <div className="max-h-[200px] overflow-y-auto">
                                {hits?.map(h => (
                                    <button key={h.name} type="button" onClick={() => pick({ name: h.name, customer_name: h.customer_name, mobile: h.mobile_no })}
                                        className="block w-full px-3 py-2.5 text-left text-[13px] border-b border-dw-line hover:bg-dw-ground">
                                        <strong>{h.customer_name}</strong> <span className="text-dw-caption">{h.mobile_no}</span>
                                    </button>
                                ))}
                                {hits && hits.length === 0 && <p className="m-0 px-3 py-2.5 text-[13px] text-dw-caption">No match.</p>}
                            </div>
                            <button type="button" onClick={() => { setAdding(true); if (/\d{4,}/.test(q)) setMobile(q.replace(/\D/g, '').replace(/^(00)?973(?=\d{8})/, '')); else setName(q); }}
                                className="block w-full px-3 py-2.5 text-left text-[13px] font-bold text-dw-accent hover:bg-dw-ground">+ New customer (name, +973 mobile)</button>
                        </>
                    ) : (
                        <div className="p-3 flex flex-col gap-2">
                            <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Full name" aria-label="Full name" autoFocus className="h-10" />
                            <div className="flex gap-2 items-center">
                                <span className="text-[13px] font-bold text-dw-caption">+973</span>
                                <TextInput type="tel" inputMode="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="3xxx xxxx" aria-label="Mobile" className="h-10" />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Back</Button>
                                <Button size="sm" variant="primary" busy={busy} disabled={!name.trim() || mobile.replace(/\D/g, '').length < 7} onClick={() => void create()}>Add</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------- screen

const PosScreen: React.FC = () => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const { query } = useLocation();
    const [config, setConfig] = useState<POSRuntimeConfig | null>(null);
    const [modes, setModes] = useState<string[]>([]);
    const [cats, setCats] = useState<Array<{ name: string; items: number }>>([]);
    const [cat, setCat] = useState('');
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<TillItem[] | null>(null);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [discount, setDiscount] = useState<number | null>(null);
    const [discountType, setDiscountType] = useState<DiscountType>('amount');
    const [pay, setPay] = useState<PaymentValue>({ kind: 'single', mode: '', tendered: null });
    const [preview, setPreview] = useState<TillPreview | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [held, setHeld] = useState<{ name: string; customer: string } | null>(null);
    const [busy, setBusy] = useState<'charge' | 'hold' | null>(null);
    const [paid, setPaid] = useState<(ChargeResult & { change: number }) | null>(null);
    const [options, setOptions] = useState<TillOptions>({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [tabsKey, setTabsKey] = useState(0);
    const searchRef = useRef<HTMLInputElement>(null);
    const itemsReq = useRef(0);
    const previewReq = useRef(0);
    const lastQuery = useRef('');
    const { pending, add: addPending, remove: removePending, retryAll } = usePendingSales(
        useCallback((r, p) => toast.show({ message: `Sale for ${p.customer} sent · ${r.invoice_name}`, tone: 'success', action: r.print_url ? { label: 'Print', onClick: () => window.open(`${r.print_url}&trigger_print=1`, '_blank') } : undefined }), [toast]),
        useCallback(p => toast.error(`The sale for ${p.customer} was refused: ${p.error}`), [toast]),
    );

    const defaultCustomer = useMemo<Customer | null>(() => (config?.default_customer ? { name: config.default_customer, customer_name: config.default_customer_name || config.default_customer } : null), [config]);
    const cust = customer ?? defaultCustomer;

    useEffect(() => {
        tillConfig().then(c => { setConfig(c); setOptions({ pos_profile: c.pos_profile, sales_person: c.default_sales_person, commission_rate: c.default_commission_rate }); }).catch(e => toast.error(e instanceof Error ? e.message : 'Till settings did not load.'));
        tillCategories().then(setCats).catch(() => undefined);
        apiService.getPaymentModes().then(r => {
            const list = r.map((m: { mode_of_payment: string }) => m.mode_of_payment);
            setModes(list);
            setPay(p => (p.kind === 'single' && !p.mode ? { ...p, mode: list.find(isCashMode) || list[0] || '' } : p));
        }).catch(() => undefined);
    }, [toast]);

    // Resume a held sale from /pos?held=NAME.
    useEffect(() => {
        const name = query.get('held');
        if (!name) return;
        navigate('/pos', { replace: true });
        tillLoad(name).then(h => {
            setCart(h.items);
            setCustomer({ name: h.customer, customer_name: h.customer_name });
            if (h.discount_percent) { setDiscountType('percent'); setDiscount(h.discount_percent); } else setDiscount(h.discount_amount || null);
            setOptions(o => ({ ...o, ...h.options }));
            setHeld({ name: h.held_name, customer: h.customer_name });
            setPaid(null);
        }).catch(e => toast.error(e instanceof Error ? e.message : 'That held sale could not be opened.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadItems = useCallback(async (q: string, group: string) => {
        const id = ++itemsReq.current;
        lastQuery.current = q;
        try {
            const r = await tillItems(q, group);
            if (id === itemsReq.current) setItems(r);
            return r;
        } catch {
            if (id === itemsReq.current) setItems([]);
            return [];
        }
    }, []);
    useEffect(() => {
        const t = window.setTimeout(() => void loadItems(search.trim(), cat), search ? 200 : 0);
        return () => window.clearTimeout(t);
    }, [search, cat, loadItems]);

    // Live totals from the server whenever the cart, discount or customer changes.
    useEffect(() => {
        if (!cart.length || !cust) { setPreview(null); return; }
        const id = ++previewReq.current;
        setPreviewing(true);
        const t = window.setTimeout(() => {
            tillPreview(cust.name, cart, discount || 0, discountType, options)
                .then(p => { if (id === previewReq.current) setPreview(p); })
                .catch(e => { if (id === previewReq.current) { setPreview(null); toast.error(e instanceof Error ? e.message : 'Totals did not load.'); } })
                .finally(() => { if (id === previewReq.current) setPreviewing(false); });
        }, 300);
        return () => window.clearTimeout(t);
    }, [cart, discount, discountType, cust, options, toast]);

    const add = (it: TillItem) => {
        setPaid(null);
        setCart(cur => {
            const found = cur.find(l => l.item_code === it.name);
            if (found) {
                if (it.is_pms) { toast.show('A pre-owned watch is a single item.'); return cur; }
                return cur.map(l => (l.item_code === it.name ? { ...l, qty: l.qty + 1 } : l));
            }
            return [...cur, { item_code: it.name, item_name: it.item_name, qty: 1, rate: it.standard_rate || 0, standard_rate: it.standard_rate || 0, stock_qty: it.stock_qty, is_pms: it.is_pms }];
        });
    };
    const setLine = (code: string, p: Partial<CartLine>) => setCart(cur => cur.map(l => (l.item_code === code ? { ...l, ...p } : l)).filter(l => l.qty > 0));

    const onSearchKey = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = search.trim();
        if (!q) return;
        // Scanners type fast and press Enter: search now if the list is for an older query.
        const list = lastQuery.current === q && items ? items : await loadItems(q, cat);
        if (list.length) {
            add(list[0]);
            setSearch('');
        } else {
            toast.error(`Nothing in stock matches “${q}”.`);
        }
    };

    const clear = () => {
        setCart([]); setCustomer(null); setDiscount(null); setHeld(null); setPaid(null);
        setPay(p => ({ kind: 'single', mode: p.kind === 'single' ? p.mode : (modes.find(isCashMode) || modes[0] || ''), tendered: null }));
        searchRef.current?.focus();
    };

    const total = preview && !preview.mixed ? preview.grand_total : 0;
    const subtotal = cart.reduce((s, l) => s + l.rate * l.qty, 0);
    const mixed = !!preview?.mixed;
    const isDefaultCust = !!cust && cust.name === defaultCustomer?.name;
    const creditNeedsCustomer = pay.kind === 'credit' && isDefaultCust;
    const payErr = cart.length && preview && !mixed ? (creditNeedsCustomer ? 'Choose the customer for a credit sale.' : paymentError(pay, total)) : null;
    const overStock = cart.filter(l => l.qty > l.stock_qty);
    const canPay = cart.length > 0 && !!preview && !mixed && !previewing && !busy && !!cust && overStock.length === 0;
    const canCharge = canPay && !payErr;

    const charge = async () => {
        if (!cust) return;
        const printWin = config?.auto_print ? window.open('about:blank', '_blank') : null;
        setBusy('charge');
        const input = {
            customer: cust.name, lines: cart, discount: discount || 0, discountType, options, heldName: held?.name,
            mode: pay.kind === 'single' ? pay.mode : undefined,
            payments: pay.kind === 'split' ? pay.parts.map(p => ({ mode_of_payment: p.mode, amount: p.amount || 0 })) : undefined,
            credit: pay.kind === 'credit' ? { dueDate: pay.dueDate || addDays(toISODate(new Date()), 15) } : null,
            clientRef: newRef(),
        };
        try {
            const r = await tillCharge(input);
            const change = pay.kind === 'single' && isCashMode(pay.mode) && pay.tendered ? roundMoney(pay.tendered - r.rounded_total) : 0;
            setPaid({ ...r, change });
            setPayOpen(false);
            if (printWin && r.print_url) printWin.location.href = `${r.print_url}&trigger_print=1`;
            else printWin?.close();
            setCart([]); setCustomer(null); setDiscount(null); setHeld(null); setPreview(null);
            setPay(p => ({ kind: 'single', mode: p.kind === 'single' ? p.mode : (modes[0] || ''), tendered: null }));
            setTabsKey(k => k + 1);
        } catch (e) {
            printWin?.close();
            if (isNetworkError(e)) {
                // The request may or may not have reached the server; the same
                // reference is retried until it answers, so it is charged once.
                addPending({ ref: input.clientRef, input, total, customer: cust.customer_name, at: new Date().toISOString() });
                setPayOpen(false);
                toast.show({ message: 'No connection. The sale is kept and will be sent as soon as the connection is back.', tone: 'info', duration: 8000 });
                setCart([]); setCustomer(null); setDiscount(null); setHeld(null); setPreview(null);
            } else {
                toast.error(e instanceof Error ? e.message : 'The sale did not go through. Nothing was charged.');
            }
        } finally {
            setBusy(null);
        }
    };

    const hold = async () => {
        if (!cust || !cart.length) return;
        setBusy('hold');
        try {
            await tillHold(cust.name, cart, discount || 0, discountType, options, held?.name);
            toast.success(held ? 'Held sale updated' : 'Sale held');
            clear();
            setTabsKey(k => k + 1);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Not held.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="max-w-[1400px] mx-auto">
            <PosTabs refreshKey={tabsKey} />
            {pending.length > 0 && (
                <div className="mt-3 flex flex-col gap-2" role="status">
                    {pending.map(p => (
                        <div key={p.ref} className={cx('flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-dw-control text-[13px] font-bold', p.error ? 'bg-dw-danger-soft text-dw-danger' : 'bg-dw-warning-soft text-dw-warning')}>
                            <span className="flex-1 min-w-[220px]">
                                {p.error ? `Refused: sale for ${p.customer}, ${formatCurrency(p.total)}. ${p.error}` : `Waiting for the connection: sale for ${p.customer}, ${formatCurrency(p.total)}.`}
                            </span>
                            {p.error ? (
                                <>
                                    <Button size="sm" onClick={() => { setCart(p.input.lines); removePending(p.ref); }}>Back to the cart</Button>
                                    <Button size="sm" variant="danger" onClick={() => removePending(p.ref)}>Discard</Button>
                                </>
                            ) : <Button size="sm" onClick={() => void retryAll()}>Try now</Button>}
                        </div>
                    ))}
                </div>
            )}
            <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
                {/* Items */}
                <section className="min-w-0">
                    <div className="relative flex items-center">
                        <Icon name="scan" size={20} className="absolute left-3.5 text-dw-caption pointer-events-none" />
                        <input
                            ref={searchRef}
                            autoFocus
                            type="search"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => void onSearchKey(e)}
                            placeholder="Scan a barcode or type name / code · Enter adds the first match"
                            aria-label="Find item"
                            className="w-full h-12 pl-11 pr-4 rounded-dw-control border border-dw-border-strong bg-dw-surface text-[15px] font-semibold outline-none focus:border-dw-accent focus:ring-2 focus:ring-[var(--dw-focus)]"
                        />
                    </div>
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-1" role="group" aria-label="Category">
                        {[{ name: '', items: 0 }, ...cats].map(c => (
                            <button key={c.name || 'all'} type="button" aria-pressed={cat === c.name} onClick={() => setCat(c.name)}
                                className={cx('shrink-0 h-9 px-3.5 rounded-full border text-[13px] font-bold', cat === c.name ? 'bg-dw-text border-dw-text text-white' : 'bg-dw-surface border-dw-border-strong text-dw-body hover:bg-dw-ground')}>
                                {c.name || 'All'}
                            </button>
                        ))}
                    </div>
                    <p className="m-0 mt-2 text-[12px] font-semibold text-dw-caption">In-stock items only.</p>
                    {!items ? (
                        <div className="flex justify-center py-12"><Spinner size={24} /></div>
                    ) : items.length === 0 ? (
                        <Card className="mt-3"><EmptyState icon="search" title="Nothing in stock matches" body="Check the spelling, or scan the barcode." /></Card>
                    ) : (
                        <div className="mt-3 grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
                            {items.map(it => {
                                const inCart = cart.find(l => l.item_code === it.name);
                                return (
                                    <button key={it.name} type="button" onClick={() => add(it)}
                                        className={cx('min-h-[108px] p-3 rounded-dw-control border bg-dw-surface text-left flex flex-col justify-between gap-2 hover:border-dw-border-strong', inCart ? 'border-dw-accent ring-1 ring-dw-accent' : 'border-dw-border')}>
                                        <span>
                                            <span className="block text-[14px] font-extrabold leading-snug line-clamp-2">{it.item_name}</span>
                                            <span className={cx('block text-[12px] font-semibold', it.stock_qty <= 3 ? 'text-dw-warning' : 'text-dw-caption')}>{it.stock_qty} in stock{inCart ? ` · ${inCart.qty} in sale` : ''}</span>
                                        </span>
                                        <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                            <span className="text-[15px] font-extrabold tabular-nums">{formatCurrency(it.standard_rate || 0)}</span>
                                            {it.is_pms ? <StageBadge stage="estimate" dot={false}>PMS</StageBadge> : null}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Sale */}
                <Card className="lg:sticky lg:top-4 flex flex-col gap-3">
                    {held && (
                        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] bg-dw-warning-soft text-dw-warning text-[12px] font-bold">
                            <span>Editing held sale {held.name} ({held.customer}). Changes are kept.</span>
                            <button type="button" onClick={clear} className="underline">Leave</button>
                        </div>
                    )}
                    <div className="flex items-center justify-between">
                        <h2 className="m-0 text-[16px] font-extrabold">Sale</h2>
                        <div className="flex gap-1">
                            <IconButton size="sm" variant="ghost" icon="settings" label="Till settings" onClick={() => setSettingsOpen(true)} />
                            <Button size="sm" variant="ghost" disabled={!cart.length || !!busy} busy={busy === 'hold'} onClick={() => void hold()}>Hold</Button>
                            <Button size="sm" variant="ghost" className="text-dw-danger" disabled={!cart.length && !held} onClick={clear}>Clear</Button>
                        </div>
                    </div>

                    {cust && <CustomerPicker value={cust} isDefault={isDefaultCust} onChange={c => setCustomer(c)} onReset={() => setCustomer(null)} />}

                    {paid && !cart.length ? (
                        <div className="p-4 rounded-dw-control bg-dw-success-soft text-dw-success" role="status">
                            <p className="m-0 text-[15px] font-extrabold">{paid.is_credit_sale ? 'Sold on credit' : 'Paid'} · {paid.invoice_name} · {formatCurrency(paid.rounded_total)}</p>
                            {paid.change > 0 && <p className="m-0 mt-1 text-[22px] font-extrabold">Change {formatCurrency(paid.change)}</p>}
                            <div className="flex gap-2 mt-3">
                                {paid.print_url && <a href={`${paid.print_url}&trigger_print=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] bg-dw-surface border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline"><Icon name="print" size={16} />Print receipt</a>}
                                <Button size="sm" onClick={() => { setPaid(null); searchRef.current?.focus(); }}>Next sale</Button>
                            </div>
                        </div>
                    ) : null}

                    <div className="min-h-[120px]">
                        {!cart.length ? (
                            !paid && <p className="m-0 py-10 text-center text-[13px] font-semibold text-dw-caption">Scan or tap an item.</p>
                        ) : cart.map(l => {
                            return (
                                <div key={l.item_code} className="py-2.5 border-b border-dw-line last:border-b-0">
                                    <div className="flex items-start gap-2">
                                        <span className="flex-1 min-w-0 text-[14px] font-bold leading-snug">
                                            {l.item_name} {l.is_pms ? <StageBadge stage="estimate" dot={false} className="ml-1 align-middle">PMS</StageBadge> : null}
                                        </span>
                                        <span className="text-[14px] font-extrabold tabular-nums">{formatCurrency(roundMoney(l.rate * l.qty))}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <div className="w-[104px]"><MoneyInput value={l.rate} onChange={v => setLine(l.item_code, { rate: v ?? 0 })} currency="" aria-label={`Price of ${l.item_name}`} className="[&_input]:h-8 [&_input]:text-[13px]" /></div>
                                        <span className="text-[12px] text-dw-caption">each{l.rate !== l.standard_rate ? <> · list {l.standard_rate.toFixed(3)}</> : null}</span>
                                        <div className="ml-auto flex items-center gap-1">
                                            <IconButton size="sm" icon={l.qty === 1 ? 'trash' : 'chevronLeft'} label={l.qty === 1 ? 'Remove' : 'One less'} onClick={() => setLine(l.item_code, { qty: l.qty - 1 })} />
                                            <input type="number" inputMode="numeric" min={1} value={l.qty} aria-label={`Quantity of ${l.item_name}`} disabled={!!l.is_pms}
                                                onChange={e => setLine(l.item_code, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                                                className="w-12 h-9 text-center rounded-[8px] border border-dw-border-strong text-[14px] font-bold" />
                                            <IconButton size="sm" icon="plus" label="One more" disabled={!!l.is_pms} onClick={() => setLine(l.item_code, { qty: l.qty + 1 })} />
                                        </div>
                                    </div>
                                    {l.qty > l.stock_qty && <p className="m-0 mt-1 text-[12px] font-bold text-dw-danger">Only {l.stock_qty} in stock.</p>}
                                </div>
                            );
                        })}
                    </div>

                    {mixed && (
                        <p className="m-0 p-3 rounded-[10px] bg-dw-danger-soft text-dw-danger text-[12px] font-bold leading-relaxed" role="alert">
                            Pre-owned (PMS) and standard items cannot share one invoice. Hold one part of the sale, or remove an item.
                        </p>
                    )}

                    {cart.length > 0 && (
                        <div className="pt-2 border-t border-dw-border flex flex-col">
                            <div className="flex justify-between py-1.5 text-[14px]"><span className="text-dw-body font-semibold">Subtotal · {cart.reduce((s, l) => s + l.qty, 0)} items</span><span className="font-bold tabular-nums">{formatCurrency(preview && !mixed ? preview.net_total : subtotal)}</span></div>
                            <div className="flex justify-between items-center gap-2 py-1.5">
                                <span className="text-[14px] text-dw-body font-semibold">Discount</span>
                                <span className="flex items-center gap-1.5">
                                    <Segmented<DiscountType> size="sm" label="Discount as" value={discountType} onChange={t => { setDiscountType(t); setDiscount(null); }} options={[{ value: 'amount', label: 'BHD' }, { value: 'percent', label: '%' }]} className="w-[100px]" />
                                    <MoneyInput value={discount} onChange={setDiscount} currency="" max={discountType === 'percent' ? 100 : subtotal} aria-label="Discount" className="w-[96px] [&_input]:h-9" />
                                </span>
                            </div>
                            {preview && !mixed && preview.taxes > 0 && (
                                <div className="flex justify-between py-1.5 text-[14px]">
                                    <span className="text-dw-body font-semibold">{Math.abs(preview.grand_total - (preview.net_total - preview.discount)) < 0.01 ? 'Includes VAT' : 'VAT'}</span>
                                    <span className="font-bold tabular-nums">{formatCurrency(preview.taxes)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2 text-[22px]"><span className="font-extrabold">Total</span><span className="font-extrabold tabular-nums flex items-center gap-2">{previewing && <Spinner />}{preview && !mixed ? formatCurrency(total) : '—'}</span></div>
                        </div>
                    )}

                    {overStock.length > 0 && <p className="m-0 text-[12px] font-bold text-dw-danger">Not enough stock for {overStock.map(l => l.item_name).join(', ')}.</p>}
                    <Button variant="primary" size="lg" block busy={busy === 'charge'} disabled={!canPay} onClick={() => setPayOpen(true)} className="h-[52px] text-[16px]">
                        {cart.length && preview && !mixed ? `Pay ${formatCurrency(total)}` : 'Pay'}
                    </Button>
                </Card>
            </div>

            <Sheet open={payOpen} onClose={() => { if (!busy) setPayOpen(false); }} title={`Payment · ${formatCurrency(total)}`} description={cust ? cust.customer_name : undefined}>
                <div className="flex flex-col gap-3">
                    {modes.length > 0 && <PaymentModes modes={modes} total={total} value={pay} onChange={setPay} creditPaidNow={false} />}
                    {payErr && <p className="m-0 text-[12px] font-bold text-dw-warning">{payErr}</p>}
                    <Button variant="primary" size="lg" block busy={busy === 'charge'} disabled={!canCharge} onClick={() => void charge()} className="h-[52px] text-[16px]">
                        {pay.kind === 'credit' ? `Sell on credit · ${formatCurrency(total)}` : `Charge ${formatCurrency(total)}`}
                    </Button>
                </div>
            </Sheet>

            <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Till settings" description={config?.pos_profile ? `POS profile ${config.pos_profile}` : undefined}>
                {config && (
                    <div className="flex flex-col gap-4">
                        <Field label="Sales person" optional>
                            <SelectInput value={options.sales_person || ''} onChange={e => setOptions(o => ({ ...o, sales_person: e.target.value }))}>
                                <option value="">None</option>
                                {config.sales_persons.map(s => <option key={s} value={s}>{s}</option>)}
                            </SelectInput>
                        </Field>
                        <Field label="Commission %" optional>
                            <TextInput type="number" inputMode="decimal" value={options.commission_rate ?? 0} onChange={e => setOptions(o => ({ ...o, commission_rate: Number(e.target.value) || 0 }))} />
                        </Field>
                        <p className="m-0 text-[12px] text-dw-caption">Receipt format and invoice series come from Settings: standard sales print {config.default_receipt_format || 'the default receipt'}, PMS sales print the PMS invoice. Auto print is {config.auto_print ? 'on' : 'off'}.</p>
                    </div>
                )}
            </Sheet>
        </div>
    );
};

export default PosScreen;
