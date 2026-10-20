import React from 'react';
import { Segmented } from './Choice';
import { DatePicker, addDays, parseISODate, toISODate } from './Inputs';
import { IconButton } from './primitives';

export type PeriodKind = 'day' | 'week' | 'month' | 'range';

export interface Period {
    kind: PeriodKind;
    from: string;
    to: string;
}

/** Week start: 0 Sunday … 6 Saturday. Bahrain's working week starts Sunday. */
export const periodFor = (kind: Exclude<PeriodKind, 'range'>, anchor: string, weekStartsOn = 0): Period => {
    const d = parseISODate(anchor);
    if (kind === 'day') return { kind, from: anchor, to: anchor };
    if (kind === 'week') {
        const back = (d.getDay() - weekStartsOn + 7) % 7;
        const from = addDays(anchor, -back);
        return { kind, from, to: addDays(from, 6) };
    }
    const from = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
    const to = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { kind, from, to };
};

export const shiftPeriod = (p: Period, dir: 1 | -1, weekStartsOn = 0): Period => {
    if (p.kind === 'day') return periodFor('day', addDays(p.from, dir), weekStartsOn);
    if (p.kind === 'week') return periodFor('week', addDays(p.from, 7 * dir), weekStartsOn);
    if (p.kind === 'month') {
        const d = parseISODate(p.from);
        return periodFor('month', toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)), weekStartsOn);
    }
    const len = Math.round((parseISODate(p.to).getTime() - parseISODate(p.from).getTime()) / 86400000) + 1;
    return { kind: 'range', from: addDays(p.from, len * dir), to: addDays(p.to, len * dir) };
};

export const periodLabel = (p: Period): string => {
    const f = parseISODate(p.from);
    const t = parseISODate(p.to);
    const dm = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    if (p.kind === 'day') return f.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (p.kind === 'month') return f.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return `${dm(f)} – ${dm(t)} ${t.getFullYear()}`;
};

interface PeriodControlProps {
    value: Period;
    onChange: (p: Period) => void;
    weekStartsOn?: number;
    /** Disallow moving into the future. */
    noFuture?: boolean;
}

/** One period control for every report (day / week / month / range, prev / next). */
export const PeriodControl: React.FC<PeriodControlProps> = ({ value, onChange, weekStartsOn = 0, noFuture = true }) => {
    const today = toISODate(new Date());
    const next = shiftPeriod(value, 1, weekStartsOn);
    const pick = (k: PeriodKind) => {
        if (k === value.kind) return;
        if (k === 'range') onChange({ kind: 'range', from: value.from, to: value.to });
        else onChange(periodFor(k, value.kind === 'range' ? value.to : value.from, weekStartsOn));
    };
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Segmented
                label="Period"
                size="sm"
                value={value.kind}
                onChange={pick}
                options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'range', label: 'Range' }]}
            />
            {value.kind === 'range' ? (
                <div className="flex items-center gap-2">
                    <div className="w-40"><DatePicker aria-label="From" value={value.from} max={value.to} onChange={v => v && onChange({ ...value, from: v })} /></div>
                    <span className="text-dw-caption font-bold">to</span>
                    <div className="w-40"><DatePicker aria-label="To" value={value.to} min={value.from} max={noFuture ? today : undefined} onChange={v => v && onChange({ ...value, to: v })} /></div>
                </div>
            ) : (
                <div className="flex items-center gap-1">
                    <IconButton icon="chevronLeft" label="Previous period" size="sm" variant="ghost" onClick={() => onChange(shiftPeriod(value, -1, weekStartsOn))} />
                    <span className="min-w-[150px] text-center text-[14px] font-extrabold" aria-live="polite">{periodLabel(value)}</span>
                    <IconButton icon="chevronRight" label="Next period" size="sm" variant="ghost" disabled={noFuture && next.from > today} onClick={() => onChange(next)} />
                </div>
            )}
        </div>
    );
};
