/**
 * Front desk (canvas D2 / M4): the receptionist's home. One row per watch,
 * search first (finds collected orders too), attention chips, stage tiles,
 * and each row's next action. Replaces Order Tracker and the open part of
 * the old order list.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, navigate, path as buildPath, useLocation } from '../router';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, EmptyState, IconButton, QueueRow, SearchField, Sheet, Spinner, cx, formatDay, useToast,
} from '../design/kit';
import {
    getDeskQueue, runStageAction, assignTechnician, type DeskQueue, type StageAction,
} from '../services/deskApi';
import { exportOrderTrackerExcel } from '../components/reports/exportExcel';
import { printOrderTracker } from './desk/printQueue';
import { AssignSheet } from './shared/AssignSheet';
import { ScanSheet } from './shared/ScanSheet';
import {
    ATTENTION, TILES, promisedText, sinceText, tellText, toQueueItem, watchLabel,
    type AttentionId, type QueueItem, type TileId,
} from './desk/queueText';
import { STAGE_BY_ID } from '../design/stages';

const EMPTY: DeskQueue = { rows: [], attention_after_days: {}, whatsapp_enabled: false, truncated: false };

const TONE_CLASS = {
    danger: 'bg-dw-danger-soft text-dw-danger',
    warning: 'bg-dw-warning-soft text-dw-warning',
    neutral: 'bg-dw-sunken text-dw-body',
} as const;

type Filter = { kind: 'tile'; id: TileId } | { kind: 'attention'; id: AttentionId };

const parseFilter = (raw: string | null): Filter => {
    if (raw && ATTENTION.some(a => a.id === raw)) return { kind: 'attention', id: raw as AttentionId };
    if (raw && TILES.some(t => t.id === raw)) return { kind: 'tile', id: raw as TileId };
    return { kind: 'tile', id: 'all' };
};

const FrontDesk: React.FC = () => {
    const { query } = useLocation();
    const { formatCurrency, config } = useAppConfig();
    const toast = useToast();
    const [text, setText] = useState(query.get('q') || '');
    const [search, setSearch] = useState(query.get('q') || '');
    const [filter, setFilter] = useState<Filter>(() => parseFilter(query.get('f')));
    const [data, setData] = useState<DeskQueue>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [assignFor, setAssignFor] = useState<QueueItem | null>(null);
    const [answerFor, setAnswerFor] = useState<QueueItem | null>(null);
    const [busyItem, setBusyItem] = useState<string | null>(null);
    const [scan, setScan] = useState(false);
    const req = useRef(0);
    const searchBox = useRef<HTMLDivElement>(null);

    const load = useCallback(async (q: string) => {
        const id = ++req.current;
        setLoading(true);
        setError('');
        try {
            const res = await getDeskQueue(q);
            if (id === req.current) setData(res);
        } catch (e) {
            if (id === req.current) setError(e instanceof Error ? e.message : 'Could not load the front desk.');
        } finally {
            if (id === req.current) setLoading(false);
        }
    }, []);

    useEffect(() => { void load(search); }, [search, load]);

    // Search and filter live in the URL, so Back from an order lands on the same list.
    useEffect(() => {
        const p = new URLSearchParams();
        if (search) p.set('q', search);
        if (!(filter.kind === 'tile' && filter.id === 'all')) p.set('f', filter.id);
        const qs = p.toString();
        navigate(`/desk${qs ? `?${qs}` : ''}`, { replace: true });
    }, [search, filter]);

    // "/" jumps to search from anywhere on the page.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (e.key !== '/' || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
            e.preventDefault();
            searchBox.current?.querySelector('input')?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const items = useMemo(() => data.rows.map(toQueueItem), [data.rows]);
    const inShop = useMemo(() => items.filter(q => q.stage !== 'collected'), [items]);
    const searching = search.length > 0;

    const visible = useMemo(() => {
        if (searching) return items;
        const test = filter.kind === 'tile'
            ? TILES.find(t => t.id === filter.id)!.test
            : ATTENTION.find(a => a.id === filter.id)!.test;
        return inShop.filter(test).sort((a, b) => b.row.days_in_stage - a.row.days_in_stage);
    }, [items, inShop, filter, searching]);

    const heading = searching
        ? `Results for “${search}”`
        : filter.kind === 'tile'
            ? TILES.find(t => t.id === filter.id)!.title
            : ATTENTION.find(a => a.id === filter.id)!.label(visible.length).replace(/^\d+ /, '');

    const act = async (item: QueueItem, action: StageAction, done: string) => {
        setBusyItem(item.row.item_name);
        try {
            await runStageAction(item.row.item_name, action);
            toast.success(done);
            await load(search);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'That did not work. Refresh and try again.');
        } finally {
            setBusyItem(null);
        }
    };

    const orderPath = (item: QueueItem, step?: 'estimate' | 'collect') => step === 'collect'
        ? `${buildPath('orders', item.row.repair_order, 'collect')}?watch=${encodeURIComponent(item.row.item_name)}`
        : step ? buildPath('orders', item.row.repair_order, step) : buildPath('orders', item.row.repair_order);

    const nextAction = (item: QueueItem) => {
        const busy = busyItem === item.row.item_name;
        if (busy) return { label: 'Saving…', onClick: () => undefined };
        if (item.waitingParts) return { label: 'Part arrived', onClick: () => void act(item, 'parts_arrived', 'Part arrived, back in repair') };
        switch (item.stage) {
            case 'received':
                return { label: 'Assign technician', primary: true, onClick: () => setAssignFor(item) };
            case 'estimate':
                return { label: 'Send estimate', primary: true, onClick: () => navigate(orderPath(item, 'estimate')) };
            case 'customer':
                return { label: 'Record answer', primary: true, onClick: () => setAnswerFor(item) };
            case 'ready':
                return { label: 'Collect', primary: true, onClick: () => navigate(orderPath(item, 'collect')) };
            case 'return':
                return { label: 'Return watch', onClick: () => navigate(orderPath(item)) };
            default:
                return { label: 'Open', onClick: () => navigate(orderPath(item)) };
        }
    };

    const exportRows = () => visible.map(item => ({
        customer: item.row.customer_name,
        mobile: item.row.customer_mobile,
        order: item.row.repair_order,
        reference: item.row.reference_number || '',
        watch: watchLabel(item.row),
        serial: item.row.serial_number || '',
        stage: STAGE_BY_ID[item.stage].label + (item.waitingParts ? ' · waiting parts' : ''),
        since: sinceText(item),
        answer: tellText(item, formatCurrency),
        promisedDate: item.row.promised_delivery_date,
        promised: formatDay(item.row.promised_delivery_date),
        daysLate: item.row.overdue_days,
        technician: item.row.technician || '',
        receivedDate: item.row.received_date,
        orderStatus: item.row.order_status,
        priority: item.row.priority,
        balance: item.row.balance_amount || 0,
        lastMessage: item.row.last_message?.label || '',
        lastMessageDate: item.row.last_message?.sent_at?.slice(0, 10) || null,
        needsAttention: item.row.needs_attention,
    }));

    const attention = ATTENTION.map(a => ({ ...a, count: inShop.filter(a.test).length })).filter(a => a.count > 0);
    const pickTile = (id: TileId) => setFilter({ kind: 'tile', id });
    const active = (f: Filter) => !searching && filter.kind === f.kind && filter.id === f.id;

    return (
        <div className="max-w-[1320px] mx-auto">
            {/* Search + primary actions */}
            <div className="flex flex-col sm:flex-row gap-3 lg:pt-2">
                <div ref={searchBox} className="flex-1 min-w-0">
                    <SearchField
                        size="lg"
                        value={text}
                        onChange={setText}
                        onSearch={setSearch}
                        label="Find an order"
                        placeholder="Customer calling? Mobile, name, order no., tag or serial"
                        onScan={() => setScan(true)}
                    />
                </div>
                <div className="hidden sm:flex gap-2">
                    <Button variant="primary" size="lg" icon="plus" onClick={() => navigate('/intake')}>New repair order</Button>
                    <Button size="lg" onClick={() => navigate('/pos')}>Retail sale</Button>
                </div>
            </div>
            <p className="hidden sm:block mt-1.5 text-[12px] font-semibold text-dw-caption">
                Search finds collected orders too. Press <kbd className="px-1.5 py-0.5 rounded bg-dw-sunken text-dw-body">/</kbd> to search from anywhere.
            </p>

            {!searching && (
                <>
                    {attention.length > 0 && (
                        <div className="flex gap-2 mt-4 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap" aria-label="Needs attention">
                            {attention.map(a => (
                                <button
                                    key={a.id}
                                    type="button"
                                    aria-pressed={active({ kind: 'attention', id: a.id })}
                                    onClick={() => setFilter(active({ kind: 'attention', id: a.id }) ? { kind: 'tile', id: 'all' } : { kind: 'attention', id: a.id })}
                                    className={cx(
                                        'shrink-0 h-9 px-3.5 rounded-full text-[13px] font-bold border-2',
                                        TONE_CLASS[a.tone],
                                        active({ kind: 'attention', id: a.id }) ? 'border-current' : 'border-transparent',
                                    )}
                                >
                                    {a.label(a.count)}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 xl:grid-cols-8" aria-label="Stages">
                        {TILES.map(t => {
                            const n = inShop.filter(t.test).length;
                            const on = active({ kind: 'tile', id: t.id });
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => pickTile(t.id)}
                                    className={cx(
                                        'shrink-0 min-w-[112px] text-left px-3 py-2.5 rounded-dw-control border bg-dw-surface',
                                        on ? 'border-dw-text shadow-[inset_0_0_0_1px_var(--dw-text)]' : 'border-dw-border hover:border-dw-border-strong',
                                    )}
                                >
                                    <span className="block text-[22px] leading-tight font-extrabold tracking-[-.02em]">{loading && !data.rows.length ? '–' : n}</span>
                                    <span className="block text-[12px] leading-tight font-bold text-dw-caption">{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            <div className="flex items-center justify-between gap-3 mt-5 mb-2.5">
                <h1 className="m-0 text-[17px] font-extrabold min-w-0 truncate">
                    {heading} <span className="text-dw-caption">· {visible.length}</span>
                </h1>
                <div className="flex items-center gap-2 shrink-0">
                    {!searching && <span className="hidden md:inline text-[12px] font-semibold text-dw-caption">Longest in stage first</span>}
                    <IconButton size="sm" icon="download" label="Export to Excel" disabled={!visible.length} onClick={() => exportOrderTrackerExcel(heading, exportRows())} />
                    <IconButton size="sm" icon="print" label="Print this list" disabled={!visible.length} onClick={() => printOrderTracker(heading, exportRows(), { logoUrl: config.logoUrl })} />
                </div>
            </div>

            <Card pad={false} className="overflow-hidden">
                <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_170px_130px_170px] gap-4 px-4 py-2.5 bg-[#FBF9F6] border-b border-dw-border text-[11px] font-extrabold tracking-[.05em] uppercase text-dw-caption">
                    <span>Customer</span><span>Watch · what to tell them</span><span>Stage</span><span>Promised · tech</span><span className="text-right">Next</span>
                </div>
                {error ? (
                    <EmptyState icon="alert" title="Could not load the front desk" body={error} action={<Button onClick={() => void load(search)}>Try again</Button>} />
                ) : loading && !data.rows.length ? (
                    <div className="flex justify-center py-12 text-dw-caption"><Spinner size={24} /></div>
                ) : visible.length === 0 ? (
                    searching
                        ? <EmptyState icon="search" title="No order matches" body="Try the mobile number without the country code, the order number, or the serial." action={<Button onClick={() => navigate(`/orders?q=${encodeURIComponent(search)}`)}>Search all orders</Button>} />
                        : <EmptyState icon="check" title="Nothing here" body="No watch is in this stage right now." action={filter.kind === 'tile' && filter.id === 'all' ? undefined : <Button onClick={() => pickTile('all')}>Show everything</Button>} />
                ) : (
                    <div className={cx(loading && 'opacity-60 transition-opacity')}>
                        {visible.map(item => {
                            const p = promisedText(item.row);
                            return (
                                <QueueRow
                                    key={item.row.item_name}
                                    to={buildPath('orders', item.row.repair_order)}
                                    orderNo={item.row.repair_order + (item.row.reference_number ? ` · tag ${item.row.reference_number}` : '')}
                                    customer={item.row.customer_name}
                                    phone={item.row.customer_mobile}
                                    watch={watchLabel(item.row) + (item.row.priority && item.row.priority !== 'Normal' ? ` · ${item.row.priority}` : '')}
                                    stage={item.stage}
                                    waitingParts={item.waitingParts}
                                    since={sinceText(item)}
                                    stale={item.row.needs_attention}
                                    tell={tellText(item, formatCurrency)}
                                    due={item.stage === 'collected' ? undefined : p.text}
                                    overdue={p.late && item.stage !== 'ready' && item.stage !== 'return'}
                                    technician={item.row.technician}
                                    action={nextAction(item)}
                                />
                            );
                        })}
                    </div>
                )}
            </Card>
            {data.truncated && <p className="mt-3 text-[12px] font-semibold text-dw-warning">Showing the first {data.rows.length} watches. Narrow the search to see the rest.</p>}
            {!searching && (
                <p className="mt-3 text-[12px] font-semibold text-dw-caption">
                    Collected orders are hidden here, but the search above finds them. Full history and filters are under <Link to="/orders">Orders</Link>.
                </p>
            )}

            <ScanSheet open={scan} onClose={() => setScan(false)} />
            <AssignSheet
                open={!!assignFor}
                onClose={() => setAssignFor(null)}
                watch={assignFor ? `${watchLabel(assignFor.row)} · ${assignFor.row.customer_name}` : ''}
                current={assignFor?.row.technician_id}
                onAssign={async tech => {
                    if (!assignFor) return;
                    try {
                        await assignTechnician(assignFor.row.item_name, tech);
                        toast.success(tech ? 'Technician assigned' : 'Technician removed');
                        await load(search);
                    } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Could not assign the technician.');
                        throw e;
                    }
                }}
            />

            <Sheet
                open={!!answerFor}
                onClose={() => setAnswerFor(null)}
                title="What did the customer say?"
                description={answerFor ? `${watchLabel(answerFor.row)} · ${answerFor.row.customer_name}${answerFor.row.quotation_amount ? ` · estimate ${formatCurrency(answerFor.row.quotation_amount)}` : ''}` : ''}
            >
                {answerFor && (
                    <div className="flex flex-col gap-2">
                        <Button variant="success" size="lg" block icon="check" onClick={() => { const a = answerFor; setAnswerFor(null); void act(a, 'approve', 'Approved. The technician can start.'); }}>
                            Approved, go ahead
                        </Button>
                        <Button variant="danger" size="lg" block icon="x" onClick={() => { const a = answerFor; setAnswerFor(null); void act(a, 'decline', 'Declined. Listed to return.'); }}>
                            Declined, return the watch
                        </Button>
                        {answerFor.row.customer_mobile && (
                            <a href={`tel:${answerFor.row.customer_mobile.replace(/\s/g, '')}`} className="mt-1 inline-flex items-center justify-center gap-2 h-11 rounded-dw-control text-[15px] font-bold text-dw-accent hover:bg-dw-sunken no-underline">
                                Call {answerFor.row.customer_mobile}
                            </a>
                        )}
                        <p className="text-[12px] text-dw-caption text-center">Changes to the estimate are made on the order page.</p>
                    </div>
                )}
            </Sheet>
        </div>
    );
};

export default FrontDesk;
