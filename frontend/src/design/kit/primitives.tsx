import React from 'react';
import { Icon, type IconName } from './Icon';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
    primary: 'bg-dw-accent text-white border-dw-accent hover:bg-dw-accent-hover hover:border-dw-accent-hover',
    secondary: 'bg-dw-surface text-dw-text border-dw-border-strong hover:bg-dw-ground',
    ghost: 'bg-transparent text-dw-text border-transparent hover:bg-dw-sunken',
    danger: 'bg-dw-surface text-dw-danger border-dw-border-strong hover:bg-dw-danger-soft',
    success: 'bg-dw-success text-white border-dw-success hover:opacity-90',
};
// sm 36px for dense tables, md 42px desk target, lg 44px phone target.
const SIZE: Record<ButtonSize, string> = {
    sm: 'h-9 px-3 text-[13px] rounded-[10px]',
    md: 'h-[42px] px-4 text-sm rounded-dw-control',
    lg: 'h-11 px-5 text-[15px] rounded-dw-control',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconName;
    busy?: boolean;
    block?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'secondary', size = 'md', icon, busy, block, className, children, disabled, type = 'button', ...rest }, ref) => (
        <button
            ref={ref}
            type={type}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            className={cx(
                'inline-flex items-center justify-center gap-2 border font-bold whitespace-nowrap transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                VARIANT[variant], SIZE[size], block && 'w-full', className,
            )}
            {...rest}
        >
            {busy ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
            {children}
        </button>
    ),
);
Button.displayName = 'Button';

export const IconButton: React.FC<Omit<ButtonProps, 'children' | 'icon'> & { icon: IconName; label: string }> = ({
    icon, label, size = 'md', className, ...rest
}) => (
    <Button {...rest} size={size} aria-label={label} title={label} className={cx('!px-0', size === 'sm' ? 'w-9' : size === 'lg' ? 'w-11' : 'w-[42px]', className)}>
        <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </Button>
);

export const Spinner: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
);

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { pad?: boolean }> = ({ pad = true, className, ...rest }) => (
    <div className={cx('bg-dw-surface border border-dw-border rounded-dw-card', pad && 'p-4', className)} {...rest} />
);

export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cx('text-xs font-extrabold tracking-[.06em] uppercase text-dw-caption', className)}>{children}</div>
);

interface FieldProps {
    label: string;
    htmlFor?: string;
    hint?: string;
    error?: string | null;
    optional?: boolean;
    children: React.ReactNode;
    className?: string;
}

/** Label + control + hint/error, the only form layout used in v2. */
export const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, error, optional, children, className }) => {
    // A single input child gets an id so the label is tied to it without callers passing one.
    const autoId = React.useId();
    const only = React.Children.count(children) === 1 && React.isValidElement(children) ? (children as React.ReactElement<{ id?: string }>) : null;
    const childId = only?.props.id;
    const target = htmlFor ?? (only ? childId ?? autoId : undefined);
    const body = only && !childId && !htmlFor ? React.cloneElement(only, { id: autoId }) : children;
    return (
    <div className={cx('flex flex-col gap-1.5', className)}>
        <label htmlFor={target} className="text-[13px] font-bold text-dw-text">
            {label}{optional && <span className="font-semibold text-dw-caption"> · optional</span>}
        </label>
        {body}
        {error
            ? <p className="text-[12px] font-semibold text-dw-danger" role="alert">{error}</p>
            : hint ? <p className="text-[12px] text-dw-caption">{hint}</p> : null}
    </div>
    );
};

export const inputClass = cx(
    'w-full h-[42px] px-3 rounded-dw-control border border-dw-border-strong bg-dw-surface',
    'text-[15px] text-dw-text placeholder:text-dw-caption',
    'focus:outline-none focus:border-dw-accent focus:ring-2 focus:ring-[var(--dw-focus)]',
    'disabled:bg-dw-ground disabled:text-dw-caption',
);

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    ({ className, ...rest }, ref) => <input ref={ref} className={cx(inputClass, className)} {...rest} />,
);
TextInput.displayName = 'TextInput';

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className, rows = 3, ...rest }, ref) => (
        <textarea ref={ref} rows={rows} className={cx(inputClass, 'h-auto py-2.5 leading-snug', className)} {...rest} />
    ),
);
TextArea.displayName = 'TextArea';

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className, children, ...rest }, ref) => (
        <select ref={ref} className={cx(inputClass, 'pr-8 font-semibold', className)} {...rest}>{children}</select>
    ),
);
SelectInput.displayName = 'SelectInput';

/** Empty states say what is missing and what to do, never just "No data". */
export const EmptyState: React.FC<{ icon?: IconName; title: string; body?: string; action?: React.ReactNode }> = ({ icon = 'info', title, body, action }) => (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-6">
        <span className="w-12 h-12 rounded-2xl bg-dw-sunken text-dw-caption flex items-center justify-center"><Icon name={icon} size={22} /></span>
        <p className="text-[15px] font-extrabold text-dw-text">{title}</p>
        {body && <p className="text-sm text-dw-caption max-w-sm">{body}</p>}
        {action && <div className="mt-2">{action}</div>}
    </div>
);
