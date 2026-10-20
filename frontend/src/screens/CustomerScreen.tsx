/**
 * Customers (canvas D8): a search list and one profile per customer with
 * repairs, retail invoices, messages, known watches, money owed and a note.
 */
import React, { useEffect, useState } from 'react';
import { Link, navigate, path as buildPath, useLocation } from '../router';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, EmptyState, Field, Icon, SearchField, Sheet, Spinner, StageBadge, TextArea, TextInput, cx, formatDay, useToast,
} from '../design/kit';
import { orderLeadStage, summariseOrder } from '../design/stages';
import { getCustomerProfile, listCustomers, updateCustomer, type CustomerProfile, type CustomerRow } from '../services/tillApi';

export const CustomersScreen: React.FC = () => {
    const { query } = useLocation();
    const [text, setText] = useState(query.get('q') || '');
    const [search, setSearch] = useState(query.get('q') || '');
    const [rows, setRows] = useState<CustomerRow[] | null>(null);
    useEffect(() => {
        setRows(null);
        listCustomers(search).then(setRows).catch(() => setRows([]));
        navigate(`/customers${search ? `?q=${encodeURIComponent(search)}` : ''}`, { replace: true });
    }, [search]);
    return (
        <div className="max-w-[1000px] mx-auto">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="m-0 flex-1 text-[22px] lg:text-[24px] font-extrabold">Customers</h1>
                <Button variant="primary" icon="plus" onClick={() => navigate('/intake')}>New repair order</Button>
            </div>
            <SearchField className="mt-4" size="lg" value={text} onChange={setText} onSearch={setSearch} label="Find a customer" placeholder="Name, mobile or WhatsApp number" autoFocus />
            <p className="m-0 mt-2 mb-3 text-[12px] font-semibold text-dw-caption">{search ? 'Search ignores spaces and +973.' : 'Customers with the most recent repairs.'}</p>
            {!rows ? <div className="flex justify-center py-12"><Spinner size={24} /></div> : rows.length === 0 ? (
                <Card><EmptyState icon="users" title="No customer matches" body="New customers are added when you take in a repair or make a sale." /></Card>
            ) : (
                <Card pad={false} className="overflow-hidden">
                    {rows.map(r => (
                        <Link key={r.name} to={buildPath('customers', r.name)} className="flex items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0 no-underline text-dw-text hover:bg-dw-ground">
                            <span className="w-10 h-10 rounded-[12px] bg-dw-sunken flex items-center justify-center text-[13px] font-extrabold shrink-0">{initials(r.customer_name)}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[15px] font-extrabold truncate">{r.customer_name}</span>
                                <span className="block text-[12px] font-semibold text-dw-caption truncate">{[r.mobile_no, `${r.orders} ${r.orders === 1 ? 'repair' : 'repairs'}`, r.open_orders ? `${r.open_orders} open` : '', r.last_order && `last ${formatDay(r.last_order)}`].filter(Boolean).join(' · ')}</span>
                            </span>
                            <Icon name="chevronRight" size={18} className="text-dw-caption" />
                        </Link>
                    ))}
                </Card>
            )}
        </div>
    );
};

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';

type Tab = 'repairs' | 'retail' | 'messages' | 'notes';

const EditSheet: React.FC<{ open: boolean; onClose: () => void; p: CustomerProfile; onSaved: () => void }> = ({ open, onClose, p, onSaved }) => {
    const toast = useToast();
    const [f, setF] = useState({ customer_name: p.customer_name, mobile: p.mobile_no, whatsapp: p.whatsapp_no, email: p.email_id });
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setF({ customer_name: p.customer_name, mobile: p.mobile_no, whatsapp: p.whatsapp_no, email: p.email_id }); }, [open, p]);
    const save = async () => {
        setBusy(true);
        try { await updateCustomer(p.name, f); toast.success('Customer saved'); onSaved(); onClose(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Not saved.'); } finally { setBusy(false); }
    };
    return (
        <Sheet open={open} onClose={onClose} title="Edit customer" dismissable={!busy}
            footer={<><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!f.customer_name.trim()} onClick={() => void save()}>Save</Button></>}>
            <div className="flex flex-col gap-4">
                <Field label="Full name"><TextInput value={f.customer_name} onChange={e => setF({ ...f, customer_name: e.target.value })} /></Field>
                <Field label="Mobile" hint="Include the country code, e.g. +973 3xxx xxxx"><TextInput type="tel" value={f.mobile} onChange={e => setF({ ...f, mobile: e.target.value })} /></Field>
                <Field label="WhatsApp" optional hint="Only if different from the mobile"><TextInput type="tel" value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: e.target.value })} /></Field>
                <Field label="Email" optional><TextInput type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
            </div>
        </Sheet>
    );
};

export const CustomerScreen: React.FC<{ name: string }> = ({ name }) => {
    const { formatCurrency } = useAppConfig();
    const toast = useToast();
    const [p, setP] = useState<CustomerProfile | null>(null);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<Tab>('repairs');
    const [edit, setEdit] = useState(false);
    const [note, setNote] = useState('');
    const [savingNote, setSavingNote] = useState(false);

    const load = () => getCustomerProfile(name).then(r => { setP(r); setNote(r.notes); }).catch(e => setError(e instanceof Error ? e.message : 'Could not open this customer.'));
    useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [name]);

    if (error) return <Card className="max-w-md mx-auto mt-10"><EmptyState icon="alert" title="Customer not found" body={error} action={<Button onClick={() => navigate('/customers')}>All customers</Button>} /></Card>;
    if (!p) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

    const wa = (p.whatsapp_no || p.mobile_no).replace(/[^\d]/g, '');
    const tabs: Array<[Tab, string, number?]> = [['repairs', 'Repairs', p.orders.length], ['retail', 'Retail', p.retail.length], ['messages', 'Messages', p.messages.length], ['notes', 'Notes']];
    const btn = 'inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-dw-border-strong text-[13px] font-bold text-dw-text no-underline hover:bg-dw-ground';

    const saveNote = async () => {
        setSavingNote(true);
        try { await updateCustomer(p.name, { notes: note }); toast.success('Note saved'); await load(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Note not saved.'); } finally { setSavingNote(false); }
    };

    return (
        <div className="max-w-[1180px] mx-auto">
            <Card className="flex flex-wrap items-center gap-4">
                <span className="w-14 h-14 rounded-[16px] bg-dw-sunken flex items-center justify-center text-[18px] font-extrabold shrink-0">{initials(p.customer_name)}</span>
                <div className="flex-1 min-w-[200px]">
                    <h1 className="m-0 text-[22px] font-extrabold">{p.customer_name}</h1>
                    <p className="m-0 mt-0.5 text-[13px] text-dw-body">
                        {[p.mobile_no || 'No mobile', p.whatsapp_no && p.whatsapp_no !== p.mobile_no ? `WhatsApp ${p.whatsapp_no}` : '', p.email_id, `customer since ${formatDay(p.since)}`].filter(Boolean).join(' · ')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {p.mobile_no && <a className={btn} href={`tel:${p.mobile_no.replace(/\s/g, '')}`}><Icon name="phone" size={16} />Call</a>}
                    {wa.length >= 8 && <a className={btn} href={`https://wa.me/${wa.length === 8 ? `973${wa}` : wa}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={16} />WhatsApp</a>}
                    <Button size="sm" icon="edit" onClick={() => setEdit(true)}>Edit</Button>
                    <Button size="sm" variant="primary" icon="plus" onClick={() => navigate('/intake')}>New repair</Button>
                    <Button size="sm" onClick={() => navigate('/pos')}>Retail sale</Button>
                </div>
            </Card>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    [String(p.stats.orders), `Repair orders${p.stats.open_orders ? ` · ${p.stats.open_orders} open` : ''}`, ''],
                    [formatCurrency(p.stats.repairs_billed), 'Repairs billed', ''],
                    [formatCurrency(p.stats.retail), 'Retail purchases', ''],
                    [formatCurrency(p.stats.outstanding), 'Outstanding', p.stats.outstanding > 0 ? 'text-dw-warning' : 'text-dw-success'],
                ].map(([n, l, tone]) => (
                    <Card key={l} className="py-3">
                        <p className={cx('m-0 text-[20px] font-extrabold tabular-nums', tone)}>{n}</p>
                        <p className="m-0 text-[12px] font-bold text-dw-caption">{l}</p>
                    </Card>
                ))}
            </div>

            <div className="mt-4 flex flex-col lg:flex-row gap-5 items-start">
                <Card pad={false} className="w-full lg:flex-1 min-w-0 overflow-hidden">
                    <div className="flex gap-1 px-2 border-b border-dw-border overflow-x-auto" role="tablist">
                        {tabs.map(([id, label, count]) => (
                            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                                className={cx('shrink-0 h-11 px-3.5 border-b-2 text-[14px] font-bold', tab === id ? 'border-dw-text text-dw-text' : 'border-transparent text-dw-caption hover:text-dw-text')}>
                                {label}{count ? <span className="ml-1.5 text-dw-caption">{count}</span> : null}
                            </button>
                        ))}
                    </div>
                    {tab === 'repairs' && (p.orders.length === 0 ? <EmptyState icon="wrench" title="No repairs yet" /> : p.orders.map(o => {
                        const doc = o.docstatus === 1 || o.status === 'Delivered' ? 1 : 0;
                        const ws = o.watches.map(w => ({ status: w.status, awaiting_parts: w.awaiting_parts }));
                        return (
                            <Link key={o.name} to={buildPath('orders', o.name)} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0 no-underline text-dw-text hover:bg-dw-ground">
                                <span className="w-[100px] text-[14px] font-extrabold">{o.name}</span>
                                <span className="flex-1 min-w-[160px] text-[14px] truncate">{o.watches.map(w => [w.watch_brand, w.watch_model].filter(Boolean).join(' ')).join(' · ')}</span>
                                <StageBadge stage={orderLeadStage(ws, doc)}>{summariseOrder(ws, doc)}</StageBadge>
                                <span className="w-[90px] text-[12px] font-semibold text-dw-caption">{formatDay(o.received_date)}</span>
                                <span className="w-[100px] text-right text-[14px] font-extrabold tabular-nums">{o.invoiced_amount ? formatCurrency(o.invoiced_amount) : o.quotation_amount ? formatCurrency(o.quotation_amount) : '—'}</span>
                            </Link>
                        );
                    }))}
                    {tab === 'retail' && (p.retail.length === 0 ? <EmptyState icon="pos" title="No retail purchases" /> : p.retail.map(r => (
                        <div key={r.name} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-dw-line last:border-b-0">
                            <span className="w-[130px] text-[14px] font-extrabold">{r.name}</span>
                            <span className="flex-1 min-w-[160px] text-[14px] truncate">{r.items.join(' · ')}{r.dw_has_pms_items ? ' (PMS)' : ''}</span>
                            {r.is_return ? <StageBadge stage="return" dot={false}>Return</StageBadge>
                                : r.outstanding_amount > 0 ? <StageBadge stage="customer" dot={false}>{formatCurrency(r.outstanding_amount)} due</StageBadge>
                                    : <StageBadge stage="ready" dot={false}>Paid{r.modes.length ? ` · ${r.modes.join(', ').toLowerCase()}` : ''}</StageBadge>}
                            <span className="w-[90px] text-[12px] font-semibold text-dw-caption">{formatDay(r.posting_date)}</span>
                            <span className="w-[100px] text-right text-[14px] font-extrabold tabular-nums">{formatCurrency(r.grand_total)}</span>
                        </div>
                    )))}
                    {tab === 'messages' && (p.messages.length === 0 ? <EmptyState icon="whatsapp" title="No WhatsApp messages" body={p.whatsapp_enabled ? undefined : 'WhatsApp is not switched on.'} /> : (
                        <div className="px-4">
                            {p.messages.map(m => (
                                <div key={m.name} className="py-3 border-b border-dw-line last:border-b-0 text-[13px]">
                                    <p className="m-0"><strong>{formatDay(m.sent_at || m.creation)} · {m.label}</strong> · {m.status.toLowerCase()}{m.by ? ` · ${m.by}` : ''}{m.repair_order && <> · <Link to={buildPath('orders', m.repair_order)}>{m.repair_order}</Link></>}</p>
                                    {m.message_body && <p className="m-0 mt-1 text-dw-body line-clamp-2">{m.message_body}</p>}
                                </div>
                            ))}
                        </div>
                    ))}
                    {tab === 'notes' && (
                        <div className="p-4">
                            <TextArea value={note} onChange={e => setNote(e.target.value)} rows={5} aria-label="Note about this customer" placeholder="Staff only, e.g. prefers original parts, collects on Saturdays" />
                            <div className="flex justify-end mt-2"><Button size="sm" variant="primary" busy={savingNote} disabled={note === p.notes} onClick={() => void saveNote()}>Save note</Button></div>
                        </div>
                    )}
                </Card>

                <aside className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
                    <Card>
                        <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Watches we know</h2>
                        {p.watches.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">None yet.</p> : p.watches.slice(0, 10).map((w, i) => (
                            <div key={i} className="flex justify-between gap-3 py-2 border-b border-dw-line last:border-b-0 text-[13px]">
                                <span className="font-bold truncate">{w.watch || 'Watch'}</span>
                                <span className="text-dw-caption shrink-0">{[w.serial, `${w.repairs} ${w.repairs === 1 ? 'repair' : 'repairs'}`].filter(Boolean).join(' · ')}</span>
                            </div>
                        ))}
                    </Card>
                    {p.notes && tab !== 'notes' && (
                        <Card>
                            <h2 className="m-0 mb-1 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">Note</h2>
                            <p className="m-0 text-[13px] whitespace-pre-wrap">{p.notes}</p>
                        </Card>
                    )}
                </aside>
            </div>
            <EditSheet open={edit} onClose={() => setEdit(false)} p={p} onSaved={() => void load()} />
        </div>
    );
};
