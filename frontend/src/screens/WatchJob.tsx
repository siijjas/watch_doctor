/**
 * Watch job (canvas M3): one watch on the technician's phone. Read the
 * complaint and photos, enter the diagnosis (saves as you tap), tick tasks,
 * add parts, ask the desk for a part. No stage control: the desk owns stages,
 * ticks and the diagnosis move them through the backend rules.
 */
import React, { useEffect, useRef, useState } from 'react';
import { goBack, navigate, path as buildPath } from '../router';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import { Button, Card, EmptyState, IconButton, Spinner, StageStrip, WatchStageBadges, cx, formatDay, useToast } from '../design/kit';
import * as apiService from '../services/apiService';
import { useOrder, watchPrice, watchStage, watchTitle } from './order/useOrder';
import { DiagnosisEditor, diagnosisOf, diagnosisPayload, sameDiagnosis, type DiagnosisValue } from './order/DiagnosisEditor';
import { IssuesSection, NoteSection, PartsHold, PartsSection, PhotosSection, SubHead, TasksSection } from './order/sections';
import type { StageId } from '../design/stages';

const LOCK: Partial<Record<StageId, string>> = {
    received: 'Tasks open once the customer approves the estimate.',
    diagnosing: 'Tasks open once the customer approves the estimate.',
    estimate: 'The desk is sending the estimate. Tasks open once the customer approves.',
    customer: 'Waiting for the customer to approve the estimate.',
    return: 'This watch is going back to the customer unrepaired.',
    collected: 'This watch has been collected.',
};

const FOOTER: Record<StageId, string> = {
    received: 'Waiting for the desk to assign it.',
    diagnosing: 'Enter what you found and the work needed. The desk then sends the estimate.',
    estimate: 'Diagnosis done. The desk will send the estimate.',
    customer: 'Waiting for the customer.',
    repair: 'Tick each task when it is done. The last tick moves the watch to Ready.',
    ready: 'All done. The front desk will tell the customer.',
    return: 'The front desk will return the watch.',
    collected: 'Collected.',
};

const WatchJob: React.FC<{ orderName: string; itemName: string }> = ({ orderName, itemName }) => {
    const { hasRole } = useAuth();
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const desk = hasRole('executive', 'data_entry');
    const { data, error, busy, refresh, run } = useOrder(orderName);
    const item = data?.order.items.find(i => i.name === itemName);

    // Diagnosis saves as you tap: keep a local copy, push it after a short pause.
    const [diag, setDiag] = useState<DiagnosisValue | null>(null);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const timer = useRef<number | undefined>(undefined);
    const loadedFor = useRef<string | null>(null);
    useEffect(() => {
        if (item && loadedFor.current !== item.name) {
            loadedFor.current = item.name || null;
            setDiag(diagnosisOf(item));
        }
    }, [item]);

    const saveDiag = async (v: DiagnosisValue) => {
        if (!item) return;
        setSaveState('saving');
        try {
            await apiService.updateRepairItemDiagnosis(item.name!, diagnosisPayload(v, item));
            await refresh();
            setSaveState('saved');
        } catch (e) {
            setSaveState('error');
            toast.error(e instanceof Error ? e.message : 'The diagnosis did not save.');
        }
    };

    const changeDiag = (v: DiagnosisValue) => {
        setDiag(v);
        setSaveState('idle');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void saveDiag(v), 900);
    };
    useEffect(() => () => window.clearTimeout(timer.current), []);

    if (error && !data) {
        return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="alert" title="Could not open this watch" body={error} action={<Button onClick={() => navigate('/bench', { replace: true })}>Back to my bench</Button>} /></Card>;
    }
    if (!data || !diag) return <div className="flex justify-center py-16 text-dw-caption"><Spinner size={28} /></div>;
    if (!item) {
        return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="watch" title="This watch is not on the order any more" action={<Button onClick={() => navigate(buildPath('orders', orderName), { replace: true })}>Open the order</Button>} /></Card>;
    }

    const { order, ctx } = data;
    const { stage, waitingParts } = watchStage(item, order);
    const editable = order.docstatus === 0 && stage !== 'collected';
    const lock = desk ? undefined : LOCK[stage];
    const title = watchTitle(item, ctx.models);
    const pendingSave = saveState === 'saving' || (diag && !sameDiagnosis(diag, diagnosisOf(item)) && saveState !== 'error');

    return (
        <div className="max-w-[720px] mx-auto pb-20">
            <div className="flex items-start gap-3">
                <IconButton icon="chevronLeft" label="Back" onClick={() => goBack('/bench')} />
                <div className="flex-1 min-w-0">
                    <h1 className="m-0 text-[20px] font-extrabold leading-tight truncate">{title}</h1>
                    <p className="m-0 text-[12px] font-semibold text-dw-caption">
                        {[order.name, order.reference_number && `tag ${order.reference_number}`, item.serial_number && `S/N ${item.serial_number}`, order.promised_delivery_date && `due ${formatDay(order.promised_delivery_date)}`].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <WatchStageBadges stage={stage} waitingParts={waitingParts} />
            </div>

            <Card className="mt-4">
                <StageStrip stage={stage} compact />
                <p className="m-0 mt-3 text-[12px] font-semibold text-dw-caption">
                    {order.quotation_amount && (stage === 'repair' || stage === 'ready') ? `Approved ${formatCurrency(order.quotation_amount)} · ` : ''}
                    The front desk changes the stage; your ticks and diagnosis move it on automatically.
                </p>
            </Card>

            <div className="mt-5 flex flex-col gap-5">
                <IssuesSection item={item} run={run} canEdit={false} />
                <PhotosSection item={item} run={run} canEdit={editable} title="Photos" />
            </div>

            <section className="mt-5">
                <SubHead
                    title="Diagnosis"
                    action={<span className={cx('text-[12px] font-bold', saveState === 'error' ? 'text-dw-danger' : 'text-dw-caption')} aria-live="polite">
                        {saveState === 'error' ? 'Not saved' : pendingSave ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Saves as you tap'}
                    </span>}
                />
                <Card>
                    {editable
                        ? <DiagnosisEditor value={diag} onChange={changeDiag} canMarkNotRepairable={stage !== 'return'} />
                        : <p className="m-0 text-[13px] text-dw-caption">This order is closed.</p>}
                </Card>
            </section>

            <Card className="mt-5 flex flex-col gap-5">
                <TasksSection item={item} ctx={ctx} run={run} busy={busy} desk={desk} lockedReason={editable ? lock : LOCK.collected} large />
                <PartsSection item={item} ctx={ctx} run={run} busy={busy} />
                {editable && stage !== 'ready' && stage !== 'return' && <PartsHold item={item} run={run} busy={busy} desk={desk} />}
                <NoteSection item={item} run={run} busy={busy} title="Note for the desk · staff only" />
            </Card>

            <div className="fixed bottom-[68px] lg:bottom-0 inset-x-0 lg:left-[232px] z-20 bg-[rgba(255,255,255,.96)] backdrop-blur border-t border-dw-border">
                <div className="max-w-[720px] mx-auto px-4 py-2.5 flex items-center gap-3">
                    <p className="m-0 flex-1 text-[12px] font-semibold text-dw-body">
                        {FOOTER[stage]}
                        {(item.tasks || []).length > 0 && <span className="text-dw-caption"> · {formatCurrency(watchPrice(item, ctx))}</span>}
                    </p>
                    <Button size="sm" onClick={() => navigate('/bench')}>Bench</Button>
                </div>
            </div>
        </div>
    );
};

export default WatchJob;
