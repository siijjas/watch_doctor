/**
 * Settings (canvas D13): five groups instead of 18 flat tabs, one generic
 * list editor for every template list, an unsaved-changes bar on forms, and
 * a search across section names. WhatsApp has its own centre (D14).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, navigate } from '../../router';
import { useAppConfig } from '../../context/AppConfigContext';
import {
    Button, Card, Field, Icon, SelectInput, Sheet, Spinner, TemplateCrud, TextArea, TextInput, Toggle, UnsavedBar, cx, useToast,
    type CrudField,
} from '../../design/kit';
import * as apiService from '../../services/apiService';
import type { GeneralConfiguration, InvoiceWorkflowConfiguration, PmsConfiguration } from '../../services/apiService';
import WhatsAppCentre from './WhatsAppCentre';

const call = async <T,>(method: string, args: Record<string, unknown> = {}): Promise<T> =>
    (await apiService.apiFetchRaw(`/api/method/watch_doctor.api.${method}`, { method: 'POST', body: JSON.stringify(args) })).message as T;

export type SectionId = 'company' | 'workflows' | 'pms' | 'payments' | 'vocabulary' | 'services' | 'catalogue' | 'people' | 'whatsapp';

const GROUPS: Array<{ label: string; items: Array<{ id: SectionId; label: string; keywords: string }> }> = [
    { label: 'Company', items: [{ id: 'company', label: 'Shop details & logo', keywords: 'name phone address cr vat logo receipt subtitle country code' }] },
    {
        label: 'Invoicing & VAT', items: [
            { id: 'workflows', label: 'Invoice series & printing', keywords: 'naming series print format receipt label bag zebra' },
            { id: 'pms', label: 'PMS / profit margin VAT', keywords: 'pms margin vat pre-owned used tax template divisor disclaimer' },
            { id: 'payments', label: 'Payment modes & POS', keywords: 'payment modes cash card benefit pos profile walk-in auto print sales person commission' },
        ],
    },
    {
        label: 'Repair vocabulary', items: [
            { id: 'vocabulary', label: 'Complaints, conditions, findings, work, movements', keywords: 'complaints issues conditions diagnosis findings recommended work movement type caliber' },
            { id: 'services', label: 'Services & prices', keywords: 'services tasks prices rates estimate' },
        ],
    },
    { label: 'Catalogue', items: [{ id: 'catalogue', label: 'Brands & models', keywords: 'brands models watch' }] },
    {
        label: 'People & messaging', items: [
            { id: 'people', label: 'Technicians, sales people, country codes', keywords: 'technicians staff users sales person commission country codes phone' },
            { id: 'whatsapp', label: 'WhatsApp templates, log & owner summary', keywords: 'whatsapp messages templates log daily summary owner' },
        ],
    },
];

// ---------------------------------------------------------------- single-record forms

function useSingle<T extends object>(load: () => Promise<T>, save: (v: T) => Promise<unknown>) {
    const toast = useToast();
    const [saved, setSaved] = useState<T | null>(null);
    const [value, setValue] = useState<T | null>(null);
    const [busy, setBusy] = useState(false);
    const reload = useCallback(() => load().then(v => { setSaved(v); setValue(v); }).catch(e => toast.error(e instanceof Error ? e.message : 'Settings did not load.')), [load, toast]);
    useEffect(() => { void reload(); }, [reload]);
    const dirty = !!value && JSON.stringify(value) !== JSON.stringify(saved);
    const set = (p: Partial<T>) => setValue(v => (v ? { ...v, ...p } : v));
    const commit = async () => {
        if (!value) return;
        setBusy(true);
        try { await save(value); toast.success('Saved'); await reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
    };
    // Leaving the page with unsaved changes asks first.
    useEffect(() => {
        if (!dirty) return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [dirty]);
    return { value, set, dirty, busy, commit, discard: () => setValue(saved) };
}

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
    <Card>
        <h2 className="m-0 text-[16px] font-extrabold">{title}</h2>
        {note && <p className="m-0 mt-0.5 text-[13px] text-dw-caption">{note}</p>}
        <div className="mt-4">{children}</div>
    </Card>
);

const Company: React.FC = () => {
    const { config, refreshConfig } = useAppConfig();
    const toast = useToast();
    const loader = useCallback(() => apiService.getGeneralConfiguration().then(r => r.config), []);
    const f = useSingle<GeneralConfiguration>(loader, v => apiService.saveGeneralConfiguration(v));
    const [uploading, setUploading] = useState(false);
    const upload = async (file: File) => {
        setUploading(true);
        try { await apiService.saveLogoUrl(await apiService.uploadFile(file)); await refreshConfig(); toast.success('Logo updated'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Logo not saved.'); } finally { setUploading(false); }
    };
    if (!f.value) return <Spinner />;
    const v = f.value;
    const text = (k: keyof GeneralConfiguration, label: string, opt?: { hint?: string; required?: boolean; area?: boolean }) => (
        <Field label={label} hint={opt?.hint} optional={!opt?.required}>
            {opt?.area
                ? <TextArea rows={2} value={String(v[k] ?? '')} onChange={e => f.set({ [k]: e.target.value } as Partial<GeneralConfiguration>)} />
                : <TextInput value={String(v[k] ?? '')} onChange={e => f.set({ [k]: e.target.value } as Partial<GeneralConfiguration>)} />}
        </Field>
    );
    return (
        <>
            <Section title="Shop details" note="Printed on receipts, invoices and labels.">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    {text('company_name', 'Company name', { required: true })}
                    {text('company_phone', 'Phone')}
                    {text('company_email', 'Email')}
                    {text('company_website', 'Website')}
                    {text('cr_number', 'CR number')}
                    {text('vat_registration_number', 'VAT registration')}
                    <div className="sm:col-span-2">{text('company_address', 'Address', { area: true })}</div>
                    {text('repair_receipt_subtitle', 'Receipt subtitle')}
                    <Field label="Default country code" hint="Digits only, e.g. 973. Used for WhatsApp numbers saved without one.">
                        <TextInput inputMode="numeric" value={v.whatsapp_default_country_code || ''} onChange={e => f.set({ whatsapp_default_country_code: e.target.value.replace(/\D/g, '') })} />
                    </Field>
                </div>
            </Section>
            <Section title="Logo" note="Shown in the app and on prints. PNG or SVG.">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="w-[180px] h-[72px] rounded-dw-control border border-dw-border bg-dw-ground flex items-center justify-center overflow-hidden">
                        {config.logoUrl ? <img src={config.logoUrl} alt="Current logo" className="max-h-[60px] max-w-[160px] object-contain" /> : <span className="text-[12px] text-dw-caption">No logo</span>}
                    </div>
                    <label className="inline-flex items-center gap-2 h-[42px] px-4 rounded-dw-control border border-dw-border-strong bg-dw-surface text-[14px] font-bold cursor-pointer hover:bg-dw-ground">
                        {uploading ? <Spinner /> : <Icon name="plus" size={16} />}Upload
                        <input type="file" accept="image/*" className="sr-only" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); e.target.value = ''; }} />
                    </label>
                    {config.logoUrl && <Button variant="ghost" className="text-dw-danger" onClick={() => void apiService.saveLogoUrl('').then(() => refreshConfig())}>Remove</Button>}
                    <p className="m-0 w-full text-[12px] text-dw-caption">Currency {config.currencyCode || '—'} with {config.decimalPlaces ?? 3} decimals comes from ERPNext.</p>
                </div>
            </Section>
            <UnsavedBar dirty={f.dirty} saving={f.busy} onSave={() => void f.commit()} onDiscard={f.discard} />
        </>
    );
};

const Workflows: React.FC = () => {
    const [options, setOptions] = useState<{ naming_series: string[]; print_formats: string[]; repair_order_print_formats: string[] } | null>(null);
    const loader = useCallback(() => apiService.getInvoiceWorkflowConfiguration().then(r => { setOptions(r.options); return r.config; }), []);
    const f = useSingle<InvoiceWorkflowConfiguration>(loader, v => apiService.saveInvoiceWorkflowConfiguration(v));
    if (!f.value || !options) return <Spinner />;
    const v = f.value;
    const select = (k: keyof InvoiceWorkflowConfiguration, list: string[], empty: string) => (
        <SelectInput aria-label={k} value={v[k] || ''} onChange={e => f.set({ [k]: e.target.value } as Partial<InvoiceWorkflowConfiguration>)}>
            <option value="">{empty}</option>
            {list.map(o => <option key={o} value={o}>{o}</option>)}
        </SelectInput>
    );
    const rows: Array<[string, string, keyof InvoiceWorkflowConfiguration, keyof InvoiceWorkflowConfiguration]> = [
        ['Repair service', 'Collect & invoice on a repair order', 'repair_service_naming_series', 'repair_service_print_format'],
        ['POS standard', 'Retail sale with standard VAT', 'pos_standard_naming_series', 'pos_standard_print_format'],
        ['POS PMS', 'Retail sale of pre-owned (PMS) items', 'pos_pms_naming_series', 'pos_pms_print_format'],
    ];
    return (
        <>
            <Section title="Invoice series and print formats" note="One row per kind of invoice.">
                <div className="flex flex-col gap-4">
                    {rows.map(([label, when, series, format]) => (
                        <div key={label} className="grid gap-3 grid-cols-1 md:grid-cols-[1fr_1fr_1fr] items-end pb-4 border-b border-dw-line last:border-b-0 last:pb-0">
                            <div><p className="m-0 text-[14px] font-extrabold">{label}</p><p className="m-0 text-[12px] text-dw-caption">{when}</p></div>
                            <Field label="Naming series">{select(series, options.naming_series, 'ERPNext default')}</Field>
                            <Field label="Print format">{select(format, ['Standard', ...options.print_formats.filter(p => p !== 'Standard')], 'Choose…')}</Field>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="Repair order prints" note="The bag label prints on the Zebra at 1.5 × 1 in with a QR code to the order.">
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                    <Field label="Bag label format">{select('ro_label_print_format', options.repair_order_print_formats, 'Choose…')}</Field>
                    <div className="text-[12px] text-dw-caption self-end">Drop-off receipt prints with “DW RO Repair Order”; the condition report with “DW Product Visible Condition Report”.</div>
                </div>
            </Section>
            <UnsavedBar dirty={f.dirty} saving={f.busy} onSave={() => void f.commit()} onDiscard={f.discard} />
        </>
    );
};

const Pms: React.FC = () => {
    const [options, setOptions] = useState<{ item_groups: string[]; tax_accounts: string[]; sales_taxes_templates: string[]; item_tax_templates: string[] } | null>(null);
    const loader = useCallback(() => apiService.getPmsConfiguration().then(r => { setOptions(r.options); return r.config; }), []);
    const f = useSingle<PmsConfiguration>(loader, v => apiService.savePmsConfiguration(v));
    if (!f.value || !options) return <Spinner />;
    const v = f.value;
    const select = (k: keyof PmsConfiguration, list: string[]) => (
        <SelectInput value={String(v[k] || '')} onChange={e => f.set({ [k]: e.target.value } as Partial<PmsConfiguration>)}>
            <option value="">Choose…</option>
            {list.map(o => <option key={o} value={o}>{o}</option>)}
        </SelectInput>
    );
    const missing = v.pms_enabled ? (['pms_item_group', 'pms_vat_account', 'pms_disclaimer', 'standard_sales_taxes_template', 'standard_item_tax_template'] as const).filter(k => !String(v[k] || '').trim()) : [];
    return (
        <>
            <Section title="Profit margin scheme (Bahrain)" note="Pre-owned items pay VAT on the margin only. Purchase cost comes from stock valuation.">
                <Toggle checked={!!v.pms_enabled} onChange={c => f.set({ pms_enabled: c ? 1 : 0 })} label="PMS enabled" />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="PMS item group">{select('pms_item_group', options.item_groups)}</Field>
                    <Field label="VAT on margin account">{select('pms_vat_account', options.tax_accounts)}</Field>
                    <Field label="VAT divisor" hint="11 means 10% VAT included in the price.">
                        <TextInput type="number" inputMode="decimal" value={String(v.pms_vat_divisor ?? '')} onChange={e => f.set({ pms_vat_divisor: Number(e.target.value) })} />
                    </Field>
                    <Field label="Standard sales taxes template">{select('standard_sales_taxes_template', options.sales_taxes_templates)}</Field>
                    <Field label="Standard item tax template">{select('standard_item_tax_template', options.item_tax_templates)}</Field>
                    <Field label="PMS print format" hint="Set under Invoice series & printing (POS PMS)."><TextInput value={v.pms_print_format} disabled /></Field>
                    <div className="sm:col-span-2"><Field label="Disclaimer printed on PMS invoices"><TextArea rows={2} value={v.pms_disclaimer || ''} onChange={e => f.set({ pms_disclaimer: e.target.value })} /></Field></div>
                </div>
                {missing.length > 0 && <p className="m-0 mt-3 text-[13px] font-semibold text-dw-warning">While PMS is on, every field is needed.</p>}
            </Section>
            <UnsavedBar dirty={f.dirty} saving={f.busy} onSave={() => (missing.length ? undefined : void f.commit())} onDiscard={f.discard} message={missing.length ? 'Fill every field before saving' : undefined} />
        </>
    );
};

// ---------------------------------------------------------------- lists

interface Options {
    services: Array<{ value: string; label: string }>;
    categories: string[];
    brands: string[];
    modes_of_payment: string[];
    sales_person_groups: string[];
    users: Array<{ value: string; label: string }>;
}

type ListRow = Record<string, unknown> & { name?: string };

const ListEditor: React.FC<{ listKey: string; title: string; singular: string; fields: CrudField<ListRow>[]; blank: () => ListRow; description?: string; extra?: CrudField<ListRow>[]; onChanged?: () => void }> = ({ listKey, title, singular, fields, blank, description, extra = [], onChanged }) => {
    const toast = useToast();
    const [rows, setRows] = useState<ListRow[] | null>(null);
    const load = useCallback(() => call<ListRow[]>('setup_list', { key: listKey }).then(setRows).catch(e => { setRows([]); toast.error(e instanceof Error ? e.message : 'List did not load.'); }), [listKey, toast]);
    useEffect(() => { setRows(null); void load(); }, [load]);
    const editable = new Set(fields.map(f => f.key));
    return (
        <TemplateCrud<ListRow>
            title={title}
            singular={singular}
            description={description}
            fields={[...fields, ...extra.map(e => ({ ...e }))]}
            items={rows || []}
            loading={!rows}
            getId={r => String(r.name)}
            blank={blank}
            onSave={async (item, isNew) => {
                const doc = Object.fromEntries(Object.entries(item).filter(([k]) => editable.has(k)));
                try {
                    await call('setup_save', { key: listKey, doc: JSON.stringify(doc), name: isNew ? '' : item.name });
                    toast.success(isNew ? `${singular[0].toUpperCase()}${singular.slice(1)} added` : 'Saved');
                    await load();
                    onChanged?.();
                } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Not saved.');
                    throw e;
                }
            }}
            onDelete={async item => {
                try { await call('setup_delete', { key: listKey, name: item.name }); toast.success('Deleted'); await load(); onChanged?.(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not deleted.'); throw e; }
            }}
        />
    );
};

const useOptions = () => {
    const [o, setO] = useState<Options | null>(null);
    const reload = useCallback(() => call<Options>('setup_options').then(setO).catch(() => undefined), []);
    useEffect(() => { void reload(); }, [reload]);
    return { options: o, reload };
};

const active: CrudField<ListRow> = { key: 'is_active', label: 'Active', type: 'toggle', inList: true, hint: 'Off hides it from new orders; old orders keep it.' };
const order: CrudField<ListRow> = { key: 'display_order', label: 'Order', type: 'number', inList: true, hint: 'Lower shows first.' };
const desc: CrudField<ListRow> = { key: 'description', label: 'Description', type: 'textarea' };

const VOCAB = ['complaints', 'conditions', 'findings', 'work', 'movements', 'calibers'] as const;
type Vocab = typeof VOCAB[number];
const VOCAB_LABEL: Record<Vocab, string> = { complaints: 'Complaints', conditions: 'Conditions', findings: 'Diagnosis findings', work: 'Work needed', movements: 'Movement types', calibers: 'Calibers' };

const Vocabulary: React.FC = () => {
    const { options } = useOptions();
    const [tab, setTab] = useState<Vocab>('complaints');
    if (!options) return <Spinner />;
    const conf: Record<Vocab, { singular: string; fields: CrudField<ListRow>[]; blank: () => ListRow; description: string }> = {
        complaints: {
            singular: 'complaint', description: 'Chips at intake: what the customer says. A suggested service becomes a task until there is a diagnosis.',
            fields: [{ key: 'issue_name', label: 'Complaint', type: 'text', required: true, inList: true }, { key: 'suggested_task', label: 'Suggested service', type: 'select', options: options.services, inList: true }, desc, active, order],
            blank: () => ({ issue_name: '', suggested_task: '', description: '', is_active: 1, display_order: 0 }),
        },
        conditions: {
            singular: 'condition', description: 'Condition on arrival, printed on the drop-off receipt.',
            fields: [{ key: 'condition_name', label: 'Condition', type: 'text', required: true, inList: true }, { key: 'category', label: 'Group', type: 'select', options: options.categories, required: true, inList: true }, desc, active, order],
            blank: () => ({ condition_name: '', category: options.categories[0], description: '', is_active: 1, display_order: 0 }),
        },
        findings: { singular: 'finding', description: 'What the technician found, chosen in the diagnosis.', fields: [{ key: 'summary_name', label: 'Finding', type: 'text', required: true, inList: true }, desc, active], blank: () => ({ summary_name: '', description: '', is_active: 1 }) },
        work: { singular: 'work item', description: 'Work needed in the diagnosis. Each one also becomes a service with a price.', fields: [{ key: 'work_name', label: 'Work', type: 'text', required: true, inList: true }, desc, active], blank: () => ({ work_name: '', description: '', is_active: 1 }) },
        movements: { singular: 'movement type', description: 'Movement chips in the diagnosis.', fields: [{ key: 'movement_type', label: 'Movement type', type: 'text', required: true, inList: true }, desc, active], blank: () => ({ movement_type: '', description: '', is_active: 1 }) },
        calibers: { singular: 'caliber', description: 'Caliber suggestions in the diagnosis.', fields: [{ key: 'caliber_code', label: 'Caliber', type: 'text', required: true, inList: true }, desc, active], blank: () => ({ caliber_code: '', description: '', is_active: 1 }) },
    };
    const c = conf[tab];
    return (
        <Card>
            <div className="flex gap-1 overflow-x-auto -mx-1 px-1 mb-4" role="tablist" aria-label="List">
                {VOCAB.map(v => (
                    <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                        className={cx('shrink-0 h-9 px-3.5 rounded-full text-[13px] font-bold', tab === v ? 'bg-dw-text text-white' : 'bg-dw-sunken text-dw-body hover:text-dw-text')}>{VOCAB_LABEL[v]}</button>
                ))}
            </div>
            <ListEditor key={tab} listKey={tab} title={VOCAB_LABEL[tab]} {...c} />
        </Card>
    );
};

const Services: React.FC = () => (
    <Card>
        <ListEditor listKey="services" title="Services" singular="service" description="Default prices used when an estimate is made. Prices can still be changed per watch."
            fields={[{ key: 'task_name', label: 'Service', type: 'text', required: true, inList: true }, { key: 'default_rate', label: 'Default price', type: 'money', inList: true }, desc]}
            extra={[{ key: 'used_90d', label: 'Used, last 90 days', type: 'number', inList: true }]}
            blank={() => ({ task_name: '', default_rate: 0, description: '' })} />
    </Card>
);

const Catalogue: React.FC = () => {
    const { options, reload } = useOptions();
    if (!options) return <Spinner />;
    return (
        <>
            <Card>
                <ListEditor listKey="brands" title="Brands" singular="brand" description="Created on the fly at intake; tidy names here. Renaming updates every order."
                    fields={[{ key: 'brand_name', label: 'Brand', type: 'text', required: true, inList: true }, desc]}
                    extra={[{ key: 'models', label: 'Models', type: 'number', inList: true }, { key: 'watches', label: 'Watches seen', type: 'number', inList: true }]}
                    blank={() => ({ brand_name: '', description: '' })} onChanged={() => void reload()} />
            </Card>
            <Card>
                <ListEditor listKey="models" title="Models" singular="model"
                    fields={[{ key: 'brand', label: 'Brand', type: 'select', options: options.brands, required: true, inList: true }, { key: 'model_name', label: 'Model', type: 'text', required: true, inList: true }, desc]}
                    extra={[{ key: 'watches', label: 'Watches seen', type: 'number', inList: true }]}
                    blank={() => ({ brand: '', model_name: '', description: '' })} />
            </Card>
        </>
    );
};

const People: React.FC = () => {
    const { options } = useOptions();
    if (!options) return <Spinner />;
    return (
        <>
            <Card>
                <ListEditor listKey="technicians" title="Technicians" singular="technician"
                    description="Link each technician to their login so My bench shows their own watches only. Give that login the DW Technician role in Desk."
                    fields={[
                        { key: 'technician_name', label: 'Name', type: 'text', required: true, inList: true },
                        { key: 'user', label: 'Login', type: 'select', options: options.users, inList: true },
                        { key: 'phone', label: 'Phone', type: 'text', inList: true },
                        { key: 'email', label: 'Email', type: 'text' },
                        { key: 'notes', label: 'Notes', type: 'textarea' },
                    ]}
                    extra={[{ key: 'open_watches', label: 'Open watches', type: 'number', inList: true }]}
                    blank={() => ({ technician_name: '', user: '', phone: '', email: '', notes: '' })} />
            </Card>
            <Card>
                <ListEditor listKey="sales_persons" title="Sales people" singular="sales person" description="Chosen on the till for commission."
                    fields={[
                        { key: 'sales_person_name', label: 'Name', type: 'text', required: true, inList: true },
                        { key: 'parent_sales_person', label: 'Group', type: 'select', options: options.sales_person_groups, required: true },
                        { key: 'commission_rate', label: 'Commission %', type: 'number', inList: true },
                        { key: 'enabled', label: 'Active', type: 'toggle', inList: true },
                    ]}
                    blank={() => ({ sales_person_name: '', parent_sales_person: options.sales_person_groups[0] || '', commission_rate: 0, enabled: 1 })} />
            </Card>
            <Card>
                <ListEditor listKey="country_codes" title="Country codes" singular="country code" description="Offered when adding a customer. +973 always comes first."
                    fields={[{ key: 'country_name', label: 'Country', type: 'text', required: true, inList: true }, { key: 'code', label: 'Code', type: 'text', required: true, inList: true, hint: 'e.g. +966' }, order, active]}
                    blank={() => ({ country_name: '', code: '+', display_order: 0, is_active: 1 })} />
            </Card>
        </>
    );
};

interface PosProfile { name: string; company: string; warehouse: string; dw_default_customer?: string; customer_name?: string; dw_enable_auto_print?: number; dw_default_sales_person?: string; dw_default_commission_rate?: number }

const Payments: React.FC = () => {
    const toast = useToast();
    const { options } = useOptions();
    const [profiles, setProfiles] = useState<PosProfile[] | null>(null);
    const [edit, setEdit] = useState<PosProfile | null>(null);
    const [busy, setBusy] = useState(false);
    const [custQ, setCustQ] = useState('');
    const [custHits, setCustHits] = useState<Array<{ name: string; customer_name: string }>>([]);
    const [salesPeople, setSalesPeople] = useState<string[]>([]);
    const load = useCallback(() => call<PosProfile[]>('pos_profiles').then(setProfiles).catch(() => setProfiles([])), []);
    useEffect(() => { void load(); call<ListRow[]>('setup_list', { key: 'sales_persons' }).then(r => setSalesPeople(r.map(x => String(x.name)))).catch(() => undefined); }, [load]);
    useEffect(() => {
        if (custQ.trim().length < 2) { setCustHits([]); return; }
        const t = window.setTimeout(() => { apiService.getPosCustomers(custQ.trim()).then(r => setCustHits(r)).catch(() => setCustHits([])); }, 250);
        return () => window.clearTimeout(t);
    }, [custQ]);
    if (!options) return <Spinner />;
    const save = async () => {
        if (!edit) return;
        setBusy(true);
        try {
            await call('save_pos_profile', { name: edit.name, fields: JSON.stringify({ dw_default_customer: edit.dw_default_customer, dw_enable_auto_print: edit.dw_enable_auto_print, dw_default_sales_person: edit.dw_default_sales_person, dw_default_commission_rate: edit.dw_default_commission_rate }) });
            toast.success('POS profile saved'); setEdit(null); await load();
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
    };
    return (
        <>
            <Card>
                <ListEditor listKey="payment_modes" title="Payment modes" singular="payment mode" description="The buttons on every pay screen, in this order."
                    fields={[{ key: 'payment_mode', label: 'Mode (ERPNext)', type: 'select', options: options.modes_of_payment, required: true, inList: true }, order, active]}
                    blank={() => ({ payment_mode: '', display_order: 0, is_active: 1 })} />
            </Card>
            <Section title="POS profiles" note="Walk-in customer, auto print and the default sales person for the till.">
                {!profiles ? <Spinner /> : profiles.map(p => (
                    <button key={p.name} type="button" onClick={() => { setEdit(p); setCustQ(''); }} className="w-full flex flex-wrap items-center gap-3 py-3 border-b border-dw-line last:border-b-0 text-left hover:bg-dw-ground -mx-2 px-2 rounded">
                        <span className="flex-1 min-w-[160px]"><span className="block text-[14px] font-extrabold">{p.name}</span><span className="block text-[12px] text-dw-caption">{p.warehouse}</span></span>
                        <span className="text-[13px] text-dw-body">{p.customer_name || 'No walk-in customer'}</span>
                        <span className="text-[13px] text-dw-body">{p.dw_default_sales_person || 'No sales person'}</span>
                        <span className={cx('text-[12px] font-bold', p.dw_enable_auto_print ? 'text-dw-success' : 'text-dw-caption')}>Auto print {p.dw_enable_auto_print ? 'on' : 'off'}</span>
                        <Icon name="chevronRight" size={16} className="text-dw-caption" />
                    </button>
                ))}
            </Section>
            <Sheet open={!!edit} onClose={() => setEdit(null)} title={`POS profile ${edit?.name || ''}`} dismissable={!busy}
                footer={<><Button variant="ghost" onClick={() => setEdit(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save</Button></>}>
                {edit && (
                    <div className="flex flex-col gap-4">
                        <Field label="Walk-in customer" hint="Used when the cashier does not pick a customer.">
                            <div>
                                <p className="m-0 mb-1.5 text-[14px] font-bold">{edit.customer_name || edit.dw_default_customer || 'None'}</p>
                                <TextInput value={custQ} onChange={e => setCustQ(e.target.value)} placeholder="Change: search name or mobile" aria-label="Find walk-in customer" />
                                {custHits.length > 0 && (
                                    <div className="mt-1 border border-dw-border rounded-dw-control max-h-[180px] overflow-y-auto">
                                        {custHits.map(h => <button key={h.name} type="button" onClick={() => { setEdit({ ...edit, dw_default_customer: h.name, customer_name: h.customer_name }); setCustQ(''); }} className="block w-full px-3 py-2 text-left text-[13px] border-b border-dw-line last:border-b-0 hover:bg-dw-ground">{h.customer_name}</button>)}
                                    </div>
                                )}
                            </div>
                        </Field>
                        <Toggle checked={!!edit.dw_enable_auto_print} onChange={c => setEdit({ ...edit, dw_enable_auto_print: c ? 1 : 0 })} label="Print the receipt after each sale" />
                        <Field label="Default sales person" optional>
                            <SelectInput value={edit.dw_default_sales_person || ''} onChange={e => setEdit({ ...edit, dw_default_sales_person: e.target.value })}>
                                <option value="">None</option>
                                {salesPeople.map(s => <option key={s} value={s}>{s}</option>)}
                            </SelectInput>
                        </Field>
                        <Field label="Default commission %" optional>
                            <TextInput type="number" inputMode="decimal" value={String(edit.dw_default_commission_rate ?? 0)} onChange={e => setEdit({ ...edit, dw_default_commission_rate: Number(e.target.value) || 0 })} />
                        </Field>
                    </div>
                )}
            </Sheet>
        </>
    );
};

// ---------------------------------------------------------------- screen

const SettingsScreen: React.FC<{ section: string }> = ({ section }) => {
    const [q, setQ] = useState('');
    const all = GROUPS.flatMap(g => g.items);
    const current = (all.find(i => i.id === section) ?? all[0]).id;
    useEffect(() => { if (section !== current) navigate(`/settings/${current}`, { replace: true }); }, [section, current]);
    const groups = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return GROUPS;
        return GROUPS.map(g => ({ ...g, items: g.items.filter(i => `${i.label} ${i.keywords}`.toLowerCase().includes(needle)) })).filter(g => g.items.length);
    }, [q]);

    return (
        <div className="max-w-[1320px] mx-auto flex flex-col lg:flex-row gap-5 items-start">
            <nav aria-label="Settings sections" className="w-full lg:w-[260px] shrink-0 lg:sticky lg:top-4">
                <h1 className="m-0 mb-3 text-[22px] lg:text-[24px] font-extrabold">Settings</h1>
                {/* Phones: one select instead of the long list */}
                <SelectInput className="lg:hidden" aria-label="Settings section" value={current} onChange={e => navigate(`/settings/${e.target.value}`, { replace: true })}>
                    {GROUPS.map(g => <optgroup key={g.label} label={g.label}>{g.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}
                </SelectInput>
                <TextInput type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a setting" aria-label="Find a setting" className="mb-3 hidden lg:block" />
                {groups.map(g => (
                    <div key={g.label} className="mb-3 hidden lg:block">
                        <p className="m-0 mb-1 px-2 text-[11px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{g.label}</p>
                        {g.items.map(i => (
                            <Link key={i.id} to={`/settings/${i.id}`} replace aria-current={i.id === current ? 'page' : undefined}
                                className={cx('block px-2.5 py-2 rounded-[10px] text-[14px] font-bold no-underline', i.id === current ? 'bg-dw-text text-white' : 'text-dw-body hover:bg-dw-sunken hover:text-dw-text')}>
                                {i.label}
                            </Link>
                        ))}
                    </div>
                ))}
                {groups.length === 0 && <p className="m-0 px-2 text-[13px] text-dw-caption hidden lg:block">No setting matches “{q}”.</p>}
            </nav>
            <section className="w-full flex-1 min-w-0 flex flex-col gap-4">
                {current === 'company' && <Company />}
                {current === 'workflows' && <Workflows />}
                {current === 'pms' && <Pms />}
                {current === 'payments' && <Payments />}
                {current === 'vocabulary' && <Vocabulary />}
                {current === 'services' && <Services />}
                {current === 'catalogue' && <Catalogue />}
                {current === 'people' && <People />}
                {current === 'whatsapp' && <WhatsAppCentre />}
            </section>
        </div>
    );
};

export default SettingsScreen;
