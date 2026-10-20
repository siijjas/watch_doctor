import React, { useId } from 'react';
import { cx } from './primitives';
import { Icon } from './Icon';

export interface ChoiceOption<T extends string> {
    value: T;
    label: string;
    count?: number;
}

type ChipsProps<T extends string> = {
    options: ChoiceOption<T>[];
    label: string;
    className?: string;
} & (
    | { multiple: true; value: T[]; onChange: (v: T[]) => void }
    | { multiple?: false; value: T | null; onChange: (v: T | null) => void; allowNone?: boolean }
);

/** Chips for complaints, conditions and filters. Wraps; never scrolls sideways. */
export function Chips<T extends string>(props: ChipsProps<T>) {
    const { options, label, className } = props;
    const isOn = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
    const toggle = (v: T) => {
        if (props.multiple === true) {
            const cur = props.value;
            props.onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
            return;
        }
        const single = props as { value: T | null; onChange: (v: T | null) => void; allowNone?: boolean };
        single.onChange(single.value === v && single.allowNone ? null : v);
    };
    return (
        <div role="group" aria-label={label} className={cx('flex flex-wrap gap-2', className)}>
            {options.map(o => {
                const on = isOn(o.value);
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(o.value)}
                        className={cx(
                            'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-bold transition-colors',
                            on ? 'bg-dw-text border-dw-text text-white' : 'bg-dw-surface border-dw-border-strong text-dw-text hover:bg-dw-ground',
                        )}
                    >
                        {on && props.multiple && <Icon name="check" size={14} strokeWidth={2.4} />}
                        {o.label}
                        {typeof o.count === 'number' && (
                            <span className={cx('text-[12px] font-extrabold', on ? 'text-white/80' : 'text-dw-caption')}>{o.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

interface SegmentedProps<T extends string> {
    options: ChoiceOption<T>[];
    value: T;
    onChange: (v: T) => void;
    label: string;
    size?: 'sm' | 'md';
    className?: string;
}

/** 2–4 mutually exclusive options: priority, period, view. */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', className }: SegmentedProps<T>) {
    return (
        <div role="radiogroup" aria-label={label} className={cx('flex gap-1 p-1 bg-dw-sunken rounded-[14px] max-w-full overflow-x-auto', className)}>
            {options.map(o => {
                const on = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(o.value)}
                        className={cx(
                            'flex-1 rounded-[10px] font-bold whitespace-nowrap px-2.5 sm:px-3 transition-colors',
                            size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-[14px]',
                            on ? 'bg-dw-surface text-dw-text shadow-[0_1px_2px_rgba(31,41,51,.08)]' : 'text-dw-caption hover:text-dw-text',
                        )}
                    >
                        {o.label}
                        {typeof o.count === 'number' && <span className="ml-1.5 text-dw-caption">{o.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

interface ToggleProps {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
    disabled?: boolean;
    /** Hide the visible label (still announced) when a row already names it. */
    hideLabel?: boolean;
}

/** Booleans are toggles, never checkboxes (house rule). */
export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label, description, disabled, hideLabel }) => {
    const id = useId();
    return (
        <div className={cx('flex items-center gap-3', disabled && 'opacity-50')}>
            {!hideLabel && (
                <label htmlFor={id} className="flex-1 min-w-0 cursor-pointer">
                    <span className="block text-[14px] font-bold text-dw-text">{label}</span>
                    {description && <span className="block text-[12px] text-dw-caption">{description}</span>}
                </label>
            )}
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={hideLabel ? label : undefined}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-dw-accent' : 'bg-[#CFC8BD]')}
            >
                <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
            </button>
        </div>
    );
};
