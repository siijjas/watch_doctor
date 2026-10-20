import React from 'react';
import { Link } from '../../router';
import type { StageId } from '../stages';
import { WatchStageBadges } from './Stage';
import { Button, cx } from './primitives';
import type { IconName } from './Icon';

export interface QueueRowProps {
    /** Where the row opens, usually /orders/<name>. */
    to: string;
    orderNo: string;
    customer: string;
    phone?: string;
    /** Brand + model of this watch; queue rows are per watch, not per order. */
    watch: string;
    stage: StageId;
    waitingParts?: boolean;
    /** e.g. "Promised Tue 21" or "Ready 9 days". */
    due?: string;
    overdue?: boolean;
    technician?: string | null;
    /** How long it has been in the stage, e.g. "for 6 days". */
    since?: string;
    /** Highlight `since` because the watch has sat too long. */
    stale?: boolean;
    /** What to tell a customer who calls, e.g. "Estimate BHD 42.000 sent 15 Oct". */
    tell?: string;
    /** Short attention text, e.g. "Customer silent 6 days". */
    note?: string;
    action?: { label: string; onClick: () => void; icon?: IconName; primary?: boolean };
    selected?: boolean;
}

/**
 * One watch in the front desk queue. The whole row opens the order (a
 * stretched link) and the next action sits on top of it as a real button,
 * so there is no nested interactive content.
 */
export const QueueRow: React.FC<QueueRowProps> = ({
    to, orderNo, customer, phone, watch, stage, waitingParts, due, overdue, technician, since, stale, tell, note, action, selected,
}) => {
    const title = (
        <Link to={to} className="text-[15px] font-extrabold text-dw-text hover:text-dw-text no-underline after:absolute after:inset-0 after:content-['']">
            {customer}
        </Link>
    );
    const ref = <span className="text-[12px] font-bold text-dw-caption">#{orderNo}{phone && <span className="font-semibold"> · {phone}</span>}</span>;
    const button = action && (
        <Button size="sm" variant={action.primary ? 'primary' : 'secondary'} icon={action.icon} onClick={action.onClick} className="relative z-10">
            {action.label}
        </Button>
    );
    const dueEl = due && <span className={cx(overdue && 'text-dw-danger font-bold')}>{due}</span>;
    const techEl = <span className={cx(!technician && 'text-dw-warning font-bold')}>{technician || 'Unassigned'}</span>;
    const sinceEl = since && <span className={cx('text-[12px] font-semibold', stale ? 'text-dw-danger' : 'text-dw-caption')}>{since}</span>;
    return (
        <div className={cx('relative border-b border-dw-line last:border-b-0', selected ? 'bg-[#EEF3FC]' : 'hover:bg-dw-ground')}>
            {/* Phone: stacked card */}
            <div className="lg:hidden px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-baseline gap-2 min-w-0"><span className="min-w-0 truncate">{title}</span><span className="shrink-0">{ref}</span></div>
                <div className="text-[14px] font-semibold text-dw-body truncate">{watch}</div>
                <div className="flex items-center gap-2 flex-wrap">
                    <WatchStageBadges stage={stage} waitingParts={waitingParts} />
                    {sinceEl}
                </div>
                {(tell || note || action) && (
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className={cx('flex-1 min-w-0 line-clamp-2 text-[12px]', note ? 'font-bold text-dw-warning' : 'font-semibold text-dw-body')}>{note || tell}</span>
                        {button}
                    </div>
                )}
            </div>
            {/* Desk: fixed columns so rows line up */}
            <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_170px_130px_170px] items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex flex-col">
                    <span className="truncate">{title}</span>
                    {ref}
                </div>
                <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-[14px] font-bold text-dw-text truncate" title={watch}>{watch}</span>
                    {tell && <span className="text-[12px] font-semibold text-dw-body line-clamp-2" title={tell}>{tell}</span>}
                </div>
                <div className="min-w-0 flex flex-col items-start gap-1"><WatchStageBadges stage={stage} waitingParts={waitingParts} />{sinceEl}</div>
                <div className="min-w-0 text-[12px] font-semibold text-dw-caption flex flex-col gap-0.5">
                    {dueEl}{techEl}
                    {note && <span className="text-dw-warning font-bold truncate" title={note}>{note}</span>}
                </div>
                <div className="flex justify-end">{button}</div>
            </div>
        </div>
    );
};
