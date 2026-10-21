import React, { useEffect, useState } from 'react';
import type { RepairItem, RepairOrder } from '../../types';
import type { OrderContext } from '../../services/deskApi';
import * as apiService from '../../services/apiService';
import {
    Button, Card, Icon, Sheet, StageSelect, StageStrip, WatchStageBadges, cx, formatDay, type StageChange,
} from '../../design/kit';
import { STAGE_BY_ID } from '../../design/stages';
import { DiagnosisEditor, diagnosisOf, diagnosisPayload, sameDiagnosis, type DiagnosisValue } from './DiagnosisEditor';
import { IssuesSection, LinkButton, NoteSection, PartsHold, PartsSection, PhotosSection, SubHead, TasksSection } from './sections';
import { daysInStage, watchPrice, watchStage, watchTitle } from './useOrder';

type Run = (key: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

export interface WatchActions {
    onStage: (item: RepairItem, change: StageChange) => Promise<void>;
    onAssign: (item: RepairItem) => void;
    onEstimate: (item: RepairItem) => void;
    onAnswer: (item: RepairItem) => void;
    onCollect: (item: RepairItem) => void;
    onEdit: (item: RepairItem) => void;
}

interface WatchCardProps {
    item: RepairItem;
    index: number;
    count: number;
    order: RepairOrder;
    ctx: OrderContext;
    run: Run;
    busy: string | null;
    actions: WatchActions;
    money: (n: number) => string;
}

export const specLine = (item: RepairItem) =>
    [item.serial_number && `S/N ${item.serial_number}`, item.watch_type, item.case_type, item.strap_bracelet, item.dial].filter(Boolean).join(' · ');

const techName = (id: string | undefined | null, ctx: OrderContext) =>
    id ? ctx.technicians.find(t => t.name === id)?.technician_name || id : null;

export const DiagnosisRead: React.FC<{ item: RepairItem; ctx: OrderContext; onEdit?: () => void }> = ({ item, ctx, onEdit }) => {
    const by = techName(item.diagnosed_by, ctx);
    const movement = [...(item.movement_type || []), ...(item.movement_caliber || [])].join(' · ');
    const has = movement || item.diagnosis_summary?.length || item.recommended_work?.length;
    return (
        <section>
            <SubHead
                title={`Diagnosis${by ? ` · ${by}` : ''}${item.diagnosis_date ? `, ${formatDay(item.diagnosis_date)}` : ''}`}
                action={onEdit && <LinkButton onClick={onEdit}>{has ? 'Edit' : <><Icon name="plus" size={14} />Add</>}</LinkButton>}
            />
            {!has ? (
                <p className="m-0 text-[13px] text-dw-caption">Not diagnosed yet.</p>
            ) : (
                <div className="text-[14px] leading-relaxed">
                    {movement && <strong className="font-extrabold">{movement}. </strong>}
                    {item.diagnosis_summary?.join(', ')}
                    {item.recommended_work?.length ? <div className="text-dw-body">Work needed: {item.recommended_work.join(', ')}</div> : null}
                </div>
            )}
        </section>
    );
};

export const DiagnosisSheet: React.FC<{ open: boolean; onClose: () => void; item: RepairItem; run: Run; title: string }> = ({ open, onClose, item, run, title }) => {
    const [value, setValue] = useState<DiagnosisValue>(() => diagnosisOf(item));
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setValue(diagnosisOf(item)); }, [open, item]);
    const dirty = !sameDiagnosis(value, diagnosisOf(item));
    const save = async () => {
        setBusy(true);
        try {
            await run(`diag:${item.name}`, () => apiService.updateRepairItemDiagnosis(item.name!, diagnosisPayload(value, item)), 'Diagnosis saved');
            onClose();
        } catch { /* toast shown */ } finally {
            setBusy(false);
        }
    };
    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Diagnosis"
            description={title}
            width={620}
            dismissable={!busy}
            footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!dirty} onClick={() => void save()}>Save diagnosis</Button></>}
        >
            <DiagnosisEditor value={value} onChange={setValue} />
        </Sheet>
    );
};

/** One watch on the desk order page (canvas D4 / M5). */
export const WatchCard: React.FC<WatchCardProps> = ({ item, index, count, order, ctx, run, busy, actions, money }) => {
    const { stage, waitingParts } = watchStage(item, order);
    const finished = stage === 'ready' || stage === 'return' || stage === 'collected';
    const [open, setOpen] = useState(!(finished && count > 1));
    const [diagOpen, setDiagOpen] = useState(false);
    const title = watchTitle(item, ctx.models);
    const days = daysInStage(item as RepairItem & { status_changed_on?: string });
    const tech = techName(item.technician, ctx);
    const price = watchPrice(item, ctx);
    const editable = order.docstatus === 0 && stage !== 'collected';

    const stageAction = (() => {
        if (!editable) return null;
        switch (stage) {
            case 'estimate': return <Button variant="primary" size="sm" onClick={() => actions.onEstimate(item)}>Create estimate</Button>;
            case 'customer': return <Button variant="primary" size="sm" onClick={() => actions.onAnswer(item)}>Record answer</Button>;
            case 'ready': return <Button variant="primary" size="sm" onClick={() => actions.onCollect(item)}>Collect &amp; invoice</Button>;
            case 'return': return <Button size="sm" onClick={() => actions.onCollect(item)}>Return to customer</Button>;
            default: return null;
        }
    })();

    return (
        <Card pad={false} className={cx('overflow-hidden', stage === 'ready' && 'border-[#B9E2C7]', stage === 'return' && 'border-[#F2C4C4]')}>
            <div className="px-4 sm:px-5 pt-4 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 className="m-0 text-[18px] font-extrabold leading-snug">
                            {title}
                            {specLine(item) && <span className="ml-2 text-[13px] font-semibold text-dw-caption">{specLine(item)}</span>}
                        </h2>
                        <p className="m-0 mt-0.5 text-[12px] font-semibold text-dw-caption">
                            {editable && <button type="button" onClick={() => actions.onEdit(item)} className="mr-2 font-bold text-dw-accent hover:underline">Edit details</button>}
                            Watch {index + 1} of {count}
                            {days !== null && stage !== 'collected' && ` · ${days === 0 ? 'in this stage since today' : `in this stage ${days} ${days === 1 ? 'day' : 'days'}`}`}
                            {!open && tech && ` · ${tech}`}
                        </p>
                    </div>
                    <div className="flex items-start gap-2">
                        {open && editable ? (
                            <div className="flex-1 sm:flex-none sm:w-[210px]">
                                <StageSelect value={stage} label={`Stage of ${title}`} onChange={change => actions.onStage(item, change)} />
                                {waitingParts && <div className="mt-1.5"><WatchStageBadges stage={stage} waitingParts /></div>}
                            </div>
                        ) : <WatchStageBadges stage={stage} waitingParts={waitingParts} />}
                        {!open && stageAction}
                        {count > 1 && (
                            <Button size="sm" variant="ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                                {open ? 'Less' : 'Details'}
                                <Icon name="chevronDown" size={16} className={cx('transition-transform', open && 'rotate-180')} />
                            </Button>
                        )}
                    </div>
                </div>

                {!open ? (
                    <p className="m-0 mt-2 text-[13px] text-dw-body flex flex-wrap gap-x-4 gap-y-1">
                        {item.issues?.length ? <span>Says: {item.issues.map(i => (i.is_other ? i.other_description || 'Other' : i.issue)).join(', ')}</span> : null}
                        {item.recommended_work?.length ? <span>{item.recommended_work.join(' + ')}</span> : null}
                        {price > 0 && <span className="font-extrabold text-dw-text">{money(price)}</span>}
                    </p>
                ) : (
                    <>
                        <StageStrip stage={stage} className="mt-4" />

                        <div className="mt-4 pt-4 border-t border-dw-line grid gap-x-8 gap-y-5 md:grid-cols-2">
                            <div className="flex flex-col gap-5">
                                <section>
                                    <SubHead title="Technician" />
                                    <button
                                        type="button"
                                        disabled={!editable}
                                        onClick={() => actions.onAssign(item)}
                                        className="w-full flex items-center gap-3 h-[42px] px-3 rounded-dw-control border border-dw-border-strong bg-dw-surface hover:bg-dw-ground text-left disabled:opacity-60"
                                    >
                                        <Icon name="user" size={18} className="text-dw-caption" />
                                        <span className={cx('flex-1 min-w-0 truncate text-[14px] font-bold', !tech && 'text-dw-warning')}>{tech || 'Unassigned · tap to assign'}</span>
                                        {editable && <Icon name="chevronDown" size={16} className="text-dw-caption" />}
                                    </button>
                                </section>
                                <IssuesSection item={item} run={run} canEdit={editable} />
                                <PhotosSection item={item} run={run} canEdit={editable} />
                                <DiagnosisRead item={item} ctx={ctx} onEdit={editable ? () => setDiagOpen(true) : undefined} />
                            </div>
                            <div className="flex flex-col gap-5">
                                <TasksSection item={item} ctx={ctx} run={run} busy={busy} desk canEditPrice={editable} />
                                <PartsSection item={item} ctx={ctx} run={run} busy={busy} canEditPrice={editable} />
                                {editable && !finished && <PartsHold item={item} run={run} busy={busy} desk />}
                                <NoteSection item={item} run={run} busy={busy} />
                            </div>
                        </div>
                    </>
                )}
            </div>
            {open && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-dw-line bg-[#FBF9F6]">
                    <span className="text-[13px] font-semibold text-dw-caption">
                        {STAGE_BY_ID[stage].label === 'Collected' ? 'Charged for this watch' : 'Price of tasks and parts'}
                        <span className="ml-2 text-[16px] font-extrabold text-dw-text tabular-nums">{money(price)}</span>
                    </span>
                    {stageAction}
                </div>
            )}
            {diagOpen && <DiagnosisSheet open={diagOpen} onClose={() => setDiagOpen(false)} item={item} run={run} title={title} />}
        </Card>
    );
};
