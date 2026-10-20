import React, { useId, useState } from 'react';
import {
    DESK_SETTABLE, STAGE_BY_ID, STAGE_PATH, isBackwardMove, stageIndex,
    type StageId, type StageTone,
} from '../stages';
import { Button, SelectInput, TextInput, cx } from './primitives';
import { Icon } from './Icon';

const TONE_LABEL: Record<StageTone, string> = {
    received: 'Received', diagnosing: 'Diagnosing', estimate: 'Estimate to send', customer: 'Waiting customer',
    repair: 'In repair', ready: 'Ready', return: 'To return', collected: 'Collected',
    parts: 'Waiting parts', overdue: 'Overdue',
};

interface StageBadgeProps {
    stage: StageTone;
    /** Override the text, e.g. "Overdue 2d". The tone still comes from `stage`. */
    children?: React.ReactNode;
    short?: boolean;
    dot?: boolean;
    className?: string;
}

export const StageBadge: React.FC<StageBadgeProps> = ({ stage, children, short, dot = true, className }) => (
    <span className={cx('dw-badge', `dw-tone-${stage}`, !dot && 'dw-badge--plain', className)}>
        {children ?? (short && stage in STAGE_BY_ID ? STAGE_BY_ID[stage as StageId].short : TONE_LABEL[stage])}
    </span>
);

/** Stage plus the waiting-parts flag, the pair every row shows. */
export const WatchStageBadges: React.FC<{ stage: StageId; waitingParts?: boolean; overdue?: boolean; short?: boolean }> = ({
    stage, waitingParts, overdue, short,
}) => (
    <span className="inline-flex flex-wrap items-center gap-1.5">
        <StageBadge stage={stage} short={short} />
        {waitingParts && <StageBadge stage="parts" short={short} />}
        {overdue && <StageBadge stage="overdue" />}
    </span>
);

/**
 * Read-only stepper along the main path. "To return" takes the Ready slot.
 * Equal columns, so it always fits its container; labels truncate.
 * Compact mode is the phone version: dots with only the current label.
 */
export const StageStrip: React.FC<{ stage: StageId; compact?: boolean; className?: string }> = ({ stage, compact, className }) => {
    const current = stageIndex(stage);
    const steps = STAGE_PATH.map(id => (id === 'ready' && stage === 'return' ? 'return' : id));
    const dot = compact ? 12 : 24;
    return (
        <ol
            className={cx('grid w-full m-0 p-0 list-none', className)}
            style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            aria-label={`Stage: ${STAGE_BY_ID[stage].label}`}
        >
            {steps.map((id, i) => {
                const done = i < current;
                const now = i === current;
                const danger = now && id === 'return';
                return (
                    <li key={id} className="relative flex flex-col items-center gap-1 min-w-0" aria-current={now ? 'step' : undefined}>
                        {i < steps.length - 1 && (
                            <span
                                aria-hidden="true"
                                className={cx('absolute h-0.5 rounded', i < current ? 'bg-dw-accent' : 'bg-dw-sunken')}
                                style={{ top: dot / 2 - 1, left: `calc(50% + ${dot / 2 + 4}px)`, right: `calc(-50% + ${dot / 2 + 4}px)` }}
                            />
                        )}
                        <span
                            className={cx(
                                'relative flex items-center justify-center rounded-full shrink-0',
                                done && 'bg-dw-accent text-white',
                                now && !danger && 'bg-dw-surface border-2 border-dw-accent text-dw-accent',
                                danger && 'bg-dw-danger-soft border-2 border-dw-danger text-dw-danger',
                                !done && !now && 'bg-dw-sunken text-dw-caption',
                            )}
                            style={{ width: dot, height: dot }}
                        >
                            {!compact && (done ? <Icon name="check" size={13} strokeWidth={2.6} /> : <span className="text-[11px] font-extrabold">{i + 1}</span>)}
                        </span>
                        {(!compact || now) && (
                            <span className={cx('px-0.5 text-[11px] font-bold', compact ? 'whitespace-nowrap' : 'max-w-full truncate', now ? (danger ? 'text-dw-danger' : 'text-dw-text') : 'text-dw-caption')}>
                                {STAGE_BY_ID[id].short}
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
};

export type ReturnReason = 'Not Repairable' | 'Declined';

export interface StageChange {
    to: StageId;
    /** Required for backwards moves; written to the activity log. */
    reason?: string;
    /** Only for "To return": which backend status to write. */
    returnAs?: ReturnReason;
}

interface StageSelectProps {
    value: StageId;
    onChange: (change: StageChange) => void | Promise<void>;
    disabled?: boolean;
    label?: string;
}

/**
 * Desk-only stage control (receptionist sets stages, technicians never do).
 * Forward moves apply at once. Backward moves and "To return" open a small
 * confirm panel that asks for the reason first.
 */
export const StageSelect: React.FC<StageSelectProps> = ({ value, onChange, disabled, label = 'Stage' }) => {
    const id = useId();
    const [pending, setPending] = useState<StageId | null>(null);
    const [reason, setReason] = useState('');
    const [returnAs, setReturnAs] = useState<ReturnReason>('Not Repairable');
    const [busy, setBusy] = useState(false);

    const run = async (change: StageChange) => {
        setBusy(true);
        try {
            await onChange(change);
            setPending(null);
            setReason('');
        } finally {
            setBusy(false);
        }
    };

    const pick = (to: StageId) => {
        if (to === value) return;
        if (to === 'return' || isBackwardMove(value, to)) {
            setPending(to);
            return;
        }
        void run({ to });
    };

    const back = pending ? isBackwardMove(value, pending) : false;
    const locked = disabled || value === 'collected';

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="sr-only">{label}</label>
            <div className="relative">
                <SelectInput
                    id={id}
                    value={pending ?? value}
                    disabled={locked || busy}
                    onChange={e => pick(e.target.value as StageId)}
                    className="appearance-none"
                >
                    {value === 'collected' && <option value="collected">Collected</option>}
                    {DESK_SETTABLE.map(s => <option key={s} value={s}>{STAGE_BY_ID[s].label}</option>)}
                </SelectInput>
                <Icon name="chevronDown" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            {pending && (
                <div className="dw-anim-pop rounded-dw-control border border-dw-border bg-dw-ground p-3 flex flex-col gap-2">
                    <p className="text-[13px] font-bold">
                        {back ? `Move back to ${STAGE_BY_ID[pending].label}?` : `Mark as ${STAGE_BY_ID[pending].label}?`}
                    </p>
                    {pending === 'return' && (
                        <div className="flex gap-1 p-1 bg-dw-sunken rounded-[10px]" role="radiogroup" aria-label="Why it goes back">
                            {(['Not Repairable', 'Declined'] as ReturnReason[]).map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    role="radio"
                                    aria-checked={returnAs === r}
                                    onClick={() => setReturnAs(r)}
                                    className={cx('flex-1 h-8 rounded-lg text-[13px] font-bold', returnAs === r ? 'bg-dw-surface shadow-sm text-dw-text' : 'text-dw-caption')}
                                >
                                    {r === 'Declined' ? 'Customer declined' : 'Not repairable'}
                                </button>
                            ))}
                        </div>
                    )}
                    <TextInput
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder={back ? 'Reason, saved to the activity log' : 'Note for the customer file'}
                        aria-label="Reason"
                        autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setPending(null); setReason(''); }}>Cancel</Button>
                        <Button
                            size="sm"
                            variant={pending === 'return' ? 'danger' : 'primary'}
                            busy={busy}
                            disabled={back && !reason.trim()}
                            onClick={() => run({ to: pending, reason: reason.trim() || undefined, returnAs: pending === 'return' ? returnAs : undefined })}
                        >
                            Confirm
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
