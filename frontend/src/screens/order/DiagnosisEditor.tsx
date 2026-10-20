import React, { useEffect, useId, useState } from 'react';
import type { RepairItem } from '../../types';
import * as apiService from '../../services/apiService';
import { Button, Chips, SectionLabel, TextInput, Toggle, cx } from '../../design/kit';

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
}

let templatesPromise: Promise<Templates> | null = null;
const loadTemplates = () => {
    templatesPromise ??= Promise.all([
        apiService.getMovementTypeTemplates(),
        apiService.getMovementCaliberTemplates(),
        apiService.getDiagnosisSummaryTemplates(),
        apiService.getRecommendedWorkTemplates(),
    ]).then(([m, c, f, w]) => ({
        movements: m.map(x => x.movement_type),
        calibers: c.map(x => x.caliber_code),
        findings: f.map(x => x.summary_name),
        work: w.map(x => x.work_name),
    })).catch(err => {
        templatesPromise = null;
        throw err;
    });
    return templatesPromise;
};

/** Template chips plus anything already on the watch that is not a template. */
const optionsFor = (templates: string[], current: string[]) =>
    [...templates, ...current.filter(v => !templates.includes(v))].map(v => ({ value: v, label: v }));

const AddOwn: React.FC<{ label: string; onAdd: (v: string) => void }> = ({ label, onAdd }) => {
    const [v, setV] = useState('');
    const add = () => { const t = v.trim(); if (t) { onAdd(t); setV(''); } };
    return (
        <div className="flex gap-2 mt-2">
            <TextInput value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={label} aria-label={label} className="h-10" />
            <Button size="sm" className="h-10" disabled={!v.trim()} onClick={add}>Add</Button>
        </div>
    );
};

/**
 * Multi-select chips for long template lists: the chosen ones, a few more,
 * a filter box, and "Show all". Typing a value that is not a template adds it.
 */
const ChipPicker: React.FC<{ label: string; templates: string[]; value: string[]; onChange: (v: string[]) => void; collapsed: boolean; addLabel: string }> = ({
    label, templates, value, onChange, collapsed, addLabel,
}) => {
    const [q, setQ] = useState('');
    const [all, setAll] = useState(!collapsed);
    const options = optionsFor(templates, value);
    const needle = q.trim().toLowerCase();
    const shown = needle
        ? options.filter(o => o.value.toLowerCase().includes(needle))
        : all ? options : options.filter((o, i) => i < 10 || value.includes(o.value));
    const exact = options.some(o => o.value.toLowerCase() === needle);
    const add = () => {
        const t = q.trim();
        if (!t) return;
        const hit = options.find(o => o.value.toLowerCase() === t.toLowerCase());
        const v = hit ? hit.value : t;
        if (!value.includes(v)) onChange([...value, v]);
        setQ('');
    };
    return (
        <div>
            {options.length > 12 && (
                <div className="flex gap-2 mb-2">
                    <TextInput value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={`Filter or ${addLabel.toLowerCase()}`} aria-label={`Filter ${label}`} className="h-10" />
                    {needle && !exact && <Button size="sm" className="h-10" onClick={add}>Add</Button>}
                </div>
            )}
            <Chips multiple label={label} options={shown} value={value} onChange={v => {
                // Chips only reports the shown subset; keep chosen values that are filtered out.
                const hidden = value.filter(x => !shown.some(o => o.value === x));
                onChange([...hidden, ...v.filter(x => !hidden.includes(x))]);
            }} />
            {!needle && options.length > shown.length && (
                <button type="button" onClick={() => setAll(true)} className="mt-2 text-[13px] font-bold text-dw-accent">Show all {options.length}</button>
            )}
            {needle && shown.length === 0 && <p className="m-0 text-[13px] text-dw-caption">Nothing matches. Press Add to use “{q.trim()}”.</p>}
            {options.length <= 12 && <AddOwn label={addLabel} onAdd={v => onChange(value.includes(v) ? value : [...value, v])} />}
        </div>
    );
};

interface DiagnosisEditorProps {
    value: DiagnosisValue;
    onChange: (v: DiagnosisValue) => void;
    /** Hide the long finding list behind "Show all" on phones. */
    compact?: boolean;
    /** False once the watch is already going back; only the desk moves it on from there. */
    canMarkNotRepairable?: boolean;
}

/** Movement, findings and work needed as chips (canvas M3). Work needed becomes tasks on save. */
export const DiagnosisEditor: React.FC<DiagnosisEditorProps> = ({ value, onChange, compact, canMarkNotRepairable = true }) => {
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
                <Chips multiple label="Movement" options={optionsFor(t.movements, value.movement_type)} value={value.movement_type} onChange={v => set({ movement_type: v })} />
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
                <ChipPicker label="Findings" templates={t.findings} value={value.diagnosis_summary} onChange={v => set({ diagnosis_summary: v })} collapsed={!!compact} addLabel="Add something else" />
            </div>
            <div>
                <SectionLabel className="mb-1">Work needed</SectionLabel>
                <p className="m-0 mb-2 text-[12px] text-dw-caption">Each one becomes a task with its price.</p>
                <ChipPicker label="Work needed" templates={t.work} value={value.recommended_work} onChange={v => set({ recommended_work: v })} collapsed addLabel="Add other work" />
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
