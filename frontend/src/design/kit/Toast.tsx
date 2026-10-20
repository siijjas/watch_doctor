import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './primitives';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
    message: string;
    tone?: ToastTone;
    /** e.g. { label: 'Undo', onClick } — keeps one-tap actions reversible. */
    action?: { label: string; onClick: () => void };
    /** ms; errors stay until dismissed when 0. */
    duration?: number;
}

interface ToastItem extends Required<Pick<ToastInput, 'message' | 'tone'>> {
    id: number;
    action?: ToastInput['action'];
}

interface ToastApi {
    show: (t: ToastInput | string) => void;
    success: (message: string) => void;
    error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON: Record<ToastTone, IconName> = { success: 'check', error: 'alert', info: 'info' };
const TONE: Record<ToastTone, string> = {
    success: 'text-[#7FD9A3]',
    error: 'text-[#FF9C9C]',
    info: 'text-[#A9C3F2]',
};

/**
 * One global toast stack replacing the 61 `alert()` calls. Bottom-centre on
 * phones (above the tab bar), bottom-right on desk. Announced politely;
 * errors assertively.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<ToastItem[]>([]);
    const seq = useRef(0);

    const dismiss = useCallback((id: number) => setItems(list => list.filter(t => t.id !== id)), []);

    const show = useCallback((input: ToastInput | string) => {
        const t: ToastInput = typeof input === 'string' ? { message: input } : input;
        const tone = t.tone ?? 'success';
        const id = ++seq.current;
        setItems(list => [...list.slice(-2), { id, message: t.message, tone, action: t.action }]);
        const duration = t.duration ?? (tone === 'error' ? 6000 : t.action ? 6000 : 3500);
        if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    }, [dismiss]);

    const api = useMemo<ToastApi>(() => ({
        show,
        success: (message: string) => show({ message, tone: 'success' }),
        error: (message: string) => show({ message, tone: 'error' }),
    }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {createPortal(
                <div className="dw-root !bg-transparent fixed z-[100] inset-x-4 bottom-[84px] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[380px] flex flex-col gap-2 pointer-events-none">
                    {items.map(t => (
                        <div
                            key={t.id}
                            role={t.tone === 'error' ? 'alert' : 'status'}
                            aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
                            className="dw-anim-pop pointer-events-auto flex items-center gap-3 rounded-[14px] bg-[#1F2933] text-white pl-4 pr-2 py-2.5 shadow-dw-pop"
                        >
                            <Icon name={ICON[t.tone]} size={18} strokeWidth={2.2} className={cx('shrink-0', TONE[t.tone])} />
                            <p className="flex-1 m-0 text-[14px] font-semibold leading-snug">{t.message}</p>
                            {t.action && (
                                <button
                                    type="button"
                                    onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                                    className="h-8 px-3 rounded-lg text-[13px] font-extrabold text-[#A9C3F2] hover:bg-white/10"
                                >
                                    {t.action.label}
                                </button>
                            )}
                            <button type="button" onClick={() => dismiss(t.id)} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/70" aria-label="Dismiss">
                                <Icon name="x" size={16} />
                            </button>
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastApi => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
};
