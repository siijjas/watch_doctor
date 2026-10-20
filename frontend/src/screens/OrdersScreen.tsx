/**
 * Orders (canvas D3): every repair order, open and collected, one row per
 * order, with stage / period / technician / money filters and Excel.
 * Technicians reach it as "Find" and only see orders with their watches.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, navigate, path as buildPath, useLocation } from '../router';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, DataTable, EmptyState, SearchField, SelectInput, Spinner, StageBadge, Toggle,
    addDays, cx, formatDay, toISODate, type Column,
} from '../design/kit';
import { orderLeadStage, summariseOrder, STAGES } from '../design/stages';
import { listOrderHistory, type HistoryFilters, type HistoryOrder } from '../services/deskApi';
import * as apiService from '../services/apiService';
import { downloadExcel } from '../components/reports/exportExcel';
import { watchLabel } from './desk/queueText';
import { ScanSheet } from './shared/ScanSheet';

const PAGE = 50;

const PERIODS: { id: string; label: string; range: () => [string, string] | null }[] = [
    { id: '90d', label: 'Last 90 days', range: () => [addDays(toISODate(new Date()), -89), toISODate(new Date())] },
    { id: 'month', label: 'This month', range: () => { const d = new Date(); return [toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), toISODate(d)]; } },
    { id: 'lastmonth', label: 'Last month', range: () => { const d = new Date(); return [toISODate(new Date(d.getFullYear(), d.getMonth() - 1, 1)), toISODate(new Date(d.getFullYear(), d.getMonth(), 0))]; } },
    { id: 'year', label: 'This year', range: () => { const d = new Date(); return [toISODate(new Date(d.getFullYear(), 0, 1)), toISODate(d)]; } },
    { id: 'all', label: 'Any date', range: () => null },
];

const STAGE_FILTERS = [
    { id: '', label: 'Any stage' },
    ...STAGES.filter(s => s.id !== 'collected').map(s => ({ id: s.id, label: s.label })),
    { id: 'parts', label: 'Waiting parts' },
    { id: 'collected', label: 'Collected' },
];

const isCollected = (o: HistoryOrder) => o.docstatus === 1 || o.status === 'Delivered';

const OrdersScreen: React.FC = () => {
    const { query } = useLocation();
    const { hasRole } = useAuth();
    const { formatCurrency } = useAppConfig();
    const desk = hasRole('executive', 'data_entry');

    const [text, setText] = useState(query.get('q') || '');
    const [search, setSearch] = useState(query.get('q') || '');
    const [stage, setStage] = useState(query.get('stage') || '');
    // Technicians look up a specific job, so they search all dates.
    const defaultPeriod = query.get('q') || !desk ? 'all' : '90d';
    const [period, setPeriod] = useState(query.get('period') || defaultPeriod);
    const [tech, setTech] = useState(query.get('tech') || '');
    const [money, setMoney] = useState(query.get('money') || '');
    const [collected, setCollected] = useState(query.get('collected') !== '0');
    const [page, setPage] = useState(Math.max(0, Number(query.get('page') || 0) || 0));

    const [rows, setRows] = useState<HistoryOrder[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);
    const [scan, setScan] = useState(false);
    const [technicians, setTechnicians] = useState<{ name: string; label: string }[]>([]);
    const req = useRef(0);

    useEffect(() => {
        if (!desk) return;
        apiService.getEmployees().then(list => setTechnicians(list.map(t => ({ name: t.name, label: t.employee_name })))).catch(() => undefined);
    }, [desk]);

    const filters = useMemo<HistoryFilters>(() => {
        const range = PERIODS.find(p => p.id === period)?.range() ?? null;
        return {
            search, stage, technician: tech, money, show_collected: collected,
            from_date: range?.[0], to_date: range?.[1],
        };
    }, [search, stage, period, tech, money, collected]);

    // A new filter starts again at page one.
    const firstFilter = useRef(true);
    useEffect(() => {
        if (firstFilter.current) { firstFilter.current = false; return; }
        setPage(0);
    }, [filters]);

    const load = useCallback(async () => {
        const id = ++req.current;
        setLoading(true);
        setError('');
        try {
            const res = await listOrderHistory(page * PAGE, PAGE, filters);
            if (id !== req.current) return;
            setRows(res.orders);
            setTotal(res.total_count);
        } catch (e) {
            if (id === req.current) setError(e instanceof Error ? e.message : 'Could not load orders.');
        } finally {
            if (id === req.current) setLoading(false);
        }
    }, [filters, page]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        const p = new URLSearchParams();
        if (search) p.set('q', search);
        if (stage) p.set('stage', stage);
        if (period !== defaultPeriod) p.set('period', period);
        if (tech) p.set('tech', tech);
        if (money) p.set('money', money);
        if (!collected) p.set('collected', '0');
        if (page) p.set('page', String(page));
        const qs = p.toString();
        navigate(`/orders${qs ? `?${qs}` : ''}`, { replace: true });
    }, [search, stage, period, tech, money, collected, page, defaultPeriod]);

    const moneyText = (o: HistoryOrder): { amount: string; note: string; tone?: string } => {
        if (o.sales_invoice) {
            const due = o.balance_amount || 0;
            return due > 0
                ? { amount: formatCurrency(o.invoiced_amount || 0), note: `${formatCurrency(due)} still due`, tone: 'text-dw-warning' }
                : { amount: formatCurrency(o.invoiced_amount || 0), note: 'paid' };
        }
        if (o.quotation_amount) return { amount: formatCurrency(o.quotation_amount), note: 'estimate, not invoiced' };
        return { amount: '—', note: 'no estimate yet' };
    };

    const dateText = (o: HistoryOrder) => {
        if (isCollected(o)) return { text: o.delivery_date ? `Collected ${formatDay(o.delivery_date)}` : 'Collected', late: false };
        if (!o.promised_delivery_date) return { text: '—', late: false };
        const late = o.promised_delivery_date < toISODate(new Date());
        return { text: formatDay(o.promised_delivery_date), late };
    };

    const stageOf = (o: HistoryOrder) => {
        const doc = isCollected(o) ? 1 : 0;
        const ws = o.watches.map(w => ({ status: w.status, awaiting_parts: w.awaiting_parts }));
        return { lead: orderLeadStage(ws, doc), label: summariseOrder(ws, doc) };
    };

    const columns: Column<HistoryOrder>[] = [
        { key: 'order', header: 'Order', width: 'w-[130px]', render: o => (
            <span className="flex flex-col">
                <Link to={buildPath('orders', o.name)} className="font-extrabold text-dw-text no-underline hover:underline">{o.name}</Link>
                <span className="text-[12px] font-semibold text-dw-caption">{[o.reference_number && `tag ${o.reference_number}`, o.priority !== 'Normal' && o.priority].filter(Boolean).join(' · ')}</span>
            </span>
        ) },
        { key: 'customer', header: 'Customer', render: o => (
            <span className="flex flex-col min-w-0">
                <span className="font-bold truncate">{o.customer_name}</span>
                <span className="text-[12px] font-semibold text-dw-caption">{o.customer_mobile}</span>
            </span>
        ) },
        { key: 'watches', header: 'Watches', width: 'w-[24%]', render: o => <span className="line-clamp-2">{o.watches.map(watchLabel).join(' · ') || '—'}</span> },
        { key: 'stage', header: 'Stage', render: o => { const s = stageOf(o); return <StageBadge stage={s.lead}>{s.label}</StageBadge>; } },
        { key: 'received', header: 'Received', width: 'w-[110px]', render: o => formatDay(o.received_date) },
        { key: 'promised', header: 'Promised / collected', width: 'w-[150px]', render: o => { const d = dateText(o); return <span className={cx('font-bold', d.late && 'text-dw-danger')}>{d.text}</span>; } },
        ...(desk ? [{ key: 'money', header: 'Money', align: 'right' as const, width: 'w-[150px]', render: (o: HistoryOrder) => {
            const m = moneyText(o);
            return <span className="flex flex-col items-end"><span className="font-extrabold tabular-nums">{m.amount}</span><span className={cx('text-[12px] font-semibold', m.tone || 'text-dw-caption')}>{m.note}</span></span>;
        } }] : []),
    ];

    const exportAll = async () => {
        setExporting(true);
        try {
            const all: HistoryOrder[] = [];
            for (let start = 0; start < Math.min(total, 2000); start += 200) {
                const res = await listOrderHistory(start, 200, filters);
                all.push(...res.orders);
                if (res.orders.length < 200) break;
            }
            downloadExcel(`orders-${toISODate(new Date())}`, {
                name: 'Orders',
                columns: [
                    { header: 'Order', width: 12 }, { header: 'Tag', width: 10 }, { header: 'Customer', width: 26 }, { header: 'Mobile', width: 14 },
                    { header: 'Watches', width: 36 }, { header: 'Stage', width: 24 }, { header: 'Received', width: 12 }, { header: 'Promised', width: 12 },
                    { header: 'Collected', width: 12 }, { header: 'Priority', width: 10 }, { header: 'Estimate', width: 12 }, { header: 'Invoiced', width: 12 },
                    { header: 'Paid', width: 12 }, { header: 'Balance', width: 12 },
                ],
                rows: all.map(o => [
                    o.name, o.reference_number || '', o.customer_name, o.customer_mobile, o.watches.map(watchLabel).join(', '),
                    stageOf(o).label, { date: o.received_date }, { date: o.promised_delivery_date }, { date: o.delivery_date }, o.priority,
                    o.quotation_amount || null, o.invoiced_amount || null, o.paid_amount || null, o.balance_amount || null,
                ]),
            });
        } finally {
            setExporting(false);
        }
    };

    const pages = Math.max(1, Math.ceil(total / PAGE));

    return (
        <div className="max-w-[1320px] mx-auto">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="m-0 text-[22px] lg:text-[24px] font-extrabold tracking-[-.01em]">{desk ? 'Orders' : 'Find an order'}</h1>
                    <p className="m-0 text-[13px] font-semibold text-dw-caption">{desk ? 'All repair orders, open and collected · one row per order' : 'Orders with a watch assigned to you'}</p>
                </div>
                {desk && (
                    <div className="hidden sm:flex gap-2">
                        <Button icon="download" busy={exporting} disabled={!total} onClick={() => void exportAll()}>Export Excel</Button>
                        <Button variant="primary" icon="plus" onClick={() => navigate('/intake')}>New repair order</Button>
                    </div>
                )}
            </div>

            <Card className="mt-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <SearchField value={text} onChange={setText} onSearch={q => { setSearch(q); if (q && period === '90d') setPeriod('all'); }} placeholder="Order, tag, customer, mobile, serial or watch" className="lg:flex-[1_1_280px]" onScan={() => setScan(true)} />
                <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
                    <SelectInput aria-label="Stage" value={stage} onChange={e => setStage(e.target.value)} className="lg:w-[180px]">
                        {STAGE_FILTERS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </SelectInput>
                    <SelectInput aria-label="Received" value={period} onChange={e => setPeriod(e.target.value)} className="lg:w-[170px]">
                        {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </SelectInput>
                    {desk && (
                        <>
                            <SelectInput aria-label="Technician" value={tech} onChange={e => setTech(e.target.value)} className="lg:w-[190px]">
                                <option value="">Any technician</option>
                                <option value="unassigned">No technician</option>
                                {technicians.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
                            </SelectInput>
                            <SelectInput aria-label="Money" value={money} onChange={e => setMoney(e.target.value)} className="lg:w-[170px]">
                                <option value="">Any balance</option>
                                <option value="due">Balance due</option>
                                <option value="paid">Fully paid</option>
                                <option value="none">No invoice yet</option>
                            </SelectInput>
                        </>
                    )}
                </div>
                {stage !== 'collected' && (
                    <div className="lg:ml-auto"><Toggle checked={collected} onChange={setCollected} label="Show collected" /></div>
                )}
            </Card>

            <div className="flex items-center justify-between mt-4 mb-2 text-[13px] font-semibold text-dw-caption">
                <span>{loading ? 'Loading…' : `${total} ${total === 1 ? 'order' : 'orders'} · newest first`}</span>
                {pages > 1 && <span>Page {page + 1} of {pages}</span>}
            </div>

            {error ? (
                <Card><EmptyState icon="alert" title="Could not load orders" body={error} action={<Button onClick={() => void load()}>Try again</Button>} /></Card>
            ) : (
                <>
                    {/* Desk: one table style */}
                    <div className="hidden lg:block">
                        <DataTable
                            columns={columns}
                            rows={rows}
                            rowKey={o => o.name}
                            onRowClick={o => navigate(buildPath('orders', o.name))}
                            loading={loading && !rows.length}
                            caption="Repair orders"
                            empty={{ title: 'No orders match', body: 'Clear a filter or widen the date range.' }}
                        />
                    </div>
                    {/* Phone: cards */}
                    <div className="lg:hidden">
                        {loading && !rows.length ? (
                            <div className="flex justify-center py-10 text-dw-caption"><Spinner size={22} /></div>
                        ) : !rows.length ? (
                            <Card><EmptyState icon="search" title="No orders match" body="Clear a filter or widen the date range." /></Card>
                        ) : (
                            <Card pad={false} className="overflow-hidden">
                                {rows.map(o => {
                                    const s = stageOf(o);
                                    const d = dateText(o);
                                    return (
                                        <Link key={o.name} to={buildPath('orders', o.name)} className="block px-4 py-3 border-b border-dw-line last:border-b-0 no-underline text-dw-text hover:bg-dw-ground">
                                            <span className="flex items-baseline gap-2">
                                                <span className="flex-1 min-w-0 truncate text-[15px] font-extrabold">{o.customer_name}</span>
                                                <span className="text-[12px] font-bold text-dw-caption">#{o.name}</span>
                                            </span>
                                            <span className="block text-[14px] font-semibold text-dw-body truncate">{o.watches.map(watchLabel).join(' · ')}</span>
                                            <span className="mt-1.5 flex items-center gap-2 flex-wrap">
                                                <StageBadge stage={s.lead}>{s.label}</StageBadge>
                                                <span className={cx('text-[12px] font-semibold', d.late ? 'text-dw-danger' : 'text-dw-caption')}>{d.text}</span>
                                            </span>
                                        </Link>
                                    );
                                })}
                            </Card>
                        )}
                    </div>
                </>
            )}

            <ScanSheet open={scan} onClose={() => setScan(false)} />
            {pages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                    <Button icon="chevronLeft" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <Button disabled={page + 1 >= pages || loading} onClick={() => setPage(p => p + 1)}>Next {PAGE}</Button>
                </div>
            )}
        </div>
    );
};

export default OrdersScreen;
