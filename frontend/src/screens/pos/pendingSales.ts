/**
 * Sales whose Charge request was cut off by the network (spec Phase 5,
 * "offline retry for POS"). Each keeps the client reference it was first
 * sent with, so retrying can never charge twice: the server returns the
 * invoice it already made for that reference.
 *
 * Kept in localStorage on this till only. If the browser blocks storage,
 * the queue lives in memory for the session.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tillCharge, type ChargeInput, type ChargeResult } from '../../services/tillApi';

export interface PendingSale {
    ref: string;
    input: ChargeInput;
    total: number;
    customer: string;
    at: string;
    /** Last refusal from the server; the sale then waits for the cashier. */
    error?: string;
}

const KEY = 'dw.till.pending.v1';
let memory: PendingSale[] = [];

const read = (): PendingSale[] => {
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]') as PendingSale[]; } catch { return memory; }
};
const write = (list: PendingSale[]) => {
    memory = list;
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* memory only */ }
};

/** A network failure (no response at all), as opposed to the server saying no. */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message));

export const newRef = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const usePendingSales = (onSent: (r: ChargeResult, p: PendingSale) => void, onRefused: (p: PendingSale) => void) => {
    const [pending, setPending] = useState<PendingSale[]>(read);
    const busy = useRef(false);

    const update = (fn: (l: PendingSale[]) => PendingSale[]) => setPending(cur => { const next = fn(cur); write(next); return next; });

    const add = useCallback((p: PendingSale) => update(l => [...l.filter(x => x.ref !== p.ref), p]), []);
    const remove = useCallback((ref: string) => update(l => l.filter(x => x.ref !== ref)), []);

    const retryAll = useCallback(async () => {
        if (busy.current || !navigator.onLine) return;
        busy.current = true;
        try {
            for (const p of read().filter(x => !x.error)) {
                try {
                    const r = await tillCharge({ ...p.input, clientRef: p.ref });
                    remove(p.ref);
                    onSent(r, p);
                } catch (e) {
                    if (isNetworkError(e)) break; // still offline; try later
                    const refused = { ...p, error: e instanceof Error ? e.message : 'Refused by the server.' };
                    update(l => l.map(x => (x.ref === p.ref ? refused : x)));
                    onRefused(refused);
                }
            }
        } finally {
            busy.current = false;
        }
    }, [onSent, onRefused, remove]);

    useEffect(() => {
        void retryAll();
        const t = window.setInterval(() => void retryAll(), 20000);
        const online = () => void retryAll();
        window.addEventListener('online', online);
        return () => { window.clearInterval(t); window.removeEventListener('online', online); };
    }, [retryAll]);

    return { pending, add, remove, retryAll };
};
