/**
 * Component kit gallery (Phase 0 "storybook" page), served at /kit.
 * Every v2 component with live state, so the look can be checked on desk
 * and phone before any real screen moves over.
 */
import React, { useState } from 'react';
import { WatchStatus } from '../types';
import { STAGES, stageOfWatch, summariseOrder, type StageId } from './stages';
import { landingFor } from './nav';
import {
    AppShell, Button, Card, Chips, ConfirmSheet, DataTable, DatePicker, EmptyState, Field, ICON_NAMES, Icon,
    IconButton, MoneyInput, PaymentModes, PeriodControl, PhotoRow, QueueRow, SearchField, SectionLabel, Segmented,
    SelectInput, Sheet, StageBadge, StageSelect, StageStrip, TemplateCrud, TextInput, Toggle, UnsavedBar,
    WatchStageBadges, formatMoney, normaliseQuery, paymentError, periodFor, toISODate, useToast,
    type PaymentValue, type Period, type Photo, type StageChange,
} from './kit';

const SECTIONS = [
    ['tokens', 'Tokens'], ['stages', 'Stages'], ['buttons', 'Buttons'], ['inputs', 'Inputs'], ['choice', 'Choice'],
    ['queue', 'Queue row'], ['table', 'Table'], ['feedback', 'Sheets & toasts'], ['money', 'Payment'],
    ['photos', 'Photos'], ['settings', 'Settings editor'], ['period', 'Period'], ['icons', 'Icons'], ['routes', 'Routes'],
] as const;

const Section: React.FC<{ id: string; title: string; note?: string; children: React.ReactNode }> = ({ id, title, note, children }) => (
    <section id={id} className="scroll-mt-20 flex flex-col gap-3">
        <div>
            <h2 className="m-0 text-[20px] font-extrabold tracking-[-.01em]">{title}</h2>
            {note && <p className="m-0 mt-1 text-[14px] text-dw-caption max-w-[720px]">{note}</p>}
        </div>
        {children}
    </section>
);

const SWATCHES: Array<[string, string]> = [
    ['ground', '--dw-ground'], ['surface', '--dw-surface'], ['sunken', '--dw-sunken'], ['border', '--dw-border'],
    ['text', '--dw-text'], ['caption', '--dw-caption'], ['accent', '--dw-accent'], ['success', '--dw-success'],
    ['warning', '--dw-warning'], ['danger', '--dw-danger'],
];

const STATUS_ROWS: Array<{ status: WatchStatus; parts?: boolean }> = [
    { status: WatchStatus.Pending }, { status: WatchStatus.UnderDiagnosis }, { status: WatchStatus.Diagnosed },
    { status: WatchStatus.CreateEstimate }, { status: WatchStatus.Quoted }, { status: WatchStatus.Approved },
    { status: WatchStatus.InRepair }, { status: WatchStatus.InRepair, parts: true }, { status: WatchStatus.Completed },
    { status: WatchStatus.NotRepairable }, { status: WatchStatus.Declined }, { status: WatchStatus.Delivered },
];

interface ServiceRow extends Record<string, unknown> {
    id: string;
    service: string;
    category: string;
    rate: number | null;
    active: number;
    notes: string;
}

interface Sale { id: string; date: string; customer: string; items: number; total: number }

const SALES: Sale[] = [
    { id: 'SINV-0412', date: '2026-10-18', customer: 'Fatima Al Khalifa', items: 2, total: 64.5 },
    { id: 'SINV-0411', date: '2026-10-18', customer: 'Walk-in', items: 1, total: 12 },
    { id: 'SINV-0409', date: '2026-10-17', customer: 'Ahmed Janahi', items: 3, total: 141.75 },
];

const demoPhoto = (hue: number, label: string): Photo => ({
    id: label,
    label,
    url: `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="hsl(${hue} 30% 85%)"/><circle cx="36" cy="36" r="18" fill="none" stroke="hsl(${hue} 30% 40%)" stroke-width="4"/></svg>`)}`,
});

const KitGallery: React.FC = () => {
    const toast = useToast();
    const [stage, setStage] = useState<StageId>('repair');
    const [query, setQuery] = useState('');
    const [lastSearch, setLastSearch] = useState('');
    const [complaints, setComplaints] = useState<string[]>(['Stopped', 'Battery']);
    const [priority, setPriority] = useState<'Normal' | 'Urgent' | 'VIP'>('Normal');
    const [filter, setFilter] = useState<string | null>('ready');
    const [sendWa, setSendWa] = useState(true);
    const [printLabel, setPrintLabel] = useState(false);
    const [amount, setAmount] = useState<number | null>(18.5);
    const [date, setDate] = useState<string | null>(toISODate(new Date()));
    const [sheet, setSheet] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [payment, setPayment] = useState<PaymentValue>({ kind: 'single', mode: 'Cash', tendered: null });
    const [photos, setPhotos] = useState<Photo[]>([demoPhoto(30, 'Front'), demoPhoto(210, 'Back')]);
    const [services, setServices] = useState<ServiceRow[]>([
        { id: '1', service: 'Battery replacement', category: 'Quartz', rate: 5, active: 1, notes: '' },
        { id: '2', service: 'Full service', category: 'Automatic', rate: 45, active: 1, notes: 'Includes demagnetise' },
        { id: '3', service: 'Crystal replacement', category: 'Case', rate: 18, active: 0, notes: '' },
    ]);
    const [shopName, setShopName] = useState('Watch Doctor');
    const [savedShopName, setSavedShopName] = useState('Watch Doctor');
    const [period, setPeriod] = useState<Period>(periodFor('week', toISODate(new Date())));

    const total = 42.75;
    const payErr = paymentError(payment, total);

    const onStage = async (c: StageChange) => {
        await new Promise(r => setTimeout(r, 400));
        const prev = stage;
        setStage(c.to);
        toast.show({
            message: `Stage set to ${STAGES.find(s => s.id === c.to)?.label}${c.reason ? ` · ${c.reason}` : ''}${c.returnAs ? ` (${c.returnAs})` : ''}`,
            action: { label: 'Undo', onClick: () => setStage(prev) },
        });
    };

    return (
        <AppShell title="Component kit">
            <div className="max-w-[1080px] mx-auto flex flex-col gap-10 pb-16">
                <header className="flex flex-col gap-3">
                    <div>
                        <SectionLabel>Watch Doctor v2 · Phase 0</SectionLabel>
                        <h1 className="m-0 mt-1 text-[28px] font-extrabold tracking-[-.02em]">Component kit</h1>
                        <p className="m-0 mt-1 text-[14px] text-dw-caption max-w-[720px]">
                            Every building block of the new screens, live. Resize to phone width to see sheets, tabs and rows switch layout.
                        </p>
                    </div>
                    <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
                        {SECTIONS.map(([id, label]) => (
                            <a key={id} href={`#${id}`} className="h-8 px-3 rounded-full bg-dw-surface border border-dw-border text-[12px] font-bold text-dw-text no-underline hover:bg-dw-sunken flex items-center">{label}</a>
                        ))}
                    </nav>
                </header>

                <Section id="tokens" title="Tokens" note="Manrope, cream ground, one accent. Colours are CSS variables on :root and Tailwind dw-* classes.">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {SWATCHES.map(([name, v]) => (
                            <div key={name} className="rounded-dw-control border border-dw-border overflow-hidden bg-dw-surface">
                                <div className="h-12" style={{ background: `var(${v})` }} />
                                <div className="px-2.5 py-1.5"><div className="text-[12px] font-extrabold">{name}</div><div className="text-[11px] text-dw-caption font-mono">{v}</div></div>
                            </div>
                        ))}
                    </div>
                    <Card className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                        <span className="text-[28px] font-extrabold tracking-[-.02em]">Page 28/800</span>
                        <span className="text-[20px] font-extrabold">Section 20/800</span>
                        <span className="text-[15px] font-bold">Body 15/700</span>
                        <span className="text-[14px] text-dw-body">Text 14/500</span>
                        <span className="text-[12px] font-semibold text-dw-caption">Caption 12/600</span>
                    </Card>
                </Section>

                <Section id="stages" title="Stages" note="One vocabulary for every screen. The backend's 11 watch statuses map onto 8 stages plus the Waiting parts flag. Only the desk changes stages.">
                    <Card className="flex flex-wrap gap-2">
                        {STAGES.map(s => <StageBadge key={s.id} stage={s.id} />)}
                        <StageBadge stage="parts" />
                        <StageBadge stage="overdue">Overdue 2d</StageBadge>
                    </Card>
                    <div className="grid lg:grid-cols-2 gap-3">
                        <Card className="flex flex-col gap-4">
                            <SectionLabel>Stepper · desk</SectionLabel>
                            <StageStrip stage={stage} />
                            <SectionLabel>Stepper · phone</SectionLabel>
                            <StageStrip stage={stage} compact />
                        </Card>
                        <Card className="flex flex-col gap-3">
                            <SectionLabel>Stage select · desk only</SectionLabel>
                            <p className="m-0 text-[13px] text-dw-caption">Forward moves apply at once with an Undo toast. Moving back or to "To return" asks for a reason first.</p>
                            <div className="max-w-[280px]"><StageSelect value={stage} onChange={onStage} /></div>
                        </Card>
                    </div>
                    <DataTable
                        caption="Backend status to stage"
                        dense
                        rowKey={r => `${r.status}${r.parts ? '-p' : ''}`}
                        rows={STATUS_ROWS}
                        columns={[
                            { key: 'status', header: 'DW Repair Item status', render: r => <span className="font-semibold">{r.status}{r.parts ? ' + awaiting_parts' : ''}</span> },
                            { key: 'stage', header: 'Shown as', render: r => { const s = stageOfWatch({ status: r.status, awaiting_parts: r.parts ? 1 : 0 }); return <WatchStageBadges stage={s.stage} waitingParts={s.waitingParts} />; } },
                        ]}
                    />
                    <p className="m-0 text-[13px] text-dw-caption">
                        Order summary example: <strong className="text-dw-text">{summariseOrder([{ status: WatchStatus.InRepair }, { status: WatchStatus.Completed }, { status: WatchStatus.Approved, awaiting_parts: 1 }])}</strong>
                    </p>
                </Section>

                <Section id="buttons" title="Buttons" note="42 px on desk, 44 px on phones. One primary action per view.">
                    <Card className="flex flex-wrap items-center gap-2">
                        <Button variant="primary" icon="plus">New order</Button>
                        <Button icon="print">Print</Button>
                        <Button variant="ghost">Cancel</Button>
                        <Button variant="success" icon="check">Collect</Button>
                        <Button variant="danger" icon="trash">Delete</Button>
                        <Button variant="primary" busy>Saving</Button>
                        <Button disabled>Disabled</Button>
                        <Button size="sm">Small</Button>
                        <Button size="lg" variant="primary">Large phone</Button>
                        <IconButton icon="whatsapp" label="Message customer" />
                        <IconButton icon="more" label="More actions" variant="ghost" />
                    </Card>
                </Section>

                <Section id="inputs" title="Inputs" note="Search strips spaces and the +973 prefix from phone numbers. Money is BHD with 3 decimals. Dates are native pickers.">
                    <div className="grid lg:grid-cols-2 gap-3">
                        <Card className="flex flex-col gap-4">
                            <SearchField value={query} onChange={setQuery} onSearch={setLastSearch} onScan={() => toast.show({ message: 'Camera scanning arrives in Phase 5', tone: 'info' })} />
                            <p className="m-0 text-[13px] text-dw-caption">Searches for: <strong className="text-dw-text font-mono">{lastSearch || '—'}</strong> {query && <span>(normalised now: {normaliseQuery(query)})</span>}</p>
                            <Field label="Customer name" htmlFor="kit-name" hint="As it should print on the invoice.">
                                <TextInput id="kit-name" placeholder="Fatima Al Khalifa" />
                            </Field>
                            <Field label="Technician" htmlFor="kit-tech" error="Pick a technician before starting diagnosis.">
                                <SelectInput id="kit-tech" defaultValue=""><option value="">Unassigned</option><option>Ravi</option><option>Anil</option></SelectInput>
                            </Field>
                        </Card>
                        <Card className="flex flex-col gap-4">
                            <Field label="Rate" htmlFor="kit-rate" hint={`Stored as ${amount == null ? 'empty' : amount}`}>
                                <MoneyInput id="kit-rate" value={amount} onChange={setAmount} />
                            </Field>
                            <Field label="Promised date" hint={date ?? 'none'}>
                                <DatePicker value={date} onChange={setDate} quick={[0, 3, 7, 14]} aria-label="Promised date" />
                            </Field>
                        </Card>
                    </div>
                </Section>

                <Section id="choice" title="Chips, segmented, toggles" note="Chips wrap instead of scrolling. Booleans are toggles, never checkboxes.">
                    <div className="grid lg:grid-cols-2 gap-3">
                        <Card className="flex flex-col gap-4">
                            <Field label="Complaints"><Chips multiple label="Complaints" value={complaints} onChange={setComplaints} options={['Stopped', 'Battery', 'Losing time', 'Strap', 'Crystal', 'Water inside', 'Crown'].map(v => ({ value: v, label: v }))} /></Field>
                            <Field label="Queue filter"><Chips label="Queue filter" allowNone value={filter} onChange={setFilter} options={[{ value: 'overdue', label: 'Overdue', count: 2 }, { value: 'ready', label: 'Ready', count: 3 }, { value: 'unassigned', label: 'Unassigned', count: 3 }]} /></Field>
                        </Card>
                        <Card className="flex flex-col gap-4">
                            <Field label="Priority"><Segmented<'Normal' | 'Urgent' | 'VIP'> label="Priority" value={priority} onChange={setPriority} options={[{ value: 'Normal', label: 'Normal' }, { value: 'Urgent', label: 'Urgent' }, { value: 'VIP', label: 'VIP' }]} /></Field>
                            <Toggle label="Send WhatsApp on create" description="Uses the order received template" checked={sendWa} onChange={setSendWa} />
                            <Toggle label="Print bag label" checked={printLabel} onChange={setPrintLabel} />
                        </Card>
                    </div>
                </Section>

                <Section id="queue" title="Queue row" note="One row per watch with its next action. The row opens the order; the button does the action.">
                    <Card pad={false} className="overflow-hidden">
                        <QueueRow to="/orders/2610-0042" orderNo="2610-0042" customer="Fatima Al Khalifa" phone="3355 1234" watch="Rolex Datejust 36" stage="ready" due="Ready 9 days" overdue technician="Ravi" note="Remind sent 3d ago" action={{ label: 'Collect', icon: 'check', primary: true, onClick: () => toast.success('Opens collect for #2610-0042') }} />
                        <QueueRow to="/orders/2610-0051" orderNo="2610-0051" customer="Ahmed Janahi" watch="Omega Seamaster 300" stage="estimate" due="Promised Tue 21" technician="Anil" action={{ label: 'Send estimate', icon: 'whatsapp', onClick: () => toast.success('Opens estimate for #2610-0051') }} />
                        <QueueRow to="/orders/2610-0055" orderNo="2610-0055" customer="Mariam Hasan" watch="Casio G-Shock GA-2100" stage="received" due="Promised Mon 20" technician={null} action={{ label: 'Assign', icon: 'user', onClick: () => toast.show({ message: 'Assign sheet opens here', tone: 'info' }) }} />
                        <QueueRow to="/orders/2610-0038" orderNo="2610-0038" customer="Yusuf Al Sayed" watch="Seiko Presage SRPB41" stage="repair" waitingParts due="Parts due Thu 23" technician="Ravi" />
                    </Card>
                </Section>

                <Section id="table" title="Table" note="One table style. Numbers align right with tabular figures; the card scrolls sideways on phones.">
                    <DataTable<Sale>
                        caption="Recent sales"
                        rows={SALES}
                        rowKey={r => r.id}
                        onRowClick={r => toast.show({ message: `Open ${r.id}`, tone: 'info' })}
                        columns={[
                            { key: 'id', header: 'Invoice', render: r => <span className="font-extrabold">{r.id}</span> },
                            { key: 'date', header: 'Date' },
                            { key: 'customer', header: 'Customer' },
                            { key: 'items', header: 'Items', numeric: true },
                            { key: 'total', header: 'Total (BHD)', numeric: true, render: r => formatMoney(r.total, '') },
                        ]}
                    />
                    <DataTable<Sale> rows={[]} rowKey={r => r.id} columns={[{ key: 'id', header: 'Invoice' }]} empty={{ title: 'No unpaid invoices', body: 'Credit sales show here until they are settled.' }} />
                </Section>

                <Section id="feedback" title="Sheets, confirm and toasts" note="Bottom sheet on phones, dialog on desk. Confirm only for money and deletes. Toasts replace alert().">
                    <Card className="flex flex-wrap gap-2">
                        <Button onClick={() => setSheet(true)}>Open sheet</Button>
                        <Button variant="danger" onClick={() => setConfirm(true)}>Delete payment</Button>
                        <Button onClick={() => toast.success('Estimate sent on WhatsApp')}>Success toast</Button>
                        <Button onClick={() => toast.error('WhatsApp is not connected. Check Settings.')}>Error toast</Button>
                        <Button onClick={() => toast.show({ message: 'Marked ready', action: { label: 'Undo', onClick: () => toast.show({ message: 'Undone', tone: 'info' }) } })}>Toast with undo</Button>
                    </Card>
                    <EmptyState icon="watch" title="No watches waiting on you" body="New jobs appear here as soon as the desk assigns them." action={<Button icon="search">Find an order</Button>} />
                </Section>

                <Section id="money" title="Payment modes" note="Shared by Collect, POS and POS back office. Button grid by default, list only when split. Change due is shown for cash.">
                    <Card className="flex flex-col gap-4 max-w-[560px]">
                        <div className="flex items-baseline justify-between"><span className="text-[14px] font-bold text-dw-caption">Total</span><span className="text-[22px] font-extrabold tabular-nums">{formatMoney(total)}</span></div>
                        <PaymentModes modes={['Cash', 'Card', 'Benefit Pay', 'Bank transfer']} total={total} value={payment} onChange={setPayment} />
                        {payErr && <p className="m-0 text-[13px] font-semibold text-dw-warning" role="status">{payErr}</p>}
                        <Button variant="primary" size="lg" disabled={!!payErr} onClick={() => toast.success(`Paid ${formatMoney(total)}`)}>Take payment</Button>
                    </Card>
                </Section>

                <Section id="photos" title="Photo row" note="On phones the add button opens the rear camera directly.">
                    <Card>
                        <PhotoRow
                            photos={photos}
                            onAdd={files => setPhotos(p => [...p, ...files.map(f => ({ id: `${f.name}-${f.lastModified}`, url: URL.createObjectURL(f), label: f.name }))])}
                            onRemove={ph => setPhotos(p => p.filter(x => x.id !== ph.id))}
                            onOpen={ph => toast.show({ message: `Open ${ph.label}`, tone: 'info' })}
                        />
                    </Card>
                </Section>

                <Section id="settings" title="Settings editor" note="One generic editor behind every settings list, plus the unsaved-changes bar for forms.">
                    <TemplateCrud<ServiceRow>
                        title="Services"
                        singular="service"
                        items={services}
                        getId={s => s.id}
                        blank={() => ({ id: '', service: '', category: '', rate: null, active: 1, notes: '' })}
                        fields={[
                            { key: 'service', label: 'Service', type: 'text', required: true, inList: true },
                            { key: 'category', label: 'Category', type: 'select', options: ['Quartz', 'Automatic', 'Case', 'Strap'], inList: true },
                            { key: 'rate', label: 'Rate', type: 'money', inList: true, hint: 'Default price on estimates; staff can change it per order.' },
                            { key: 'active', label: 'Offered on new orders', type: 'toggle', inList: true },
                            { key: 'notes', label: 'Notes', type: 'textarea' },
                        ]}
                        onSave={async (s, isNew) => {
                            await new Promise(r => setTimeout(r, 300));
                            setServices(list => (isNew ? [...list, { ...s, id: String(Date.now()) }] : list.map(x => (x.id === s.id ? s : x))));
                            toast.success(isNew ? 'Service added' : 'Service saved');
                        }}
                        onDelete={async s => { setServices(list => list.filter(x => x.id !== s.id)); toast.success('Service deleted'); }}
                    />
                    <Card className="flex flex-col gap-3 max-w-[560px]">
                        <Field label="Shop name on receipts" htmlFor="kit-shop"><TextInput id="kit-shop" value={shopName} onChange={e => setShopName(e.target.value)} /></Field>
                        <p className="m-0 text-[12px] text-dw-caption">Edit the name to see the bar.</p>
                    </Card>
                    <UnsavedBar dirty={shopName !== savedShopName} onDiscard={() => setShopName(savedShopName)} onSave={() => { setSavedShopName(shopName); toast.success('Settings saved'); }} />
                </Section>

                <Section id="period" title="Period control" note="One control for all four reports. The week starts on Sunday.">
                    <Card className="flex flex-col gap-2">
                        <PeriodControl value={period} onChange={setPeriod} />
                        <p className="m-0 text-[13px] text-dw-caption font-mono">from {period.from} to {period.to}</p>
                    </Card>
                </Section>

                <Section id="icons" title="Icons" note="Stroke icons on a 24 px grid. Decorative unless they stand alone.">
                    <Card className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                        {ICON_NAMES.map(n => (
                            <div key={n} className="flex flex-col items-center gap-1.5 py-2 text-dw-text">
                                <Icon name={n} size={22} />
                                <span className="text-[11px] font-semibold text-dw-caption">{n}</span>
                            </div>
                        ))}
                    </Card>
                </Section>

                <Section id="routes" title="Routes" note="Real URLs, so refresh, back and QR deep links work. Screens marked old still render the current component until their phase ships.">
                    <DataTable
                        dense
                        rowKey={r => r.path}
                        rows={[
                            { path: '/', screen: 'Role landing', state: `Owner ${landingFor(['executive'])} · desk ${landingFor(['data_entry'])} · technician ${landingFor(['technician'])}` },
                            { path: '/desk', screen: 'Front desk', state: 'Old Order Tracker until Phase 1' },
                            { path: '/bench', screen: 'My bench', state: 'Old order list until Phase 1' },
                            { path: '/orders', screen: 'Orders', state: 'Old order list; ?status= and ?q= work' },
                            { path: '/orders/:name', screen: 'Order', state: 'Old order page, now linkable' },
                            { path: '/intake', screen: 'New order', state: 'Old intake wizard until Phase 2' },
                            { path: '/pos', screen: 'Point of sale', state: 'Old POS until Phase 3' },
                            { path: '/dashboard', screen: 'Dashboard', state: 'Old dashboard until Phase 4' },
                            { path: '/reports', screen: 'Reports', state: 'Old reports hub until Phase 4' },
                            { path: '/settings', screen: 'Settings', state: 'Old settings until Phase 4' },
                            { path: '/kit', screen: 'This page', state: 'New' },
                        ]}
                        columns={[
                            { key: 'path', header: 'URL', render: r => <code className="font-mono text-[13px] font-bold">{r.path}</code> },
                            { key: 'screen', header: 'Screen' },
                            { key: 'state', header: 'Phase 0 state', render: r => <span className="text-dw-caption">{r.state}</span> },
                        ]}
                    />
                </Section>
            </div>

            <Sheet
                open={sheet}
                onClose={() => setSheet(false)}
                title="Assign technician"
                description="Rolex Datejust 36 · #2610-0042"
                footer={<><Button variant="ghost" onClick={() => setSheet(false)}>Cancel</Button><Button variant="primary" onClick={() => { setSheet(false); toast.success('Assigned to Ravi'); }}>Assign</Button></>}
            >
                <div className="flex flex-col gap-2">
                    {['Ravi · 6 open', 'Anil · 5 open', 'Unassigned'].map(t => (
                        <label key={t} className="flex items-center gap-3 h-11 px-3 rounded-dw-control border border-dw-border has-[:checked]:border-dw-accent has-[:checked]:bg-dw-accent-soft cursor-pointer">
                            <input type="radio" name="kit-tech-sheet" defaultChecked={t.startsWith('Ravi')} className="accent-[#456FBF]" />
                            <span className="text-[14px] font-bold">{t}</span>
                        </label>
                    ))}
                </div>
            </Sheet>
            <ConfirmSheet
                open={confirm}
                onClose={() => setConfirm(false)}
                tone="danger"
                title="Delete this payment?"
                body="BHD 20.000 cash from 18 Oct will be removed and the invoice goes back to unpaid."
                confirmLabel="Delete payment"
                onConfirm={async () => { await new Promise(r => setTimeout(r, 500)); toast.success('Payment deleted'); }}
            />
        </AppShell>
    );
};

export default KitGallery;
