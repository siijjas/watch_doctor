/**
 * One stage vocabulary for every screen (canvas board S2, spec B4).
 *
 * The backend keeps its 11 `DW Repair Item.status` values, the diagnosis
 * status and the order status. The UI only ever shows the stage derived
 * here, plus the separate "Waiting parts" flag.
 */
import { WatchStatus } from '../types';

export type StageId =
    | 'received'
    | 'diagnosing'
    | 'estimate'
    | 'customer'
    | 'repair'
    | 'ready'
    | 'return'
    | 'collected';

/** Badge tones: every stage plus the waiting-parts flag and overdue. */
export type StageTone = StageId | 'parts' | 'overdue';

export interface StageDef {
    id: StageId;
    label: string;
    /** Short form for tight phone rows and the stepper. */
    short: string;
    /** Who normally moves a watch out of this stage. */
    owner: 'desk' | 'technician' | 'customer';
    /** What the desk should do next, shown on queue rows. */
    nextAction?: string;
}

export const STAGES: StageDef[] = [
    { id: 'received', label: 'Received', short: 'Received', owner: 'desk', nextAction: 'Assign technician' },
    { id: 'diagnosing', label: 'Diagnosing', short: 'Diagnosing', owner: 'technician' },
    { id: 'estimate', label: 'Estimate to send', short: 'Estimate', owner: 'desk', nextAction: 'Send estimate' },
    { id: 'customer', label: 'Waiting customer', short: 'Customer', owner: 'customer', nextAction: 'Record answer' },
    { id: 'repair', label: 'In repair', short: 'In repair', owner: 'technician' },
    { id: 'ready', label: 'Ready', short: 'Ready', owner: 'desk', nextAction: 'Collect' },
    { id: 'return', label: 'To return', short: 'Return', owner: 'desk', nextAction: 'Return watch' },
    { id: 'collected', label: 'Collected', short: 'Collected', owner: 'desk' },
];

export const STAGE_BY_ID: Record<StageId, StageDef> = STAGES.reduce(
    (acc, s) => ({ ...acc, [s.id]: s }),
    {} as Record<StageId, StageDef>,
);

/** Main path shown by the stepper. "To return" replaces "Ready" when it applies. */
export const STAGE_PATH: StageId[] = ['received', 'diagnosing', 'estimate', 'customer', 'repair', 'ready', 'collected'];

const STATUS_TO_STAGE: Record<string, StageId> = {
    [WatchStatus.Pending]: 'received',
    [WatchStatus.UnderDiagnosis]: 'diagnosing',
    [WatchStatus.Diagnosed]: 'estimate',
    [WatchStatus.CreateEstimate]: 'estimate',
    [WatchStatus.Quoted]: 'customer',
    [WatchStatus.Approved]: 'repair',
    [WatchStatus.InRepair]: 'repair',
    [WatchStatus.Completed]: 'ready',
    [WatchStatus.NotRepairable]: 'return',
    [WatchStatus.Declined]: 'return',
    [WatchStatus.Delivered]: 'collected',
};

export interface WatchStageInput {
    status?: WatchStatus | string | null;
    awaiting_parts?: number | boolean | null;
}

export interface WatchStage {
    stage: StageId;
    waitingParts: boolean;
}

/**
 * Stage of one watch. A submitted order (docstatus 1) means every watch on
 * it has been invoiced and handed back, so it reads as Collected.
 */
export const stageOfWatch = (watch: WatchStageInput, orderDocstatus?: number): WatchStage => {
    const stage: StageId = orderDocstatus === 1
        ? 'collected'
        : STATUS_TO_STAGE[String(watch.status || '')] ?? 'received';
    const waitingParts = !!watch.awaiting_parts && (stage === 'repair' || stage === 'diagnosing' || stage === 'customer');
    return { stage, waitingParts };
};

export const stageIndex = (stage: StageId): number => {
    if (stage === 'return') return STAGE_PATH.indexOf('ready');
    return STAGE_PATH.indexOf(stage);
};

/** True when moving `from` → `to` goes back along the path and needs a reason. */
export const isBackwardMove = (from: StageId, to: StageId): boolean => stageIndex(to) < stageIndex(from);

/**
 * Backend status written when the desk picks a stage. "To return" needs the
 * caller to choose Not Repairable or Declined; Collected only happens through
 * the collect flow, so it has no direct status.
 */
export const STAGE_TO_STATUS: Partial<Record<StageId, WatchStatus>> = {
    received: WatchStatus.Pending,
    diagnosing: WatchStatus.UnderDiagnosis,
    estimate: WatchStatus.CreateEstimate,
    customer: WatchStatus.Quoted,
    repair: WatchStatus.InRepair,
    ready: WatchStatus.Completed,
    return: WatchStatus.NotRepairable,
};

/** Stages the desk may set directly from the stage select. */
export const DESK_SETTABLE: StageId[] = ['received', 'diagnosing', 'estimate', 'customer', 'repair', 'ready', 'return'];

/**
 * One-line order summary from its watches, e.g. "In repair · 1 ready".
 * The most behind watch leads, because that is what holds the order up.
 */
/** The stage that holds an order up: its most-behind open watch. */
export const orderLeadStage = (watches: WatchStageInput[], orderDocstatus?: number): StageId => {
    if (orderDocstatus === 1) return 'collected';
    const open = watches.map(w => stageOfWatch(w).stage).filter(s => s !== 'collected');
    if (!watches.length) return 'received';
    if (!open.length) return 'collected';
    return open.reduce((a, b) => (stageIndex(b) < stageIndex(a) ? b : a));
};

export const summariseOrder = (watches: WatchStageInput[], orderDocstatus?: number): string => {
    const lead = orderLeadStage(watches, orderDocstatus);
    if (lead === 'collected' || !watches.length) return STAGE_BY_ID[lead].label;
    const open = watches.map(w => stageOfWatch(w).stage).filter(s => s !== 'collected');
    const ready = open.filter(s => s === 'ready').length;
    const parts = watches.filter(w => stageOfWatch(w).waitingParts).length;
    const bits = [STAGE_BY_ID[lead].label];
    if (lead !== 'ready' && ready) bits.push(`${ready} ready`);
    if (parts) bits.push('waiting parts');
    return bits.join(' · ');
};
