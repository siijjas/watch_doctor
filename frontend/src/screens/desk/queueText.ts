/**
 * Words for the front desk queue: what stage a watch is in, since when, and
 * what to tell a customer who calls. Kept apart from the screen so the
 * Excel/print exports say exactly what the rows say.
 */
import type { DeskRow } from '../../services/deskApi';
import { stageOfWatch, type StageId } from '../../design/stages';
import { formatDay } from '../../design/kit';

export interface QueueItem {
    row: DeskRow;
    stage: StageId;
    waitingParts: boolean;
}

export const toQueueItem = (row: DeskRow): QueueItem => {
    const collected = row.docstatus === 1 || row.order_status === 'Delivered';
    const { stage, waitingParts } = stageOfWatch({ status: row.watch_status, awaiting_parts: row.awaiting_parts }, collected ? 1 : 0);
    return { row, stage, waitingParts };
};

export const watchLabel = (row: { watch_brand?: string | null; watch_model?: string | null }) =>
    [row.watch_brand, row.watch_model].filter(Boolean).join(' ') || 'Watch';

const days = (n: number) => (n === 1 ? '1 day' : `${n} days`);

export const sinceText = ({ row, stage, waitingParts }: QueueItem): string => {
    if (stage === 'collected') {
        const on = formatDay(row.delivery_date || row.status_changed_on);
        return on ? `collected ${on}` : 'collected';
    }
    if (waitingParts) {
        if (!row.parts_expected_date) return 'part: no date yet';
        return row.parts_overdue_days > 0 ? `part ${days(row.parts_overdue_days)} late` : `part due ${formatDay(row.parts_expected_date)}`;
    }
    const prefix = stage === 'ready' ? 'ready ' : '';
    return row.days_in_stage <= 0 ? `${prefix || 'since '}today` : `${prefix || 'for '}${days(row.days_in_stage)}`;
};

export const promisedText = (row: DeskRow): { text: string; late: boolean } => {
    if (!row.promised_delivery_date) return { text: 'No date', late: false };
    if (row.overdue_days > 0) return { text: row.overdue_days === 1 ? 'Due yesterday' : `${days(row.overdue_days)} late`, late: true };
    return { text: `Due ${formatDay(row.promised_delivery_date)}`, late: false };
};

/** One sentence the receptionist can read out on the phone. */
export const tellText = ({ row, stage, waitingParts }: QueueItem, money: (n: number) => string): string => {
    const tech = row.technician || 'the technician';
    const estimate = row.quotation_amount ? money(row.quotation_amount) : '';
    const late = row.overdue_days > 0 && stage !== 'ready' && stage !== 'return' && stage !== 'collected'
        ? ' Promised date has passed; give a new date.'
        : '';
    if (waitingParts) {
        const part = row.parts_note ? ` (${row.parts_note})` : '';
        const when = row.parts_expected_date ? ` Expected ${formatDay(row.parts_expected_date)}.` : '';
        return `Waiting for a part${part}.${when}${late}`;
    }
    switch (stage) {
        case 'received':
            return `Received ${formatDay(row.received_date)}. Not yet with a technician.${late}`;
        case 'diagnosing':
            return `With ${tech} for diagnosis.${late}`;
        case 'estimate':
            return `Checked. ${estimate ? `Estimate ${estimate} ready to send.` : 'Estimate being prepared.'}${late}`;
        case 'customer': {
            const sent = row.last_message?.sent_at ? ` on ${formatDay(row.last_message.sent_at)}` : '';
            return `Estimate${estimate ? ` ${estimate}` : ''} sent${sent}, waiting for the answer.${late}`;
        }
        case 'repair':
            return row.watch_status === 'Approved'
                ? `Approved. Waiting for ${tech} to start.${late}`
                : `Being repaired by ${tech}.${late}`;
        case 'ready':
            return row.balance_amount > 0 ? `Ready. ${money(row.balance_amount)} to pay at collection.` : 'Ready to collect.';
        case 'return':
            return row.watch_status === 'Declined'
                ? 'Customer declined. Return the watch, no repair charge.'
                : 'Not repairable. Return the watch to the customer.';
        case 'collected':
            return `Collected ${formatDay(row.delivery_date || row.status_changed_on)}.`;
    }
};

export type AttentionId = 'overdue' | 'readyLong' | 'estimateLate' | 'customerSilent' | 'partLate' | 'noTech';

export const ATTENTION: { id: AttentionId; label: (n: number) => string; tone: 'danger' | 'warning' | 'neutral'; test: (q: QueueItem) => boolean }[] = [
    { id: 'overdue', label: n => `${n} past promised date`, tone: 'danger', test: q => q.row.overdue_days > 0 && q.stage !== 'ready' && q.stage !== 'return' },
    { id: 'readyLong', label: n => `${n} ready over 7 days`, tone: 'warning', test: q => (q.stage === 'ready' || q.stage === 'return') && q.row.days_in_stage >= 7 },
    { id: 'estimateLate', label: n => `${n} estimate not sent`, tone: 'warning', test: q => q.stage === 'estimate' && q.row.needs_attention },
    { id: 'customerSilent', label: n => `${n} customer not answering`, tone: 'warning', test: q => q.stage === 'customer' && q.row.needs_attention },
    { id: 'partLate', label: n => `${n} part overdue`, tone: 'warning', test: q => q.waitingParts && q.row.parts_overdue_days > 0 },
    { id: 'noTech', label: n => `${n} with no technician`, tone: 'neutral', test: q => q.stage === 'received' && !q.row.technician_id },
];

export type TileId = 'all' | 'received' | 'diagnosing' | 'estimate' | 'customer' | 'repair' | 'parts' | 'ready';

export const TILES: { id: TileId; label: string; title: string; test: (q: QueueItem) => boolean }[] = [
    { id: 'all', label: 'In the shop', title: 'Everything in the shop', test: () => true },
    { id: 'received', label: 'Received', title: 'Received, waiting for a technician', test: q => q.stage === 'received' },
    { id: 'diagnosing', label: 'Diagnosing', title: 'Being diagnosed', test: q => q.stage === 'diagnosing' && !q.waitingParts },
    { id: 'estimate', label: 'Estimate to send', title: 'Diagnosed, estimate to review and send', test: q => q.stage === 'estimate' },
    { id: 'customer', label: 'Waiting customer', title: 'Waiting for the customer to decide', test: q => q.stage === 'customer' && !q.waitingParts },
    { id: 'repair', label: 'In repair', title: 'In repair', test: q => q.stage === 'repair' && !q.waitingParts },
    { id: 'parts', label: 'Waiting parts', title: 'Waiting for parts', test: q => q.waitingParts },
    { id: 'ready', label: 'Ready / to return', title: 'Ready to collect or return', test: q => q.stage === 'ready' || q.stage === 'return' },
];
