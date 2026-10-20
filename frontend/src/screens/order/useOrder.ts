import { useCallback, useEffect, useRef, useState } from 'react';
import type { RepairItem, RepairOrder } from '../../types';
import * as apiService from '../../services/apiService';
import { getOrderContext, type OrderContext } from '../../services/deskApi';
import { useToast } from '../../design/kit';
import { stageOfWatch, type WatchStage } from '../../design/stages';

/** Server messages can carry HTML and permission jargon; say it plainly. */
const readableError = (e: unknown): string => {
    const raw = e instanceof Error ? e.message : '';
    if (/permission|not have access|not permitted/i.test(raw)) return 'You do not have access to this order.';
    if (/not found|does not exist/i.test(raw)) return 'This order does not exist.';
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || 'Could not open this order.';
};

export interface OrderData {
    order: RepairOrder;
    ctx: OrderContext;
}

/**
 * Loads an order with its page context and runs one-watch edits: each edit
 * calls a narrow endpoint, then the order is read again, so the screen always
 * shows what the server's rules made of it.
 */
export const useOrder = (name: string) => {
    const toast = useToast();
    const [data, setData] = useState<OrderData | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const req = useRef(0);

    const refresh = useCallback(async () => {
        const id = ++req.current;
        try {
            const [order, ctx] = await Promise.all([apiService.getRepairOrder(name), getOrderContext(name)]);
            if (id === req.current) {
                setData({ order, ctx });
                setError('');
            }
        } catch (e) {
            if (id === req.current) setError(readableError(e));
        }
    }, [name]);

    useEffect(() => {
        setData(null);
        setError('');
        void refresh();
    }, [refresh]);

    /** Run an edit; `key` marks which control shows a spinner. Re-throws so sheets stay open on failure. */
    const run = useCallback(async (key: string, fn: () => Promise<unknown>, success?: string) => {
        setBusy(key);
        try {
            await fn();
            await refresh();
            if (success) toast.success(success);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'That did not save. Try again.');
            throw e;
        } finally {
            setBusy(null);
        }
    }, [refresh, toast]);

    return { data, error, busy, refresh, run };
};

export const watchStage = (item: RepairItem, order: RepairOrder): WatchStage =>
    stageOfWatch(item, order.docstatus);

export const watchTitle = (item: Pick<RepairItem, 'watch_brand' | 'watch_model'>, models?: Record<string, string>) => {
    const model = item.watch_model ? (models?.[item.watch_model] ?? item.watch_model) : '';
    return [item.watch_brand, model].filter(Boolean).join(' ') || 'Watch';
};

export const taskName = (service: string, ctx: OrderContext) =>
    ctx.task_templates.find(t => t.name === service)?.task_name || service;

export const taskPrice = (task: { service: string; rate?: number }, ctx: OrderContext) =>
    Number(task.rate) || ctx.task_templates.find(t => t.name === task.service)?.default_rate || 0;

export const partPrice = (part: { part: string; rate?: number; quantity: number }, ctx: OrderContext) =>
    (Number(part.rate) || ctx.parts[part.part]?.standard_rate || 0) * (Number(part.quantity) || 0);

export const watchPrice = (item: RepairItem, ctx: OrderContext) =>
    (item.tasks || []).reduce((s, t) => s + taskPrice(t, ctx), 0)
    + (item.parts_used || []).reduce((s, p) => s + partPrice(p, ctx), 0);

/** Days since the watch last changed stage. */
export const daysInStage = (item: RepairItem & { status_changed_on?: string }) => {
    if (!item.status_changed_on) return null;
    const then = new Date(item.status_changed_on.replace(' ', 'T'));
    if (Number.isNaN(then.getTime())) return null;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t = new Date(then); t.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((start.getTime() - t.getTime()) / 86400000));
};
