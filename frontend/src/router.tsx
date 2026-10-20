/**
 * Minimal URL router for the SPA (spec B3).
 *
 * Production serves the app from Frappe's `/repair` page, with a website
 * route rule sending `/repair/<anything>` to the same page. The Vite dev
 * server serves it from `/`. Paths inside the app never include the base.
 */
import React, { useSyncExternalStore } from 'react';

const APP_BASE = '/repair';

export const BASE: string = typeof window !== 'undefined'
    && (window.location.pathname === APP_BASE || window.location.pathname.startsWith(`${APP_BASE}/`))
    ? APP_BASE
    : '';

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', emit);
}

const subscribe = (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

const readPath = (): string => {
    let p = window.location.pathname;
    if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
};

/** Full URL string, so the snapshot is stable between renders. */
const snapshot = () => `${readPath()}${window.location.search}`;

export const href = (to: string): string => `${BASE}${to.startsWith('/') ? to : `/${to}`}`;

interface NavState { dwIdx: number }

const currentIdx = (): number => {
    const st = window.history.state as NavState | null;
    return st && typeof st.dwIdx === 'number' ? st.dwIdx : 0;
};

export const navigate = (to: string, opts: { replace?: boolean } = {}): void => {
    const url = href(to);
    if (`${window.location.pathname}${window.location.search}` === url && !opts.replace) return;
    if (opts.replace) {
        window.history.replaceState({ dwIdx: currentIdx() } satisfies NavState, '', url);
    } else {
        window.history.pushState({ dwIdx: currentIdx() + 1 } satisfies NavState, '', url);
    }
    emit();
};

/** True when the previous history entry is a screen of this app. */
export const canGoBack = (): boolean => currentIdx() > 0;

/** Back within the app, or to `fallback` when the page was opened directly. */
export const goBack = (fallback: string): void => {
    if (canGoBack()) window.history.back();
    else navigate(fallback, { replace: true });
};

export interface Location {
    path: string;
    query: URLSearchParams;
}

export const useLocation = (): Location => {
    const snap = useSyncExternalStore(subscribe, snapshot, snapshot);
    const qi = snap.indexOf('?');
    return {
        path: qi === -1 ? snap : snap.slice(0, qi),
        query: new URLSearchParams(qi === -1 ? '' : snap.slice(qi)),
    };
};

/**
 * Match `/orders/:name` style patterns. Returns decoded params, or null.
 * A trailing `/*` matches any remaining segments, exposed as `rest`.
 */
export const matchPath = (pattern: string, path: string): Record<string, string> | null => {
    const pp = pattern.split('/').filter(Boolean);
    const sp = path.split('/').filter(Boolean);
    const params: Record<string, string> = {};
    for (let i = 0; i < pp.length; i += 1) {
        const seg = pp[i];
        if (seg === '*') {
            params.rest = sp.slice(i).map(decodeURIComponent).join('/');
            return params;
        }
        if (i >= sp.length) return null;
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(sp[i]);
        else if (seg !== sp[i]) return null;
    }
    return pp.length === sp.length ? params : null;
};

/** Build a path with encoded segments: path('orders', name) → /orders/RO%2F1 */
export const path = (...segments: Array<string | number>): string =>
    `/${segments.map(s => encodeURIComponent(String(s))).join('/')}`;

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    to: string;
    replace?: boolean;
};

/** Anchor that navigates in-app but still opens a real URL on ctrl/cmd/middle click. */
export const Link: React.FC<LinkProps> = ({ to, replace, onClick, target, children, ...rest }) => (
    <a
        {...rest}
        href={href(to)}
        target={target}
        onClick={e => {
            onClick?.(e);
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (target && target !== '_self') return;
            e.preventDefault();
            navigate(to, { replace });
        }}
    >
        {children}
    </a>
);
