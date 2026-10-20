import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx } from './primitives';
import { Icon } from './Icon';

const PHONE_QUERY = '(max-width: 640px)';
const subscribeMq = (cb: () => void) => {
    const mq = window.matchMedia(PHONE_QUERY);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
};
/** True at phone width (≤ 640 px), where sheets slide up from the bottom. */
export const useIsPhone = (): boolean =>
    useSyncExternalStore(subscribeMq, () => window.matchMedia(PHONE_QUERY).matches, () => false);

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface SheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** Desk width of the dialog. */
    width?: number;
    /** Block closing on backdrop/Escape while saving. */
    dismissable?: boolean;
}

/**
 * Bottom sheet on phones, centred dialog on desk. Replaces the 12 legacy
 * modals: one look, Escape and backdrop close, focus stays inside.
 */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, description, children, footer, width = 480, dismissable = true }) => {
    const phone = useIsPhone();
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);
    const lastFocus = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return undefined;
        lastFocus.current = document.activeElement as HTMLElement | null;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const t = window.setTimeout(() => {
            // Prefer the first control in the body over the header's close button.
            const el = panel.current?.querySelector<HTMLElement>('[autofocus],[data-autofocus]')
                ?? panel.current?.querySelector<HTMLElement>(`[data-sheet-body] :is(${FOCUSABLE})`)
                ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
            (el ?? panel.current)?.focus({ preventScroll: true });
        }, 0);
        return () => {
            window.clearTimeout(t);
            document.body.style.overflow = prevOverflow;
            lastFocus.current?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && dismissable) { e.stopPropagation(); onClose(); }
        if (e.key === 'Tab' && panel.current) {
            const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };

    return createPortal(
        <div className="dw-root !bg-transparent fixed inset-0 z-[90] flex items-end sm:items-center justify-center" onKeyDown={onKeyDown}>
            <div className="dw-anim-fade absolute inset-0 bg-[rgba(31,41,51,.45)]" onClick={() => dismissable && onClose()} aria-hidden="true" />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={phone ? undefined : { width }}
                className={cx(
                    'relative bg-dw-surface flex flex-col max-h-[92vh] shadow-dw-pop focus:outline-none',
                    phone ? 'dw-anim-sheet w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)]' : 'dw-anim-pop max-w-[calc(100vw-32px)] rounded-[20px]',
                )}
            >
                {phone && <span className="mx-auto mt-2 w-10 h-1 rounded-full bg-dw-border" aria-hidden="true" />}
                <header className="flex items-start gap-3 px-5 pt-4 pb-3">
                    <div className="flex-1 min-w-0">
                        <h2 id={titleId} className="m-0 text-[18px] font-extrabold tracking-[-.01em]">{title}</h2>
                        {description && <p className="mt-1 text-[13px] text-dw-caption">{description}</p>}
                    </div>
                    {dismissable && (
                        <button type="button" onClick={onClose} className="w-9 h-9 -mr-2 rounded-lg hover:bg-dw-sunken flex items-center justify-center text-dw-caption" aria-label="Close">
                            <Icon name="x" size={18} />
                        </button>
                    )}
                </header>
                <div data-sheet-body className="px-5 pb-4 overflow-y-auto">{children}</div>
                {footer && <footer className="px-5 py-3 border-t border-dw-line flex gap-2 justify-end">{footer}</footer>}
            </div>
        </div>,
        document.body,
    );
};

interface ConfirmSheetProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    body?: React.ReactNode;
    confirmLabel: string;
    tone?: 'primary' | 'danger';
}

/** Only for money and deletes. Everything else applies at once and offers undo via toast. */
export const ConfirmSheet: React.FC<ConfirmSheetProps> = ({ open, onClose, onConfirm, title, body, confirmLabel, tone = 'primary' }) => {
    const [busy, setBusy] = useState(false);
    const run = async () => {
        setBusy(true);
        try { await onConfirm(); onClose(); } finally { setBusy(false); }
    };
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title={title}
            width={420}
            dismissable={!busy}
            footer={<>
                <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={run} busy={busy}>{confirmLabel}</Button>
            </>}
        >
            {body && <div className="text-[14px] text-dw-body leading-relaxed">{body}</div>}
        </Sheet>
    );
};
