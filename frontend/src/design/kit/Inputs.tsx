import React, { useEffect, useId, useState } from 'react';
import { cx, inputClass } from './primitives';

export const MONEY_DP = 3;

/** "BHD 1,240.000". Pass currency '' for the bare number. */
export const formatMoney = (amount: number | null | undefined, currency = 'BHD', dp = MONEY_DP): string => {
    const n = Number.isFinite(amount as number) ? (amount as number) : 0;
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return `${n < 0 ? '− ' : ''}${currency ? `${currency} ` : ''}${s}`;
};

/** Round to fils so 0.1 + 0.2 style drift never reaches an invoice. */
export const roundMoney = (n: number, dp = MONEY_DP): number => {
    const f = 10 ** dp;
    return Math.round((n + Number.EPSILON) * f) / f;
};

const parseMoney = (raw: string): number | null => {
    const cleaned = raw.replace(/[^\d.-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
};

interface MoneyInputProps {
    value: number | null;
    onChange: (v: number | null) => void;
    id?: string;
    currency?: string;
    min?: number;
    max?: number;
    placeholder?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    'aria-label'?: string;
    className?: string;
}

/**
 * Amount in BHD with 3 decimals. Typing stays free-form; the value is
 * clamped and shown with 3 dp when the field loses focus.
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
    value, onChange, id, currency = 'BHD', min = 0, max, placeholder = '0.000', disabled, autoFocus, className, ...aria
}) => {
    const [text, setText] = useState(value == null ? '' : value.toFixed(MONEY_DP));
    const [focused, setFocused] = useState(false);
    useEffect(() => {
        if (!focused) setText(value == null ? '' : value.toFixed(MONEY_DP));
    }, [value, focused]);

    return (
        <div className={cx('relative', className)}>
            {currency && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-dw-caption pointer-events-none">{currency}</span>}
            <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                disabled={disabled}
                autoFocus={autoFocus}
                placeholder={placeholder}
                aria-label={aria['aria-label']}
                onFocus={e => { setFocused(true); e.target.select(); }}
                onChange={e => {
                    setText(e.target.value);
                    onChange(parseMoney(e.target.value));
                }}
                onBlur={() => {
                    setFocused(false);
                    let n = parseMoney(text);
                    if (n != null) {
                        if (min != null && n < min) n = min;
                        if (max != null && n > max) n = max;
                        n = roundMoney(n);
                    }
                    onChange(n);
                    setText(n == null ? '' : n.toFixed(MONEY_DP));
                }}
                className={cx(inputClass, 'text-right tabular-nums font-bold', currency && 'pl-14')}
            />
        </div>
    );
};

/** Local calendar date as YYYY-MM-DD, never shifted by the timezone. */
export const toISODate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const parseISODate = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (s: string, n: number): string => {
    const d = parseISODate(s);
    d.setDate(d.getDate() + n);
    return toISODate(d);
};

/** "Tue 21 Oct" */
export const formatDay = (s: string | null | undefined): string => {
    if (!s) return '';
    return parseISODate(s.slice(0, 10)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

interface DatePickerProps {
    value: string | null;
    onChange: (v: string | null) => void;
    id?: string;
    min?: string;
    max?: string;
    /** Quick picks in days from today, e.g. [0, 3, 7]. */
    quick?: number[];
    disabled?: boolean;
    'aria-label'?: string;
}

/** Native date input (phone date wheels for free) plus optional quick picks. */
export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, id, min, max, quick, disabled, ...aria }) => {
    const autoId = useId();
    const today = toISODate(new Date());
    return (
        <div className="flex flex-col gap-2">
            <input
                id={id ?? autoId}
                type="date"
                value={value ?? ''}
                min={min}
                max={max}
                disabled={disabled}
                aria-label={aria['aria-label']}
                onChange={e => onChange(e.target.value || null)}
                className={cx(inputClass, 'font-semibold')}
            />
            {quick && quick.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {quick.map(n => {
                        const v = addDays(today, n);
                        const on = v === value;
                        return (
                            <button
                                key={n}
                                type="button"
                                disabled={disabled}
                                aria-pressed={on}
                                onClick={() => onChange(v)}
                                className={cx('h-8 px-3 rounded-full border text-[12px] font-bold', on ? 'bg-dw-text text-white border-dw-text' : 'bg-dw-surface border-dw-border-strong text-dw-text hover:bg-dw-ground')}
                            >
                                {n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `+${n} days`}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
