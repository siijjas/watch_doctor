import React, { useEffect, useRef, useState } from 'react';
import { cx, inputClass } from './primitives';
import { Icon } from './Icon';

/**
 * Normalise what staff type: phone numbers lose spaces, dashes and the
 * Bahrain +973 / 00973 prefix so "3355 1234" finds "+97333551234".
 * Text queries are only trimmed.
 */
export const normaliseQuery = (raw: string): string => {
    const q = raw.trim();
    const digits = q.replace(/[\s\-().]/g, '');
    if (/^\+?\d{4,}$/.test(digits)) {
        return digits.replace(/^\+?(00)?973/, '');
    }
    return q;
};

interface SearchFieldProps {
    value: string;
    /** Called on every keystroke with the raw text (keeps the input controlled). */
    onChange: (raw: string) => void;
    /** Called after `delay` ms of no typing, with the normalised query. */
    onSearch?: (query: string) => void;
    placeholder?: string;
    label?: string;
    delay?: number;
    autoFocus?: boolean;
    /** Show a scan button (phone screens). */
    onScan?: () => void;
    size?: 'md' | 'lg';
    className?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
    value, onChange, onSearch, placeholder = 'Order no, name, phone or watch', label = 'Search',
    delay = 300, autoFocus, onScan, size = 'md', className,
}) => {
    const [debounced, setDebounced] = useState(value);
    const first = useRef(true);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(t);
    }, [value, delay]);
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        onSearch?.(normaliseQuery(debounced));
        // onSearch identity is not a reason to search again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounced]);

    return (
        <div className={cx('relative flex items-center', className)} role="search">
            <Icon name="search" size={18} className="absolute left-3.5 text-dw-caption pointer-events-none" />
            <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                aria-label={label}
                value={value}
                autoFocus={autoFocus}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Escape' && value) { e.preventDefault(); onChange(''); }
                    if (e.key === 'Enter') onSearch?.(normaliseQuery(value));
                }}
                className={cx(inputClass, 'pl-10 [&::-webkit-search-cancel-button]:hidden', size === 'lg' && 'h-12 text-base', (value || onScan) && 'pr-20')}
            />
            <div className="absolute right-1.5 flex items-center gap-1">
                {value && (
                    <button type="button" onClick={() => onChange('')} className="w-8 h-8 rounded-lg text-dw-caption hover:bg-dw-sunken flex items-center justify-center" aria-label="Clear search">
                        <Icon name="x" size={16} />
                    </button>
                )}
                {onScan && (
                    <button type="button" onClick={onScan} className="w-9 h-9 rounded-lg text-dw-text hover:bg-dw-sunken flex items-center justify-center" aria-label="Scan bag label">
                        <Icon name="scan" size={18} />
                    </button>
                )}
            </div>
        </div>
    );
};
