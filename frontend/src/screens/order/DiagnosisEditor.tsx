import React, { useEffect, useId, useState } from 'react';
import type { RepairItem } from '../../types';
import * as apiService from '../../services/apiService';
import { Button, Chips, Icon, SectionLabel, Sheet, TextInput, Toggle, cx, useIsPhone } from '../../design/kit';

export interface DiagnosisValue {
    movement_type: string[];
    movement_caliber: string[];
    diagnosis_summary: string[];
    recommended_work: string[];
    notRepairable: boolean;
}

export const diagnosisOf = (item: RepairItem): DiagnosisValue => ({
    movement_type: item.movement_type || [],
    movement_caliber: item.movement_caliber || [],
    diagnosis_summary: item.diagnosis_summary || [],
    recommended_work: item.recommended_work || [],
    notRepairable: item.diagnosis_status === 'Not Repairable' || item.status === 'Not Repairable',
});

export const diagnosisPayload = (v: DiagnosisValue, item: RepairItem): apiService.RepairItemDiagnosisPayload => {
    const has = v.movement_type.length || v.movement_caliber.length || v.diagnosis_summary.length || v.recommended_work.length;
    // Keep a status the desk set (Quoted, Awaiting Approval, Declined); otherwise let the content decide.
    const kept = item.diagnosis_status && !['Pending Diagnosis', 'Diagnosed', 'Not Repairable'].includes(item.diagnosis_status)
        ? item.diagnosis_status
        : null;
    return {
        diagnosis_status: v.notRepairable ? 'Not Repairable' : kept ?? (has ? 'Diagnosed' : 'Pending Diagnosis'),
        movement_type: v.movement_type,
        movement_caliber: v.movement_caliber,
        movement_information: [...v.movement_type, ...v.movement_caliber],
        diagnosis_summary: v.diagnosis_summary,
        recommended_work: v.recommended_work,
    };
};

export const sameDiagnosis = (a: DiagnosisValue, b: DiagnosisValue) => JSON.stringify(a) === JSON.stringify(b);

interface Templates {
    movements: string[];
    calibers: string[];
    findings: string[];
    work: string[];
    usage: apiService.DiagnosisUsage;
}

const NO_USAGE: apiService.DiagnosisUsage = { movement_type: {}, diagnosis_summary: {}, recommended_work: {} };
/** How many "most used" chips lead the picker. */
const TOP = 8;

let templatesPromise: Promise<Templates> | null = null;
const loadTemplates = () => {
    templatesPromise ??= Promise.all([
        apiService.getMovementTypeTemplates(),
        apiService.getMovementCaliberTemplates(),
        apiService.getDiagnosisSummaryTemplates(),
        apiService.getRecommendedWorkTemplates(),
        // Ordering only: the picker still works A–Z if this fails.
        apiService.getDiagnosisUsage().catch(() => NO_USAGE),
    ]).then(([m, c, f, w, usage]) => ({
        movements: m.map(x => x.movement_type),
        calibers: c.map(x => x.caliber_code),
        findings: f.map(x => x.summary_name),
        work: w.map(x => x.work_name),
        usage,
    })).catch(err => {
        templatesPromise = null;
        throw err;
    });
    return templatesPromise;
};

/**
 * The chosen values as removable chips plus an Add button; the full template
 * list opens in a sheet with a search box, so the page stays short.
 * Typing a value that is not a template adds it.
 */
const PickerField: React.FC<{ label: string; templates: string[]; usage: Record<string, number>; value: string[]; onChange: (v: string[]) => void; addLabel: string; noun: string }> = ({
    label, templates, usage, value, onChange, addLabel, noun,
}) => {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    // Fixed while the sheet is open so chips do not jump as they are tapped.
    const [own, setOwn] = useState<string[]>([]);
    const phone = useIsPhone();
    const show = () => {
        setOwn(value.filter(v => !templates.includes(v)));
        setQ('');
        setOpen(true);
    };
    const used = (v: string) => usage[v] ?? 0;
    // Picked on at least two watches; a single use is not a habit yet.
    const top = templates.filter(v => used(v) >= 2).sort((a, b) => used(b) - used(a) || a.localeCompare(b)).slice(0, TOP);
    const rest = [...own, ...value.filter(v => !own.includes(v) && !templates.includes(v)), ...templates.filter(v => !top.includes(v))];
    const all = [...top, ...rest];
    const toOptions = (vs: string[]) => vs.map(v => ({ value: v, label: v }));
    const needle = q.trim().toLowerCase();
    const matches = needle
        ? all.filter(v => v.toLowerCase().includes(needle)).sort((a, b) => used(b) - used(a) || a.localeCompare(b))
        : all;
    const exact = all.some(v => v.toLowerCase() === needle);
    const pick = (shown: string[]) => (v: string[]) => {
        // Chips only reports its own subset; keep chosen values that are not in it.
        const hidden = value.filter(x => !shown.includes(x));
        onChange([...hidden, ...v.filter(x => !hidden.includes(x))]);
    };
    const add = () => {
        const t = q.trim();
        if (!t) return;
        const hit = all.find(x => x.toLowerCase() === t.toLowerCase());
        const v = hit ?? t;
        if (!value.includes(v)) onChange([...value, v]);
        setQ('');
    };
    return (
        <>
            <div className="flex flex-wrap gap-2">
                {value.map(v => (
                    <span key={v} className="inline-flex items-center gap-1 h-9 pl-3.5 pr-1 rounded-full bg-dw-text text-white text-[13px] font-bold max-w-full">
                        <span className="truncate">{v}</span>
                        <button type="button" onClick={() => onChange(value.filter(x => x !== v))} aria-label={`Remove ${v}`} className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center hover:bg-white/15">
                            <Icon name="x" size={14} strokeWidth={2.4} />
                        </button>
                    </span>
                ))}
                <button type="button" onClick={show} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-dashed border-dw-border-strong text-[13px] font-bold text-dw-text hover:bg-dw-ground">
                    <Icon name="plus" size={14} strokeWidth={2.4} />{value.length ? 'Add' : addLabel}
                </button>
            </div>
            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                title={label}
                width={620}
                footer={<>
                    <span className="mr-auto self-center text-[13px] font-bold text-dw-caption">{value.length ? `${value.length} chosen` : 'Tap to choose'}</span>
                    <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
                </>}
            >
                <div className="sticky top-0 z-[1] -mx-5 px-5 pb-3 bg-dw-surface flex gap-2">
                    <TextInput value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={`Search or add ${noun}`} aria-label={`Search ${label}`} className="h-10" />
                    {needle && !exact && <Button size="sm" className="h-10" onClick={add}>Add</Button>}
                </div>
                {/* On phones, land on the list so the keyboard does not cover it. */}
                <div tabIndex={-1} data-autofocus={phone ? '' : undefined} className="focus:outline-none">
                    {needle || !top.length ? (
                        <Chips multiple label={label} options={toOptions(matches)} value={value} onChange={pick(matches)} />
                    ) : (
                        <>
                            <SectionLabel className="mb-2">Most used</SectionLabel>
                            <Chips multiple label={`Most used ${noun}`} options={toOptions(top)} value={value} onChange={pick(top)} />
                            <SectionLabel className="mt-4 mb-2">All A–Z</SectionLabel>
                            <Chips multiple label={label} options={toOptions(rest)} value={value} onChange={pick(rest)} />
                        </>
                    )}
                    {needle && matches.length === 0 && <p className="m-0 text-[13px] text-dw-caption">Nothing matches. Press Add to use “{q.trim()}”.</p>}
                </div>
            </Sheet>
        </>
    );
};

interface DiagnosisEditorProps {
    value: DiagnosisValue;
    onChange: (v: DiagnosisValue) => void;
    /** False once the watch is already going back; only the desk moves it on from there. */
    canMarkNotRepairable?: boolean;
}

/** Movement, findings and work needed as chips (canvas M3). Work needed becomes tasks on save. */
export const DiagnosisEditor: React.FC<DiagnosisEditorProps> = ({ value, onChange, canMarkNotRepairable = true }) => {
    const [t, setT] = useState<Templates | null>(null);
    const [failed, setFailed] = useState(false);
    // Typed as text so "4R35, NH" can be entered; the list is derived from it.
    const [caliber, setCaliber] = useState(value.movement_caliber.join(', '));
    const caliberId = useId();
    const listId = useId();

    useEffect(() => {
        let live = true;
        loadTemplates().then(r => live && setT(r)).catch(() => live && setFailed(true));
        return () => { live = false; };
    }, []);

    const set = (patch: Partial<DiagnosisValue>) => onChange({ ...value, ...patch });

    if (failed) return <p className="text-[13px] font-semibold text-dw-danger">Could not load the diagnosis lists. Check the connection and reopen.</p>;
    if (!t) return <p className="text-[13px] text-dw-caption">Loading…</p>;

    return (
        <div className="flex flex-col gap-4">
            <div>
                <SectionLabel className="mb-2">Movement</SectionLabel>
                <PickerField label="Movement" templates={t.movements} usage={t.usage.movement_type} value={value.movement_type} onChange={v => set({ movement_type: v })} addLabel="Choose movement" noun="a movement" />
                <label htmlFor={caliberId} className="block mt-3 text-[13px] font-bold">Caliber</label>
                <TextInput
                    id={caliberId}
                    list={listId}
                    value={caliber}
                    onChange={e => { setCaliber(e.target.value); set({ movement_caliber: e.target.value.split(',').map(c => c.trim()).filter(Boolean) }); }}
                    placeholder="e.g. 4R35"
                    className="mt-1.5 max-w-[240px]"
                />
                <datalist id={listId}>{t.calibers.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
                <SectionLabel className="mb-2">What I found</SectionLabel>
                <PickerField label="What I found" templates={t.findings} usage={t.usage.diagnosis_summary} value={value.diagnosis_summary} onChange={v => set({ diagnosis_summary: v })} addLabel="Add finding" noun="a finding" />
            </div>
            <div>
                <SectionLabel className="mb-1">Work needed</SectionLabel>
                <p className="m-0 mb-2 text-[12px] text-dw-caption">Each one becomes a task with its price.</p>
                <PickerField label="Work needed" templates={t.work} usage={t.usage.recommended_work} value={value.recommended_work} onChange={v => set({ recommended_work: v })} addLabel="Add work" noun="work" />
            </div>
            {canMarkNotRepairable && <div className={cx('rounded-dw-control p-3', value.notRepairable ? 'bg-dw-danger-soft' : 'bg-dw-ground')}>
                <Toggle
                    checked={value.notRepairable}
                    onChange={v => set({ notRepairable: v })}
                    label="Not repairable"
                    description={value.notRepairable ? 'The front desk will tell the customer and return the watch.' : 'Turn on if the watch cannot be fixed.'}
                />
            </div>}
        </div>
    );
};
