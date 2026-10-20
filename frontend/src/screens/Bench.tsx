/**
 * My bench (canvas M2): the technician's home on the phone. Open watches
 * grouped by what to do first, and what was finished today.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, path as buildPath } from '../router';
import { Button, Card, EmptyState, Icon, Segmented, Spinner, StageBadge, cx, formatDay } from '../design/kit';
import { getMyBench, type BenchRow } from '../services/deskApi';
import { watchLabel } from './desk/queueText';
import { ScanSheet } from './shared/ScanSheet';
import { useLargeText } from '../design/pwa';

type Group = { id: string; title: string; rows: BenchRow[] };

const isUrgent = (r: BenchRow) => r.overdue_days > 0 || r.priority === 'VIP' || r.priority === 'Urgent';

const group = (rows: BenchRow[]): Group[] => {
    const first = rows.filter(r => isUrgent(r) && !r.awaiting_parts && (r.stage === 'repair' || r.stage === 'diagnosing'));
    const rest = rows.filter(r => !first.includes(r));
    return [
        { id: 'first', title: 'Do first', rows: first },
        { id: 'diag', title: 'To diagnose', rows: rest.filter(r => r.stage === 'diagnosing' && !r.awaiting_parts) },
        { id: 'repair', title: 'In repair', rows: rest.filter(r => r.stage === 'repair' && !r.awaiting_parts) },
        { id: 'wait', title: 'Waiting for the desk, the customer or a part', rows: rest.filter(r => r.awaiting_parts || r.stage === 'estimate' || r.stage === 'customer') },
    ].filter(g => g.rows.length > 0);
};

const subline = (r: BenchRow, showTech: boolean) => {
    const bits = [r.repair_order];
    if (r.overdue_days > 0) bits.push(r.overdue_days === 1 ? 'promised yesterday' : `${r.overdue_days} days late`);
    else if (r.promised_delivery_date) bits.push(`due ${formatDay(r.promised_delivery_date)}`);
    if (r.awaiting_parts) bits.push(r.parts_note ? `waiting: ${r.parts_note}` : 'waiting for a part');
    else if (r.stage === 'diagnosing') bits.push('needs diagnosis');
    else if (r.tasks_total) bits.push(`${r.tasks_done} of ${r.tasks_total} tasks`);
    if (showTech && r.technician) bits.push(r.technician);
    return bits.join(' · ');
};

const BenchCard: React.FC<{ r: BenchRow; showTech: boolean }> = ({ r, showTech }) => (
    <Link
        to={buildPath('orders', r.repair_order, 'watch', r.item_name)}
        className="flex items-center gap-3 px-4 py-3 min-h-[68px] border-b border-dw-line last:border-b-0 no-underline text-dw-text hover:bg-dw-ground"
    >
        <span className={cx('w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0', r.overdue_days > 0 ? 'bg-dw-danger-soft text-dw-danger' : 'bg-dw-sunken text-dw-body')}>
            <Icon name="watch" size={20} />
        </span>
        <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-extrabold truncate">{watchLabel(r)}</span>
            <span className="block text-[12px] font-semibold text-dw-caption truncate">{subline(r, showTech)}</span>
            <span className="mt-1 flex flex-wrap gap-1.5">
                <StageBadge stage={r.stage} />
                {r.awaiting_parts && <StageBadge stage="parts" />}
                {r.overdue_days > 0 && <StageBadge stage="overdue" />}
                {r.priority && r.priority !== 'Normal' && <StageBadge stage="estimate" dot={false}>{r.priority}</StageBadge>}
            </span>
        </span>
        <Icon name="chevronRight" size={18} className="text-dw-caption shrink-0" />
    </Link>
);

const Bench: React.FC = () => {
    const [data, setData] = useState<Awaited<ReturnType<typeof getMyBench>> | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<'todo' | 'done'>('todo');
    const [scan, setScan] = useState(false);
    const [large, setLarge] = useLargeText();

    const load = useCallback(async () => {
        setError('');
        try { setData(await getMyBench()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your bench.'); }
    }, []);

    useEffect(() => {
        void load();
        // Ticks on the job screen and moves at the desk show up when you come back to the tab.
        const onFocus = () => { if (document.visibilityState === 'visible') void load(); };
        document.addEventListener('visibilitychange', onFocus);
        return () => document.removeEventListener('visibilitychange', onFocus);
    }, [load]);

    const groups = useMemo(() => (data ? group(data.open) : []), [data]);
    const showTech = !!data && !data.technician;
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

    return (
        <div className="max-w-[720px] mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="m-0 text-[13px] font-bold text-dw-caption">{today}</p>
                    <h1 className="m-0 text-[24px] font-extrabold tracking-[-.01em]">{data?.technician ? 'My bench' : 'Workshop bench'}</h1>
                </div>
                <div className="flex gap-2 shrink-0">
                    <Button aria-pressed={large} onClick={() => setLarge(!large)} title="Larger text" aria-label="Larger text" className={cx('!px-3 text-[16px]', large && '!bg-dw-text !text-white !border-dw-text')}>Aa</Button>
                    <Button icon="scan" onClick={() => setScan(true)}>Scan</Button>
                    <Link to="/orders" className="inline-flex items-center gap-2 h-[42px] px-3 rounded-dw-control border border-dw-border-strong bg-dw-surface text-[14px] font-bold text-dw-text no-underline">
                        <Icon name="search" size={18} />Find
                    </Link>
                </div>
            </div>

            <Segmented<'todo' | 'done'>
                className="mt-4"
                label="Show"
                value={tab}
                onChange={setTab}
                options={[
                    { value: 'todo', label: 'To do', count: data?.open.length },
                    { value: 'done', label: 'Done today', count: data?.done_today.length },
                ]}
            />

            {error ? (
                <Card className="mt-4"><EmptyState icon="alert" title="Could not load your bench" body={error} action={<Button onClick={() => void load()}>Try again</Button>} /></Card>
            ) : !data ? (
                <div className="flex justify-center py-12 text-dw-caption"><Spinner size={24} /></div>
            ) : tab === 'todo' ? (
                groups.length === 0 ? (
                    <Card className="mt-4"><EmptyState icon="check" title="Nothing on your bench" body="When the front desk assigns you a watch, it shows up here." /></Card>
                ) : groups.map(g => (
                    <section key={g.id} className="mt-5">
                        <h2 className="m-0 mb-2 px-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{g.title} · {g.rows.length}</h2>
                        <Card pad={false} className="overflow-hidden">
                            {g.rows.map(r => <BenchCard key={r.item_name} r={r} showTech={showTech} />)}
                        </Card>
                    </section>
                ))
            ) : (
                <section className="mt-5">
                    {data.done_today.length === 0 ? (
                        <Card><EmptyState icon="clock" title="Nothing finished yet today" /></Card>
                    ) : (
                        <Card pad={false} className="overflow-hidden">
                            {data.done_today.map(r => <BenchCard key={r.item_name} r={r} showTech={showTech} />)}
                        </Card>
                    )}
                    <p className="mt-3 px-1 text-[12px] font-semibold text-dw-caption">Ticking the last task moves a watch to Ready. The front desk tells the customer.</p>
                </section>
            )}
            <ScanSheet open={scan} onClose={() => setScan(false)} />
        </div>
    );
};

export default Bench;
