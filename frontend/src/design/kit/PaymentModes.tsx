import React from 'react';
import { Segmented } from './Choice';
import { DatePicker, MoneyInput, formatMoney, roundMoney } from './Inputs';
import { Button, Field, SelectInput, cx } from './primitives';
import { Icon } from './Icon';

export type PaymentValue =
    | { kind: 'single'; mode: string; tendered: number | null }
    | { kind: 'split'; parts: Array<{ mode: string; amount: number | null }> }
    | { kind: 'credit'; dueDate: string | null; paidNow: number | null; mode: string };

export const isCashMode = (mode: string) => /cash/i.test(mode);

/** Returns a message when the payment cannot be submitted, else null. */
export const paymentError = (v: PaymentValue, total: number): string | null => {
    if (v.kind === 'single') {
        if (!v.mode) return 'Pick a payment mode.';
        if (isCashMode(v.mode) && v.tendered != null && roundMoney(v.tendered) < roundMoney(total)) return 'Cash given is less than the total.';
        return null;
    }
    if (v.kind === 'split') {
        if (v.parts.some(p => !p.mode || !p.amount)) return 'Every split line needs a mode and an amount.';
        const sum = roundMoney(v.parts.reduce((a, p) => a + (p.amount || 0), 0));
        if (sum !== roundMoney(total)) return `Split adds up to ${formatMoney(sum)}, total is ${formatMoney(total)}.`;
        return null;
    }
    if (!v.dueDate) return 'Set the date the customer will pay by.';
    if ((v.paidNow || 0) >= total) return 'Paid now covers the total, so this is not a credit sale.';
    return null;
};

interface PaymentModesProps {
    modes: string[];
    total: number;
    value: PaymentValue;
    onChange: (v: PaymentValue) => void;
    allowSplit?: boolean;
    allowCredit?: boolean;
    /** Offer a part payment with a credit sale (POS); repair invoices bill credit in full. */
    creditPaidNow?: boolean;
}

/**
 * Shared by Collect (D6), POS (D9) and POS back office (D10).
 * Default is a button grid of modes; the list only appears for split.
 */
export const PaymentModes: React.FC<PaymentModesProps> = ({ modes, total, value, onChange, allowSplit = true, allowCredit = true, creditPaidNow = true }) => {
    const first = modes[0] ?? 'Cash';
    const kinds = [
        { value: 'single' as const, label: 'Pay now' },
        ...(allowSplit ? [{ value: 'split' as const, label: 'Split' }] : []),
        ...(allowCredit ? [{ value: 'credit' as const, label: 'Credit' }] : []),
    ];
    const switchKind = (k: PaymentValue['kind']) => {
        if (k === value.kind) return;
        if (k === 'single') onChange({ kind: 'single', mode: first, tendered: null });
        if (k === 'split') onChange({ kind: 'split', parts: [{ mode: first, amount: null }, { mode: modes[1] ?? first, amount: null }] });
        if (k === 'credit') onChange({ kind: 'credit', dueDate: null, paidNow: null, mode: first });
    };

    return (
        <div className="flex flex-col gap-4">
            {kinds.length > 1 && <Segmented label="How the customer pays" options={kinds} value={value.kind} onChange={switchKind} />}

            {value.kind === 'single' && (
                <>
                    <div role="radiogroup" aria-label="Payment mode" className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2">
                        {modes.map(m => {
                            const on = value.mode === m;
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => onChange({ ...value, mode: m, tendered: isCashMode(m) ? value.tendered : null })}
                                    className={cx(
                                        'h-12 rounded-dw-control border text-[14px] font-bold flex items-center justify-center gap-2',
                                        on ? 'border-dw-accent bg-dw-accent-soft text-[#1F4B9B] ring-1 ring-dw-accent' : 'border-dw-border-strong bg-dw-surface text-dw-text hover:bg-dw-ground',
                                    )}
                                >
                                    {on && <Icon name="check" size={16} strokeWidth={2.4} />}{m}
                                </button>
                            );
                        })}
                    </div>
                    {isCashMode(value.mode) && (
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <Field label="Cash given" optional>
                                <MoneyInput value={value.tendered} onChange={t => onChange({ ...value, tendered: t })} aria-label="Cash given" />
                            </Field>
                            <div className="h-[42px] rounded-dw-control bg-dw-ground flex items-center justify-between px-3">
                                <span className="text-[13px] font-bold text-dw-caption">Change</span>
                                <span className="text-[16px] font-extrabold tabular-nums text-dw-success">
                                    {value.tendered != null && value.tendered >= total ? formatMoney(roundMoney(value.tendered - total), '') : '—'}
                                </span>
                            </div>
                        </div>
                    )}
                </>
            )}

            {value.kind === 'split' && (() => {
                const sum = roundMoney(value.parts.reduce((a, p) => a + (p.amount || 0), 0));
                const left = roundMoney(total - sum);
                const setPart = (i: number, patch: Partial<{ mode: string; amount: number | null }>) =>
                    onChange({ kind: 'split', parts: value.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
                return (
                    <div className="flex flex-col gap-2">
                        {value.parts.map((p, i) => (
                            <div key={i} className="grid grid-cols-[1fr_140px_auto] gap-2 items-center">
                                <SelectInput aria-label={`Mode ${i + 1}`} value={p.mode} onChange={e => setPart(i, { mode: e.target.value })}>
                                    {modes.map(m => <option key={m} value={m}>{m}</option>)}
                                </SelectInput>
                                <MoneyInput aria-label={`Amount ${i + 1}`} currency="" value={p.amount} onChange={a => setPart(i, { amount: a })} />
                                <button
                                    type="button"
                                    disabled={value.parts.length <= 2}
                                    onClick={() => onChange({ kind: 'split', parts: value.parts.filter((_, j) => j !== i) })}
                                    className="w-9 h-9 rounded-lg text-dw-caption hover:bg-dw-sunken disabled:opacity-30 flex items-center justify-center"
                                    aria-label={`Remove line ${i + 1}`}
                                >
                                    <Icon name="x" size={16} />
                                </button>
                            </div>
                        ))}
                        <div className="flex items-center justify-between">
                            <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange({ kind: 'split', parts: [...value.parts, { mode: first, amount: left > 0 ? left : null }] })}>Add line</Button>
                            <span className={cx('text-[13px] font-bold tabular-nums', left === 0 ? 'text-dw-success' : 'text-dw-warning')}>
                                {left === 0 ? 'Balanced' : left > 0 ? `${formatMoney(left)} left` : `${formatMoney(-left)} over`}
                            </span>
                        </div>
                    </div>
                );
            })()}

            {value.kind === 'credit' && (
                <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Customer pays by">
                        <DatePicker value={value.dueDate} onChange={d => onChange({ ...value, dueDate: d })} quick={[7, 14, 30]} aria-label="Customer pays by" />
                    </Field>
                    {creditPaidNow ? <div className="flex flex-col gap-3">
                        <Field label="Paid now" optional hint={`Balance due ${formatMoney(roundMoney(total - (value.paidNow || 0)))}`}>
                            <MoneyInput value={value.paidNow} max={total} onChange={a => onChange({ ...value, paidNow: a })} aria-label="Paid now" />
                        </Field>
                        {(value.paidNow || 0) > 0 && (
                            <Field label="Paid with">
                                <SelectInput value={value.mode} onChange={e => onChange({ ...value, mode: e.target.value })}>
                                    {modes.map(m => <option key={m} value={m}>{m}</option>)}
                                </SelectInput>
                            </Field>
                        )}
                    </div> : (
                        <p className="m-0 self-center text-[13px] font-semibold text-dw-body">Nothing is taken now. The full {formatMoney(total)} shows as owed until it is paid.</p>
                    )}
                </div>
            )}
        </div>
    );
};
