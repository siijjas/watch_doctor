/**
 * Owner dashboard (canvas D11 / M7). Figures come from api/owner.get_overview,
 * where each one is defined once: collected = watches marked Delivered in the
 * period; invoiced vs money actually taken are separate.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, navigate, path as buildPath } from '../router';
import { useAppConfig } from '../context/AppConfigContext';
import { Button, Card, EmptyState, Icon, Segmented, Spinner, cx, formatDay, toISODate, addDays } from '../design/kit';
import { apiFetchRaw } from '../services/apiService';

interface Overview {
    from_date: string;
    to_date: string;
    received: number;
    collected: number;
    invoiced: number;
    invoiced_repairs: number;
    invoiced_retail: number;
    invoiced_other: number;
    invoiced_returns: number;
    taken: { total: number; by_mode: Array<{ mode: string; amount: number }> };
    turnaround_avg: number | null;
    turnaround_median: number | null;
    attention: Record<'overdue' | 'ready_long' | 'estimate_late' | 'customer_silent' | 'part_late' | 'no_tech', number>;
    receivables: { total: number; count: number; old_count: number; old_total: number; rows: Array<{ name: string; customer_name: string; posting_date: string; outstanding_amount: number; age_days: number; kind: string; repair_order: string | null; dw_is_credit_sale: number }> };
    workshop: { total: number; mix: Record<string, number> };
    technicians: Array<{ name: string; open: number; finished: number }>;
    trend: Array<{ date: string; received: number; collected: number }>;
    complaints: Array<{ issue: string; count: number; share: number }>;
}

const getOverview = async (from: string, to: string): Promise<Overview> =>
    (await apiFetchRaw('/api/method/watch_doctor.api.get_overview', { method: 'POST', body: JSON.stringify({ from_date: from, to_date: to }) })).message;

type PeriodId = 'today' | '7d' | '30d' | 'month';
const periodRange = (p: PeriodId): [string, string] => {
    const t = toISODate(new Date());
    if (p === 'today') return [t, t];
    if (p === '7d') return [addDays(t, -6), t];
    if (p === '30d') return [addDays(t, -29), t];
    const d = new Date();
    return [toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), t];
};

// Stage mix colours: validated as a categorical set (dataviz validator, light surface).
const MIX: Array<{ keys: string[]; label: string; color: string; filter: string }> = [
    { keys: ['received'], label: 'Received', color: '#A8643A', filter: 'received' },
    { keys: ['diagnosing', 'repair'], label: 'With technician', color: '#456FBF', filter: 'repair' },
    { keys: ['estimate'], label: 'Estimate to send', color: '#E8963E', filter: 'estimate' },
    { keys: ['customer'], label: 'Waiting customer', color: '#7A5BC7', filter: 'customer' },
    { keys: ['parts'], label: 'Waiting parts', color: '#D9A83A', filter: 'parts' },
    { keys: ['ready', 'return'], label: 'Ready / to return', color: '#2E8B57', filter: 'ready' },
];
const SERIES = { received: '#456FBF', collected: '#2E8B57' };

const ATTENTION: Array<{ key: keyof Overview['attention']; label: string; filter: string }> = [
    { key: 'overdue', label: 'Past promised date', filter: 'overdue' },
    { key: 'ready_long', label: 'Ready over 7 days, not collected', filter: 'readyLong' },
    { key: 'estimate_late', label: 'Estimate not sent', filter: 'estimateLate' },
    { key: 'customer_silent', label: 'Customer not answering', filter: 'customerSilent' },
    { key: 'part_late', label: 'Part overdue from supplier', filter: 'partLate' },
    { key: 'no_tech', label: 'Watches with no technician', filter: 'noTech' },
];

const H2: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
    <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{children}</h2>
        {action}
    </div>
);

const Trend: React.FC<{ rows: Overview['trend'] }> = ({ rows }) => {
    const [table, setTable] = useState(false);
    const max = Math.max(1, ...rows.map(r => Math.max(r.received, r.collected)));
    const step = rows.length > 31 ? 7 : rows.length > 14 ? 3 : 1;
    if (!rows.length) return <p className="m-0 text-[13px] text-dw-caption">Choose a shorter period to see days.</p>;
    return (
        <>
            {table ? (
                <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-[13px] border-collapse">
                        <thead><tr className="text-[11px] uppercase tracking-[.05em] text-dw-caption"><th className="text-left py-1.5">Day</th><th className="text-right">Received</th><th className="text-right">Collected</th></tr></thead>
                        <tbody>{rows.map(r => <tr key={r.date} className="border-t border-dw-line"><td className="py-1.5">{formatDay(r.date)}</td><td className="text-right tabular-nums">{r.received}</td><td className="text-right tabular-nums">{r.collected}</td></tr>)}</tbody>
                    </table>
                </div>
            ) : (
                <div className="flex items-end gap-[2px] h-[160px]" role="img" aria-label={`Watches received and collected per day, ${rows.length} days`}>
                    {rows.map((r, i) => (
                        <div key={r.date} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group relative">
                            <div className="w-full flex items-end justify-center gap-[2px] h-[140px]">
                                {(['received', 'collected'] as const).map(k => (
                                    <span key={k} className="flex-1 max-w-[14px] rounded-t-[4px]" style={{ height: `${(r[k] / max) * 100}%`, minHeight: r[k] ? 2 : 0, background: SERIES[k] }} />
                                ))}
                            </div>
                            <span className="h-4 text-[10px] font-semibold text-dw-caption">{i % step === 0 ? new Date(`${r.date}T00:00`).getDate() : ''}</span>
                            {/* Hover target is the whole day column, bigger than the bars */}
                            <span className="pointer-events-none absolute bottom-full mb-1 hidden group-hover:block whitespace-nowrap px-2 py-1 rounded-[8px] bg-dw-text text-white text-[11px] font-semibold z-10">
                                {formatDay(r.date)} · {r.received} received · {r.collected} collected
                            </span>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-4 mt-2 text-[12px] font-semibold text-dw-body">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES.received }} />Received</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SERIES.collected }} />Collected</span>
                <button type="button" onClick={() => setTable(t => !t)} className="ml-auto font-bold text-dw-accent">{table ? 'Chart view' : 'Table view'}</button>
            </div>
        </>
    );
};

const DashboardScreen: React.FC = () => {
    const { formatCurrency } = useAppConfig();
    const [period, setPeriod] = useState<PeriodId>('7d');
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        setLoading(true);
        const [f, t] = periodRange(period);
        getOverview(f, t).then(d => { if (live) { setData(d); setError(''); } }).catch(e => live && setError(e instanceof Error ? e.message : 'Could not load the dashboard.')).finally(() => live && setLoading(false));
        return () => { live = false; };
    }, [period]);

    const mix = useMemo(() => (data ? MIX.map(m => ({ ...m, n: m.keys.reduce((s, k) => s + (data.workshop.mix[k] || 0), 0) })) : []), [data]);

    if (error && !data) return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="alert" title="Could not load the dashboard" body={error} action={<Button onClick={() => setPeriod(p => p)}>Try again</Button>} /></Card>;
    if (!data) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

    const rangeLabel = data.from_date === data.to_date ? formatDay(data.from_date) : `${formatDay(data.from_date)} – ${formatDay(data.to_date)}`;
    const techMax = Math.max(1, ...data.technicians.map(t => t.open + t.finished));
    const tiles = [
        { n: String(data.received), l: 'Watches received', s: 'on orders received in the period', to: '/orders' },
        { n: String(data.collected), l: 'Collected', s: 'by the date handed over', to: '/orders?stage=collected' },
        { n: formatCurrency(data.invoiced), l: 'Invoiced, after returns', s: [`repairs ${formatCurrency(data.invoiced_repairs)}`, `retail ${formatCurrency(data.invoiced_retail)}`, data.invoiced_other ? `B2B ${formatCurrency(data.invoiced_other)}` : '', data.invoiced_returns ? `returns ${formatCurrency(data.invoiced_returns)}` : ''].filter(Boolean).join(' · '), to: '/reports/sales' },
        { n: formatCurrency(data.taken.total), l: 'Money taken', s: data.taken.by_mode.slice(0, 2).map(m => `${m.mode.toLowerCase()} ${formatCurrency(m.amount)}`).join(' · ') || 'payments received', to: '/reports/cash' },
        { n: data.turnaround_avg != null ? `${data.turnaround_avg} d` : '—', l: 'Received → collected', s: data.turnaround_median != null ? `median ${data.turnaround_median} d` : 'nothing collected yet', to: '/reports/workshop' },
    ];

    return (
        <div className={cx('max-w-[1320px] mx-auto', loading && 'opacity-70 transition-opacity')}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="m-0 text-[22px] lg:text-[24px] font-extrabold tracking-[-.01em]">Shop overview</h1>
                    <p className="m-0 text-[13px] font-semibold text-dw-caption">{rangeLabel}</p>
                </div>
                <Segmented<PeriodId> label="Period" value={period} onChange={setPeriod} className="w-full sm:w-auto"
                    options={[{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'month', label: 'This month' }]} />
            </div>

            <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
                {tiles.map(t => (
                    <Link key={t.l} to={t.to} className="block p-4 rounded-dw-card border border-dw-border bg-dw-surface no-underline text-dw-text hover:border-dw-border-strong">
                        <span className="block text-[22px] font-extrabold tracking-[-.02em] tabular-nums truncate">{t.n}</span>
                        <span className="block text-[13px] font-bold">{t.l}</span>
                        <span className="block text-[12px] font-semibold text-dw-caption truncate" title={t.s}>{t.s}</span>
                    </Link>
                ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3 items-start">
                <Card>
                    <H2>Needs attention now</H2>
                    <div className="flex flex-col">
                        {ATTENTION.map(a => {
                            const n = data.attention[a.key];
                            return (
                                <Link key={a.key} to={`/desk?f=${a.filter}`} className={cx('flex items-center gap-3 py-2.5 border-b border-dw-line no-underline text-dw-text hover:bg-dw-ground -mx-2 px-2 rounded', !n && 'opacity-50')}>
                                    <span className={cx('min-w-[32px] h-7 px-2 rounded-full flex items-center justify-center text-[13px] font-extrabold', n ? 'bg-dw-warning-soft text-dw-warning' : 'bg-dw-sunken text-dw-caption')}>{n}</span>
                                    <span className="flex-1 text-[14px] font-semibold">{a.label}</span>
                                    <Icon name="chevronRight" size={16} className="text-dw-caption" />
                                </Link>
                            );
                        })}
                        <Link to="/pos/collect" className="flex items-center gap-3 py-2.5 no-underline text-dw-text hover:bg-dw-ground -mx-2 px-2 rounded">
                            <span className={cx('min-w-[32px] h-7 px-2 rounded-full flex items-center justify-center text-[13px] font-extrabold', data.receivables.old_count ? 'bg-dw-danger-soft text-dw-danger' : 'bg-dw-sunken text-dw-caption')}>{data.receivables.old_count}</span>
                            <span className="flex-1 text-[14px] font-semibold">Unpaid over 30 days · {formatCurrency(data.receivables.old_total)}</span>
                            <Icon name="chevronRight" size={16} className="text-dw-caption" />
                        </Link>
                    </div>
                </Card>

                <Card>
                    <H2>Workshop now · {data.workshop.total} watches</H2>
                    {data.workshop.total > 0 && (
                        <div className="flex h-5 rounded-[6px] overflow-hidden gap-[2px]" role="img"
                            aria-label={`Stage mix: ${mix.filter(m => m.n).map(m => `${m.label} ${m.n}`).join(', ')}`}>
                            {mix.filter(m => m.n).map(m => (
                                <span key={m.label} title={`${m.label}: ${m.n}`} style={{ flexGrow: m.n, background: m.color }} />
                            ))}
                        </div>
                    )}
                    <div className="mt-3 grid grid-cols-1 gap-y-1.5">
                        {mix.map(m => (
                            <Link key={m.label} to={`/desk?f=${m.filter}`} className="flex items-center gap-2 text-[13px] font-semibold text-dw-body no-underline hover:text-dw-text">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: m.color }} />
                                <span className="flex-1 truncate">{m.label}</span>
                                <span className="font-extrabold tabular-nums text-dw-text">{m.n}</span>
                            </Link>
                        ))}
                    </div>
                    <h3 className="m-0 mt-5 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Technicians · open now / finished in period</h3>
                    {data.technicians.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">No watch is assigned.</p> : data.technicians.slice(0, 6).map(t => (
                        <div key={t.name} className="flex items-center gap-3 py-1.5 text-[13px]" title={`${t.name}: ${t.open} open, ${t.finished} finished in the period`}>
                            <span className="w-[110px] truncate font-bold">{t.name}</span>
                            <span className="flex-1 h-2 rounded-full bg-dw-sunken overflow-hidden flex gap-[2px]">
                                <span style={{ width: `${(t.open / techMax) * 100}%`, background: SERIES.received }} />
                                <span style={{ width: `${(t.finished / techMax) * 100}%`, background: SERIES.collected }} />
                            </span>
                            <span className="w-[56px] text-right font-bold tabular-nums">{t.open} / {t.finished}</span>
                        </div>
                    ))}
                </Card>

                <Card>
                    <H2>Received vs collected · per day</H2>
                    <Trend rows={data.trend} />
                    <h3 className="m-0 mt-5 mb-2 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Top complaints in period</h3>
                    {data.complaints.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">No watches received in this period.</p> : data.complaints.map(c => (
                        <div key={c.issue} className="flex items-center gap-3 py-1.5 text-[13px]" title={`${c.issue}: ${c.count} watches`}>
                            <span className="w-[130px] truncate font-bold">{c.issue}</span>
                            <span className="flex-1 h-2 rounded-full bg-dw-sunken overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${c.share}%`, background: SERIES.received }} /></span>
                            <span className="w-[40px] text-right font-bold tabular-nums">{c.share}%</span>
                        </div>
                    ))}
                </Card>
            </div>

            <Card pad={false} className="mt-4 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 pt-4">
                    <h2 className="m-0 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Money owed to the shop · {formatCurrency(data.receivables.total)} on {data.receivables.count} invoices</h2>
                    <Button size="sm" onClick={() => navigate('/pos/collect')}>Collect</Button>
                </div>
                <div className="overflow-x-auto mt-2">
                    <table className="w-full min-w-[640px] border-collapse text-[14px]">
                        <thead><tr className="text-[11px] uppercase tracking-[.05em] text-dw-caption bg-dw-ground"><th className="text-left px-4 py-2">Invoice</th><th className="text-left px-2">Customer</th><th className="text-left px-2">Type</th><th className="text-left px-2">Date</th><th className="text-right px-2">Outstanding</th><th className="text-right px-4">Age</th></tr></thead>
                        <tbody>
                            {data.receivables.rows.slice(0, 10).map(r => (
                                <tr key={r.name} className="border-t border-dw-line">
                                    <td className="px-4 py-2.5 font-bold">{r.name}</td>
                                    <td className="px-2">{r.customer_name}</td>
                                    <td className="px-2 text-dw-body">{r.repair_order ? <Link to={buildPath('orders', r.repair_order)}>Repair {r.repair_order}</Link> : r.kind === 'retail' ? (r.dw_is_credit_sale ? 'Retail, credit sale' : 'Retail') : r.kind === 'repair' ? 'Repair' : 'Other'}</td>
                                    <td className="px-2 text-dw-body">{formatDay(r.posting_date)}</td>
                                    <td className="px-2 text-right font-extrabold tabular-nums">{formatCurrency(r.outstanding_amount)}</td>
                                    <td className={cx('px-4 text-right font-bold', r.age_days > 30 ? 'text-dw-danger' : 'text-dw-caption')}>{r.age_days} d</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default DashboardScreen;
