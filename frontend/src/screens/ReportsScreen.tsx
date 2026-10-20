/**
 * Reports (canvas D12 / M8): four reports, one period control. Each report
 * turns its data into the same blocks (tiles, tables, bar lists), so screen,
 * print / PDF and Excel always show the same thing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, navigate, path as buildPath } from '../router';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import {
    Button, Card, EmptyState, Icon, PeriodControl, Spinner, cx, formatDay, periodFor, periodLabel, toISODate, type Period,
} from '../design/kit';
import { apiFetchRaw } from '../services/apiService';
import { downloadExcel, type ExcelCell } from '../components/reports/exportExcel';

export type ReportId = 'workshop' | 'sales' | 'cash' | 'profit';

const REPORTS: Array<{ id: ReportId; title: string; sub: string; ownerOnly?: boolean; method: string }> = [
    { id: 'workshop', title: 'Workshop', sub: 'orders, technicians, complaints, parts', method: 'report_workshop' },
    { id: 'sales', title: 'Sales & purchases', sub: 'retail, repairs, purchases, unpaid', method: 'report_sales' },
    { id: 'cash', title: 'Cash & bank', sub: 'money in and out, by mode and account', method: 'report_cash' },
    { id: 'profit', title: 'Profit & loss', sub: 'owner only · margins, PMS VAT, expenses', ownerOnly: true, method: 'report_profit' },
];

// ---------------------------------------------------------------- blocks

type Num = number | null | undefined;
interface Col { key: string; label: string; kind?: 'money' | 'number' | 'date' | 'pct' | 'text'; link?: (row: Row) => string | null }
type Row = Record<string, unknown>;
type Block =
    | { kind: 'table'; title: string; cols: Col[]; rows: Row[]; footer?: Row; note?: string; limit?: number }
    | { kind: 'bars'; title: string; rows: Array<{ label: string; value: number; display: string }>; note?: string }
    | { kind: 'kv'; title: string; rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }>; note?: string };
interface View { tiles: Array<{ label: string; value: string; sub?: string; tone?: 'good' | 'bad' }>; blocks: Block[] }

type Fmt = (n: number) => string;

const pct = (n: Num) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);

const workshopView = (d: Row, money: Fmt): View => {
    const est = (d.estimates || {}) as Row;
    return {
        tiles: [
            { label: 'Orders received', value: String(d.orders_received), sub: `${d.watches_received} watches` },
            { label: 'Watches collected', value: String(d.watches_collected), sub: 'by the date handed over' },
            { label: 'Received → collected', value: d.turnaround_avg != null ? `${d.turnaround_avg} d` : '—', sub: d.turnaround_median != null ? `median ${d.turnaround_median} d` : undefined },
            { label: 'Estimates approved', value: est.conversion_rate_pct != null ? `${Math.round(Number(est.conversion_rate_pct))}%` : '—', sub: `${est.quoted_and_invoiced ?? 0} of ${est.quoted_orders ?? 0} estimates` },
        ],
        blocks: [
            { kind: 'table', title: 'Technicians · finished in period / open now', cols: [{ key: 'name', label: 'Technician' }, { key: 'finished', label: 'Finished', kind: 'number' }, { key: 'open_now', label: 'Open now', kind: 'number' }], rows: d.technicians as Row[] },
            { kind: 'bars', title: 'Top complaints', rows: ((d.complaints as Row[]) || []).map(c => ({ label: String(c.issue), value: Number(c.share), display: `${c.watches} · ${c.share}%` })) },
            { kind: 'bars', title: 'Brands serviced', rows: ((d.top_brands as Row[]) || []).map(b => ({ label: String(b.watch_brand), value: Number(b.watches_serviced), display: String(b.watches_serviced) })) },
            { kind: 'table', title: 'Parts used on these orders', cols: [{ key: 'item_name', label: 'Part' }, { key: 'qty', label: 'Qty', kind: 'number' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: d.parts as Row[] },
            {
                kind: 'table', title: 'Orders received in the period', limit: 200,
                cols: [
                    { key: 'name', label: 'Order', link: r => buildPath('orders', String(r.name)) },
                    { key: 'customer_name', label: 'Customer' },
                    { key: 'watch_list', label: 'Watches' },
                    { key: 'received_date', label: 'Received', kind: 'date' },
                    { key: 'state', label: 'Status' },
                    { key: 'invoiced_amount', label: 'Invoiced', kind: 'money' },
                ],
                rows: ((d.orders as Row[]) || []).map(o => ({
                    ...o,
                    watch_list: ((o.watches as Row[]) || []).map(w => [w.watch_brand, w.watch_model].filter(Boolean).join(' ')).join(' · '),
                    state: o.docstatus === 1 ? 'Collected' : String(o.status),
                })),
                footer: { name: `${d.orders_received} orders`, watch_list: `${d.watches_received} watches`, invoiced_amount: d.invoiced },
            },
        ],
    };
};

const sumMode = (a: Row[] = [], b: Row[] = []) => {
    const m = new Map<string, number>();
    [...a, ...b].forEach(r => m.set(String(r.mode_of_payment || 'Other'), (m.get(String(r.mode_of_payment || 'Other')) || 0) + Number(r.total || 0)));
    return [...m.entries()].map(([mode, total]) => ({ mode_of_payment: mode, total }));
};

const salesView = (d: Row, money: Fmt): View => {
    const purchases = Number(d.total_pe_purchases || 0) + Number(d.total_paid_purchases || 0) + Number(d.total_unpaid_purchases || 0);
    const net = Number(d.net_sales || 0);
    const pay = (d.payment_breakdown as Row[]) || [];
    const cat = (d.category_breakdown as Row[]) || [];
    const max = (rows: Row[], k: string) => Math.max(1, ...rows.map(r => Number(r[k] || 0)));
    return {
        tiles: [
            { label: 'Net retail & B2B sales', value: money(net), sub: `${d.transaction_count} invoices, after returns` },
            { label: 'Repair invoices', value: money(Number(d.repair_sales || 0)) },
            { label: 'Purchases', value: money(purchases), sub: `${money(Number(d.total_unpaid_purchases || 0))} unpaid` },
            { label: 'Unpaid sales', value: money(Number(d.total_unpaid_sales || 0)), tone: Number(d.total_unpaid_sales) > 0 ? 'bad' : undefined },
        ],
        blocks: [
            {
                kind: 'kv', title: 'By channel', rows: [
                    { label: 'Retail (POS)', value: money(Number(d.total_retail_sales || 0)) },
                    { label: 'B2B / custom', value: money(Number(d.total_b2b_sales || 0)) },
                    { label: 'Returns', value: money(-Math.abs(Number(d.total_returns || 0))) },
                    { label: 'Net retail & B2B', value: money(net), strong: true },
                    { label: 'Repair invoices (separate)', value: money(Number(d.repair_sales || 0)), muted: true },
                ],
            },
            { kind: 'bars', title: 'By payment mode', rows: pay.map(p => ({ label: String(p.mode_of_payment), value: (Number(p.total) / max(pay, 'total')) * 100, display: `${money(Number(p.total))} · ${p.txn_count}` })) },
            { kind: 'bars', title: 'By item group', rows: cat.slice(0, 10).map(c => ({ label: String(c.item_group), value: (Number(c.total_amount) / max(cat, 'total_amount')) * 100, display: money(Number(c.total_amount)) })) },
            { kind: 'table', title: 'Top items sold at the till', cols: [{ key: 'item_name', label: 'Item' }, { key: 'pms', label: '' }, { key: 'qty', label: 'Qty', kind: 'number' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: ((d.items_sold as Row[]) || []).map(i => ({ ...i, pms: i.is_pms ? 'PMS' : '' })) },
            { kind: 'table', title: 'Sales by cashier', cols: [{ key: 'owner', label: 'Cashier' }, { key: 'count', label: 'Invoices', kind: 'number' }, { key: 'total', label: 'Total', kind: 'money' }], rows: (d.cashier_breakdown as Row[]) || [] },
            { kind: 'table', title: 'Paid purchases by mode', cols: [{ key: 'mode_of_payment', label: 'Mode' }, { key: 'total', label: 'Paid', kind: 'money' }], rows: sumMode(d.pe_purchases_by_mode as Row[], d.paid_purchases_by_mode as Row[]) },
            { kind: 'table', title: 'Unpaid sales invoices', note: 'Shown once, here. Collect them under Point of sale → Collect payment.', cols: [{ key: 'name', label: 'Invoice' }, { key: 'party_name', label: 'Customer' }, { key: 'grand_total', label: 'Total', kind: 'money' }, { key: 'outstanding_amount', label: 'Outstanding', kind: 'money' }], rows: (d.unpaid_sales_invoices as Row[]) || [], footer: { name: 'Total', outstanding_amount: d.total_unpaid_sales } },
            { kind: 'table', title: 'Unpaid purchase invoices', cols: [{ key: 'name', label: 'Invoice' }, { key: 'party_name', label: 'Supplier' }, { key: 'grand_total', label: 'Total', kind: 'money' }, { key: 'outstanding_amount', label: 'Outstanding', kind: 'money' }], rows: (d.unpaid_purchase_invoices as Row[]) || [], footer: { name: 'Total', outstanding_amount: d.total_unpaid_purchases } },
            { kind: 'table', title: 'Largest sales invoices', cols: [{ key: 'name', label: 'Invoice' }, { key: 'party_name', label: 'Customer' }, { key: 'payment_status', label: 'Status' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: (d.top_sales_invoices as Row[]) || [] },
            { kind: 'table', title: 'Largest purchase invoices', cols: [{ key: 'name', label: 'Invoice' }, { key: 'party_name', label: 'Supplier' }, { key: 'payment_status', label: 'Status' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: (d.top_purchase_invoices as Row[]) || [] },
        ],
    };
};

const cashView = (d: Row, money: Fmt): View => {
    const n = (k: string) => Number(d[k] || 0);
    return {
        tiles: [
            { label: 'Money in', value: money(n('kpi_income')) },
            { label: 'Money out', value: money(n('kpi_outflow')) },
            { label: 'Net', value: money(n('net_cash')), tone: n('net_cash') < 0 ? 'bad' : 'good' },
            { label: 'Cash & bank at close', value: money(n('gl_total_closing_balance')), sub: `opened at ${money(n('gl_total_opening_balance'))}` },
        ],
        blocks: [
            {
                kind: 'kv', title: 'Money in', rows: [
                    { label: 'Retail sales (POS)', value: money(n('total_retail_sales')) },
                    { label: 'B2B sales', value: money(n('total_b2b_sales')) },
                    { label: 'Repair invoices', value: money(n('repair_revenue')) },
                    { label: 'Collections on credit', value: money(n('total_customer_collections')) },
                    { label: 'Journal receipts', value: money(n('je_receipt_total')) },
                    { label: 'Other receipts', value: money(n('total_other_receipts')) },
                    { label: 'Refunds paid out', value: money(-n('cash_refunded_returns')) },
                    { label: 'Less credit sales not yet paid', value: money(-n('unpaid_credit_sales')) },
                    { label: 'Less written off', value: money(-n('total_written_off')) },
                    { label: 'Money actually in', value: money(n('total_income')), strong: true },
                ],
            },
            {
                kind: 'kv', title: 'Money out', rows: [
                    { label: 'Supplier purchases', value: money(n('purchase_total')) },
                    { label: 'Expenses', value: money(n('other_expenses_total')) },
                    { label: 'Total out', value: money(n('total_outflow')), strong: true },
                    { label: 'Internal transfers (not money out)', value: money(n('gl_transfer_total')), muted: true },
                ],
            },
            { kind: 'table', title: 'By payment mode', cols: [{ key: 'mode_of_payment', label: 'Mode' }, { key: 'total_debit', label: 'In', kind: 'money' }, { key: 'total_credit', label: 'Out', kind: 'money' }, { key: 'net', label: 'Net', kind: 'money' }], rows: (d.gl_mode_summary as Row[]) || [] },
            {
                kind: 'table', title: 'By cash and bank account',
                cols: [{ key: 'account', label: 'Account' }, { key: 'opening_balance', label: 'Opening', kind: 'money' }, { key: 'total_debit', label: 'In', kind: 'money' }, { key: 'total_credit', label: 'Out', kind: 'money' }, { key: 'closing_balance', label: 'Closing', kind: 'money' }],
                rows: (d.gl_account_summary as Row[]) || [],
                footer: { account: 'Total', opening_balance: d.gl_total_opening_balance, total_debit: d.gl_total_cash_in, total_credit: d.gl_total_cash_out, closing_balance: d.gl_total_closing_balance },
            },
            { kind: 'table', title: 'Largest payments out', cols: [{ key: 'name', label: 'Entry' }, { key: 'category', label: 'Type' }, { key: 'party_or_account', label: 'Paid to' }, { key: 'mode_of_payment', label: 'Mode' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: (d.top_outflow_entries as Row[]) || [] },
            { kind: 'table', title: `Internal transfers${d.internal_transfers_count ? ` · ${d.internal_transfers_count}` : ''}`, cols: [{ key: 'voucher', label: 'Voucher' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: (d.internal_transfers as Row[]) || [] },
            { kind: 'table', title: `Refunds to customers${d.customer_refunds_count ? ` · ${d.customer_refunds_count}` : ''}`, cols: [{ key: 'voucher', label: 'Invoice' }, { key: 'customer', label: 'Customer' }, { key: 'mode_of_payment', label: 'Mode' }, { key: 'amount', label: 'Amount', kind: 'money' }], rows: (d.customer_refunds as Row[]) || [] },
        ],
    };
};

const profitView = (d: Row, money: Fmt): View => {
    const cur = (d.current || {}) as Row;
    const prev = (d.previous || {}) as Row;
    const n = (r: Row, k: string) => Number(r[k] || 0);
    const change = (k: string) => { const a = n(cur, k); const b = n(prev, k); return b ? ((a - b) / Math.abs(b)) * 100 : null; };
    const line = (label: string, k: string, sign = 1) => ({ label, this: sign * n(cur, k), last: sign * n(prev, k), change: pct(change(k)) });
    const pms = ((d.pms as Row)?.summary || {}) as Row;
    const groups = (cur.item_group_breakdown as Row[]) || [];
    const prevExp = new Map(((prev.expense_by_account as Row[]) || []).map(e => [String(e.account), Number(e.total)]));
    return {
        tiles: [
            { label: 'Revenue incl. VAT', value: money(n(cur, 'gross_revenue')), sub: change('gross_revenue') == null ? 'nothing last period' : `${pct(change('gross_revenue'))} vs last` },
            { label: 'Gross profit', value: money(n(cur, 'gross_profit')), sub: `${n(cur, 'gross_margin_pct').toFixed(1)}% margin` },
            { label: 'Expenses', value: money(n(cur, 'operating_expenses_total')) },
            { label: 'Net profit', value: money(n(cur, 'net_profit')), sub: `${n(cur, 'net_margin_pct').toFixed(1)}% margin`, tone: n(cur, 'net_profit') < 0 ? 'bad' : 'good' },
        ],
        blocks: [
            {
                kind: 'table', title: `This period vs last (${formatDay(String(prev.from_date))} – ${formatDay(String(prev.to_date))})`,
                cols: [{ key: 'label', label: 'Line' }, { key: 'this', label: 'This', kind: 'money' }, { key: 'last', label: 'Last', kind: 'money' }, { key: 'change', label: 'Change' }],
                rows: [
                    line('Repair invoices', 'repair_revenue_gross'), line('Retail sales', 'retail_sales_gross'), line('B2B sales', 'b2b_sales_gross'), line('Returns', 'returns_gross', -1),
                    line('Revenue incl. VAT', 'gross_revenue'), line('VAT (standard + PMS margin)', 'vat_collected', -1), line('Revenue excl. VAT', 'net_revenue'),
                    line('Cost of parts and goods', 'cogs_amount', -1), line('Gross profit', 'gross_profit'), line('Expenses', 'operating_expenses_total', -1),
                ],
                footer: line('Net profit', 'net_profit') as unknown as Row,
            },
            {
                kind: 'table', title: 'Margin by item group',
                cols: [{ key: 'item_group', label: 'Item group' }, { key: 'qty_sold', label: 'Qty', kind: 'number' }, { key: 'sales_amount', label: 'Sales', kind: 'money' }, { key: 'cogs_amount', label: 'Cost', kind: 'money' }, { key: 'gross_profit', label: 'Profit', kind: 'money' }, { key: 'margin', label: 'Margin' }],
                rows: groups.map(g => ({ ...g, margin: Number(g.sales_amount) ? `${((Number(g.gross_profit) / Number(g.sales_amount)) * 100).toFixed(0)}%` : '—' })),
            },
            {
                kind: 'kv', title: 'PMS VAT register', note: 'For the NBR VAT return: VAT on the margin of pre-owned items only.', rows: [
                    { label: `PMS sales (${pms.item_count ?? 0} items)`, value: money(Number(pms.total_sales || 0)) },
                    { label: 'Purchase cost', value: money(Number(pms.total_purchase_cost || 0)) },
                    { label: 'Margin', value: money(Number(pms.total_margin || 0)) },
                    { label: 'VAT on margin', value: money(Number(pms.total_vat || 0)), strong: true },
                ],
            },
            {
                kind: 'table', title: 'Expenses by account',
                cols: [{ key: 'account', label: 'Account' }, { key: 'total', label: 'This', kind: 'money' }, { key: 'last', label: 'Last', kind: 'money' }],
                rows: ((cur.expense_by_account as Row[]) || []).map(e => ({ ...e, last: prevExp.get(String(e.account)) ?? 0 })),
                footer: { account: 'Total', total: cur.operating_expenses_total, last: prev.operating_expenses_total },
            },
            {
                kind: 'table', title: 'PMS sales', cols: [{ key: 'invoice', label: 'Invoice' }, { key: 'posting_date', label: 'Date', kind: 'date' }, { key: 'item_name', label: 'Item' }, { key: 'selling_price', label: 'Price', kind: 'money' }, { key: 'purchase_cost', label: 'Cost', kind: 'money' }, { key: 'margin', label: 'Margin', kind: 'money' }, { key: 'vat_amount', label: 'VAT', kind: 'money' }],
                rows: ((d.pms as Row)?.rows as Row[]) || [],
            },
        ],
    };
};

const VIEWS: Record<ReportId, (d: Row, money: Fmt) => View> = { workshop: workshopView, sales: salesView, cash: cashView, profit: profitView };

// ---------------------------------------------------------------- rendering

const cellText = (c: Col, v: unknown, money: Fmt): string => {
    if (v == null || v === '') return c.kind === 'money' ? '' : '';
    if (c.kind === 'money') return money(Number(v));
    if (c.kind === 'number') return String(Math.round(Number(v) * 1000) / 1000);
    if (c.kind === 'date') return formatDay(String(v));
    return String(v);
};

const TableBlock: React.FC<{ b: Extract<Block, { kind: 'table' }>; money: Fmt }> = ({ b, money }) => {
    const [all, setAll] = useState(false);
    const cap = b.limit ?? 15;
    const rows = all ? b.rows : b.rows.slice(0, cap);
    const right = (c: Col) => c.kind === 'money' || c.kind === 'number';
    return (
        <>
            {b.rows.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">Nothing in this period.</p> : (
                <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full border-collapse text-[13px]">
                        <thead><tr className="text-[11px] uppercase tracking-[.05em] text-dw-caption">{b.cols.map(c => <th key={c.key} className={cx('py-2 px-2 first:pl-0 border-b border-dw-border font-extrabold', right(c) ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr></thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-b border-dw-line">
                                    {b.cols.map(c => {
                                        const text = cellText(c, r[c.key], money);
                                        const href = c.link?.(r);
                                        return <td key={c.key} className={cx('py-2 px-2 first:pl-0', right(c) && 'text-right tabular-nums', c === b.cols[0] && 'font-bold')}>{href ? <Link to={href}>{text}</Link> : text}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        {b.footer && <tfoot><tr>{b.cols.map(c => <td key={c.key} className={cx('py-2 px-2 first:pl-0 font-extrabold border-t border-dw-border', right(c) && 'text-right tabular-nums')}>{cellText(c, b.footer![c.key], money)}</td>)}</tr></tfoot>}
                    </table>
                </div>
            )}
            {b.rows.length > cap && <button type="button" onClick={() => setAll(a => !a)} className="mt-2 text-[13px] font-bold text-dw-accent">{all ? 'Show fewer' : `Show all ${b.rows.length}`}</button>}
        </>
    );
};

const BlockView: React.FC<{ b: Block; money: Fmt }> = ({ b, money }) => (
    <Card className={cx(b.kind === 'table' && b.cols.length >= 4 && 'lg:col-span-2')}>
        <h2 className="m-0 mb-3 text-[12px] font-extrabold tracking-[.06em] uppercase text-dw-caption">{b.title}</h2>
        {b.kind === 'table' && <TableBlock b={b} money={money} />}
        {b.kind === 'bars' && (b.rows.length === 0 ? <p className="m-0 text-[13px] text-dw-caption">Nothing in this period.</p> : b.rows.map(r => (
            <div key={r.label} className="flex items-center gap-3 py-1.5 text-[13px]" title={`${r.label}: ${r.display}`}>
                <span className="w-[38%] truncate font-bold">{r.label}</span>
                <span className="flex-1 h-2 rounded-full bg-dw-sunken overflow-hidden"><span className="block h-full rounded-full bg-dw-accent" style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }} /></span>
                <span className="w-[120px] text-right font-bold tabular-nums">{r.display}</span>
            </div>
        )))}
        {b.kind === 'kv' && b.rows.map(r => (
            <div key={r.label} className={cx('flex justify-between gap-3 py-2 border-b border-dw-line last:border-b-0 text-[14px]', r.muted && 'text-dw-caption')}>
                <span className={cx(r.strong ? 'font-extrabold' : 'font-semibold', !r.muted && !r.strong && 'text-dw-body')}>{r.label}</span>
                <span className={cx('tabular-nums', r.strong ? 'font-extrabold' : 'font-bold')}>{r.value}</span>
            </div>
        ))}
        {b.note && <p className="m-0 mt-2 text-[12px] font-semibold text-dw-caption">{b.note}</p>}
    </Card>
);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Print / PDF: a plain A4 page of the same blocks, opened inside the click. */
const printView = (title: string, period: string, view: View, money: Fmt, logo: string) => {
    const w = window.open('', '_blank');
    if (!w) return false;
    const block = (b: Block) => {
        if (b.kind === 'kv') return `<h2>${esc(b.title)}</h2><table>${b.rows.map(r => `<tr${r.strong ? ' class="s"' : ''}><td>${esc(r.label)}</td><td class="n">${esc(r.value)}</td></tr>`).join('')}</table>`;
        if (b.kind === 'bars') return `<h2>${esc(b.title)}</h2><table>${b.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="n">${esc(r.display)}</td></tr>`).join('')}</table>`;
        const right = (c: Col) => c.kind === 'money' || c.kind === 'number';
        return `<h2>${esc(b.title)}</h2>${b.rows.length ? `<table><thead><tr>${b.cols.map(c => `<th${right(c) ? ' class="n"' : ''}>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${b.cols.map(c => `<td${right(c) ? ' class="n"' : ''}>${esc(cellText(c, r[c.key], money))}</td>`).join('')}</tr>`).join('')}</tbody>${b.footer ? `<tfoot><tr>${b.cols.map(c => `<td${right(c) ? ' class="n"' : ''}>${esc(cellText(c, b.footer![c.key], money))}</td>`).join('')}</tr></tfoot>` : ''}</table>` : '<p>Nothing in this period.</p>'}`;
    };
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} · ${esc(period)}</title><style>
        @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#1F2933;font-size:11px}
        header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1F2933;padding-bottom:8px;margin-bottom:12px}
        header img{max-height:40px}h1{font-size:18px;margin:0}.p{color:#6F685E;font-weight:bold}
        .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.tile{border:1px solid #ccc;border-radius:6px;padding:6px 8px}.tile b{display:block;font-size:15px}
        h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 4px;color:#444}
        table{width:100%;border-collapse:collapse;page-break-inside:auto}th,td{padding:3px 4px;border-bottom:1px solid #ddd;text-align:left}th{font-size:10px;color:#555}
        .n{text-align:right}tfoot td,.s td{font-weight:bold;border-top:1px solid #333}
    </style></head><body><header><div><h1>${esc(title)}</h1><div class="p">${esc(period)}</div></div>${logo ? `<img src="${esc(logo)}" alt="">` : ''}</header>
    <div class="tiles">${view.tiles.map(t => `<div class="tile">${esc(t.label)}<b>${esc(t.value)}</b>${t.sub ? esc(t.sub) : ''}</div>`).join('')}</div>
    ${view.blocks.map(block).join('')}<p class="p">Printed ${esc(new Date().toLocaleString('en-GB'))}</p>
    <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
    return true;
};

const excelView = (title: string, period: Period, view: View, money: Fmt) => {
    const rows: ExcelCell[][] = [[title], [periodLabel(period)], []];
    view.tiles.forEach(t => rows.push([t.label, t.value, t.sub || '']));
    view.blocks.forEach(b => {
        rows.push([], [b.title.toUpperCase()]);
        if (b.kind === 'kv') b.rows.forEach(r => rows.push([r.label, r.value]));
        else if (b.kind === 'bars') b.rows.forEach(r => rows.push([r.label, r.display]));
        else {
            rows.push(b.cols.map(c => c.label));
            const cell = (c: Col, v: unknown): ExcelCell => (c.kind === 'money' || c.kind === 'number' ? (v == null || v === '' ? null : Number(v)) : c.kind === 'date' ? { date: v as string } : (v == null ? '' : String(v)));
            b.rows.forEach(r => rows.push(b.cols.map(c => cell(c, r[c.key]))));
            if (b.footer) rows.push(b.cols.map(c => cell(c, b.footer![c.key])));
        }
    });
    downloadExcel(`${title.toLowerCase().replace(/[^a-z]+/g, '-')}-${period.from}-${period.to}`, { name: title.slice(0, 30), columns: Array.from({ length: 8 }, (_, i) => ({ header: '', width: i === 0 ? 34 : 16 })), rows });
    void money;
};

// ---------------------------------------------------------------- screen

const ReportsScreen: React.FC<{ report: ReportId }> = ({ report }) => {
    const { hasRole } = useAuth();
    const { formatCurrency, config } = useAppConfig();
    const owner = hasRole('executive');
    const visible = REPORTS.filter(r => !r.ownerOnly || owner);
    const current = visible.find(r => r.id === report) ?? visible[0];
    const [period, setPeriod] = useState<Period>(() => periodFor('day', toISODate(new Date())));
    const [data, setData] = useState<Row | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (current.id !== report) navigate(`/reports/${current.id}`, { replace: true }); }, [current.id, report]);
    useEffect(() => {
        let live = true;
        setLoading(true);
        setError('');
        apiFetchRaw(`/api/method/watch_doctor.api.${current.method}`, { method: 'POST', body: JSON.stringify({ from_date: period.from, to_date: period.to }) })
            .then(r => { if (live) setData(r.message); })
            .catch(e => { if (live) { setData(null); setError(e instanceof Error ? e.message : 'The report did not load.'); } })
            .finally(() => live && setLoading(false));
        return () => { live = false; };
    }, [current.method, period]);

    // Negative amounts read "−BHD 5.000", and -0 never shows.
    const money = useCallback((x: number) => (Math.abs(x) < 0.0005 ? formatCurrency(0) : x < 0 ? `−${formatCurrency(-x)}` : formatCurrency(x)), [formatCurrency]);
    const view = useMemo(() => (data ? VIEWS[current.id](data, money) : null), [data, current.id, money]);

    return (
        <div className="max-w-[1320px] mx-auto flex flex-col lg:flex-row gap-5 items-start">
            <nav aria-label="Reports" className="w-full lg:w-[240px] shrink-0">
                <h1 className="m-0 mb-3 text-[22px] lg:text-[24px] font-extrabold">Reports</h1>
                <div className="flex lg:flex-col gap-2 overflow-x-auto pb-1">
                    {visible.map(r => (
                        <Link key={r.id} to={`/reports/${r.id}`} replace aria-current={r.id === current.id ? 'page' : undefined}
                            className={cx('shrink-0 block px-3.5 py-3 rounded-dw-control border no-underline', r.id === current.id ? 'border-dw-text bg-dw-surface shadow-[inset_0_0_0_1px_var(--dw-text)] text-dw-text' : 'border-dw-border bg-dw-surface text-dw-text hover:border-dw-border-strong')}>
                            <span className="block text-[14px] font-extrabold">{r.title}</span>
                            <span className="block text-[12px] font-semibold text-dw-caption">{r.sub}</span>
                        </Link>
                    ))}
                </div>
                <p className="hidden lg:block mt-3 text-[12px] font-semibold text-dw-caption">Four reports replace eight. Daily or monthly is just the period. Every report prints, saves as PDF from the print dialog, and exports to Excel.</p>
            </nav>

            <section className="w-full flex-1 min-w-0">
                <Card className="flex flex-wrap items-center gap-3">
                    <PeriodControl value={period} onChange={setPeriod} />
                    <div className="ml-auto flex gap-2">
                        <Button size="sm" icon="print" disabled={!view} onClick={() => view && printView(current.title, periodLabel(period), view, money, config.logoUrl)}>Print / PDF</Button>
                        <Button size="sm" icon="download" disabled={!view} onClick={() => view && excelView(current.title, period, view, money)}>Excel</Button>
                    </div>
                </Card>

                {error ? (
                    <Card className="mt-4"><EmptyState icon="alert" title="The report did not load" body={error} /></Card>
                ) : !view ? (
                    <div className="flex justify-center py-16"><Spinner size={28} /></div>
                ) : (
                    <div className={cx('mt-4 flex flex-col gap-4', loading && 'opacity-60 transition-opacity')}>
                        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                            {view.tiles.map(t => (
                                <Card key={t.label} className="py-3">
                                    <p className={cx('m-0 text-[20px] font-extrabold tabular-nums truncate', t.tone === 'bad' && 'text-dw-danger', t.tone === 'good' && 'text-dw-success')}>{t.value}</p>
                                    <p className="m-0 text-[13px] font-bold">{t.label}</p>
                                    {t.sub && <p className="m-0 text-[12px] font-semibold text-dw-caption truncate">{t.sub}</p>}
                                </Card>
                            ))}
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2 items-start">
                            {view.blocks.map(b => <BlockView key={b.title} b={b} money={money} />)}
                        </div>
                    </div>
                )}
                {current.id === 'cash' && <p className="mt-3 text-[12px] font-semibold text-dw-caption"><Icon name="info" size={14} className="inline mr-1" />Money in counts what was actually received; credit sales count when they are paid.</p>}
            </section>
        </div>
    );
};

export default ReportsScreen;
