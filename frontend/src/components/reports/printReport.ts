import type { DailyReportData } from './reportShared';

// These are set once per print call via printReport()
let _currencySymbol = '$';
let _decimalPlaces = 2;
let _logoUrl = '';

const fmt = (n: number) =>
    `${_currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: _decimalPlaces, maximumFractionDigits: _decimalPlaces })}`;

const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

// ─── CASHIER AVATAR COLORS ───────────────────────────────────────────────────
// Each cashier gets a distinct hue so bars are immediately scannable
const CASHIER_COLORS = [
    { bar: '#1a365d', bg: '#dbeafe', text: '#1e40af' },
    { bar: '#059669', bg: '#d1fae5', text: '#065f46' },
    { bar: '#7c3aed', bg: '#ede9fe', text: '#5b21b6' },
    { bar: '#d97706', bg: '#fef3c7', text: '#92400e' },
    { bar: '#0284c7', bg: '#e0f2fe', text: '#075985' },
    { bar: '#db2777', bg: '#fce7f3', text: '#9d174d' },
];

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.5; }

  /* ── Header ── */
  .rpt-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 2px solid #1a365d; margin-bottom: 20px; }
  .rpt-logo { display: flex; align-items: center; gap: 10px; }
  .rpt-logo-icon { width: 36px; height: 36px; background: #1a365d; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; }
  .rpt-logo-name { font-size: 20px; font-weight: 700; color: #1f2937; letter-spacing: -0.5px; }
  .rpt-meta { text-align: right; }
  .rpt-title { font-size: 15px; font-weight: 600; color: #6b7280; }
  .rpt-date { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .rpt-printed { font-size: 10px; color: #9ca3af; }

  /* ── Insight strip ── */
  .insight-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .insight-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
  .insight-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; flex-shrink: 0; }
  .insight-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; display: flex; align-items: center; margin-bottom: 4px; }
  .insight-body { font-size: 11px; color: #374151; line-height: 1.4; }

  /* ── KPI strip ── */
  .kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi { background: #f9fafb; border-radius: 8px; padding: 14px 16px; }
  .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
  .kpi-value { font-size: 22px; font-weight: 700; }
  .kpi-sub { font-size: 9px; color: #9ca3af; margin-top: 3px; }

  /* ── Compare bar section ── */
  .compare-section { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; }
  .compare-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 14px; }
  .compare-row { margin-bottom: 10px; }
  .compare-meta { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; font-size: 12px; }
  .compare-track { height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .compare-fill { height: 100%; border-radius: 4px; }
  .compare-divider { border: none; border-top: 1px solid #e5e7eb; margin: 14px 0 10px; }
  .legend-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-size: 10px; color: #6b7280; }
  .legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }

  /* ── Stats row (used in repair / financial) ── */
  .stats { display: grid; gap: 10px; margin-bottom: 20px; }
  .stats-4 { grid-template-columns: repeat(4, 1fr); }
  .stats-3 { grid-template-columns: repeat(3, 1fr); }
  .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
  .stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  .stat-value { font-size: 20px; font-weight: 700; color: #111827; margin-top: 2px; }
  .stat-sub { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .stat-accent { border-top: 3px solid #1a365d; }
  .stat-green { border-top: 3px solid #10b981; }
  .stat-amber { border-top: 3px solid #f59e0b; }
  .stat-blue { border-top: 3px solid #3b82f6; }
  .stat-teal { border-top: 3px solid #14b8a6; }
  .stat-rose { border-top: 3px solid #f43f5e; }
  .stat-pink { border-top: 3px solid #ec4899; }
  .stat-indigo { border-top: 3px solid #1a365d; }
  .stat-purple { border-top: 3px solid #8b5cf6; }

  /* ── Sections ── */
  .section { margin-bottom: 20px; break-inside: avoid; }
  .section-title { font-size: 9px; font-weight: 700; color: #6b7280; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 6px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 20px; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; break-inside: avoid; }
  .card-full { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; break-inside: avoid; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { border-bottom: 1px solid #e5e7eb; }
  th { text-align: left; padding: 0 0 7px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  th.right { text-align: right; }
  td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
  td.right { text-align: right; }
  td.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
  td.amount { text-align: right; font-weight: 600; }
  td.amount-rose { text-align: right; font-weight: 600; color: #f43f5e; }
  td.amount-green { text-align: right; font-weight: 600; color: #059669; }
  td.amount-amber { text-align: right; font-weight: 600; color: #d97706; }
  tr.total-row td { border-top: 1px solid #e5e7eb; border-bottom: none; font-weight: 700; padding-top: 8px; }
  tr:hover td { background: #f9fafb; }
  .empty { text-align: center; color: #9ca3af; font-style: italic; padding: 16px; }

  /* ── Badges ── */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 500; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }
  .badge-purple { background: #e0e7ff; color: #1a365d; }
  .badge-receive { background: #d1fae5; color: #065f46; }
  .badge-pay { background: #fee2e2; color: #991b1b; }
  .badge-je { background: #ede9fe; color: #5b21b6; }
  .badge-retail { background: #dbeafe; color: #1e40af; }
  .badge-b2b { background: #ede9fe; color: #5b21b6; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-partial { background: #fef3c7; color: #92400e; }
  .badge-unpaid { background: #fee2e2; color: #991b1b; }
  .badge-returned { background: #f3f4f6; color: #6b7280; }

  /* ── Bar rows ── */
  .bar-row { margin-bottom: 10px; }
  .bar-meta { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; }
  .bar-track { height: 5px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-fill-teal { background: #14b8a6; }
  .bar-fill-rose { background: #f43f5e; }
  .bar-fill-navy { background: #1a365d; }
  .bar-fill-blue { background: #3b82f6; }
  .bar-fill-purple { background: #8b5cf6; }
  .bar-fill-amber { background: #f59e0b; }

  /* ── Cashier rows (distinct per-person colors) ── */
  .cashier-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .cashier-avatar { width: 28px; height: 28px; border-radius: 50%; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cashier-info { flex: 1; }
  .cashier-name { font-size: 11px; font-weight: 600; color: #1f2937; }
  .cashier-bar-track { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .cashier-bar-fill { height: 100%; border-radius: 2px; }
  .cashier-total { font-size: 11px; font-weight: 700; white-space: nowrap; text-align: right; }

  /* ── Tech row (repair) ── */
  .tech-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .tech-avatar { width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #1a365d; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .tech-info { flex: 1; }
  .tech-name { font-size: 11px; font-weight: 600; color: #1f2937; }
  .tech-bar-track { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .tech-bar-fill { height: 100%; background: #1a365d; border-radius: 2px; }
  .tech-count { font-size: 11px; font-weight: 700; color: #1a365d; white-space: nowrap; }

  /* ── Issue row ── */
  .issue-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
  .issue-rank { width: 18px; text-align: center; font-size: 11px; font-weight: 700; color: #9ca3af; }
  .issue-name { flex: 1; font-size: 11px; color: #374151; }
  .issue-count { font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; padding: 1px 7px; border-radius: 10px; }

  /* ── Stream label divider ── */
  .stream-label { display: flex; align-items: center; gap: 8px; margin: 12px 0 8px; }
  .stream-label-text { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
  .stream-label-line { flex: 1; height: 1px; background: #e5e7eb; }
  .stream-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  /* ── Mode pill ── */
  .mode-pill { display: inline-flex; align-items: center; gap: 5px; background: #f9fafb; border-radius: 20px; padding: 2px 9px 2px 6px; font-size: 11px; }
  .mode-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  /* ── Net summary rows ── */
  .net-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f3f4f6; align-items: center; }
  .net-row.bold { font-weight: 600; }
  .net-row.subtotal { font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-top: 8px; }
  .net-row.total { font-weight: 700; font-size: 13px; border-top: 2px solid #1a365d; border-bottom: none; padding-top: 10px; margin-top: 4px; }
  .text-green { color: #059669; }
  .text-rose { color: #f43f5e; }
  .text-amber { color: #d97706; }
  .text-purple { color: #1a365d; }

  /* ── Footer ── */
  .rpt-footer { text-align: center; font-size: 10px; color: #9ca3af; padding-top: 12px; border-top: 1px solid #e5e7eb; margin-top: 4px; }

  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function statusBadge(status: string): string {
    const map: Record<string, string> = {
        'Pending': 'badge-yellow',
        'In Progress': 'badge-blue',
        'Completed': 'badge-green',
        'Cancelled': 'badge-gray',
        'Delivered': 'badge-green',
        'Repaired': 'badge-green',
    };
    return `<span class="badge ${map[status] ?? 'badge-gray'}">${status}</span>`;
}

function entryTypeBadge(type: string): string {
    if (type === 'Receive') return `<span class="badge badge-receive">Receive</span>`;
    if (type === 'JE') return `<span class="badge badge-je">JE</span>`;
    return `<span class="badge badge-pay">Pay</span>`;
}

/** Color-code an amount cell based on payment status */
function amountClass(paymentStatus: string): string {
    const s = (paymentStatus || '').toLowerCase();
    if (s.includes('paid') && !s.includes('partial') && !s.includes('un')) return 'amount-green';
    if (s.includes('partial')) return 'amount-amber';
    if (s.includes('unpaid') || s.includes('return')) return 'amount-rose';
    return 'amount';
}

function paymentStatusBadge(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('paid') && !s.includes('partial') && !s.includes('un')) return `<span class="badge badge-paid">${status}</span>`;
    if (s.includes('partial')) return `<span class="badge badge-partial">${status}</span>`;
    if (s.includes('unpaid')) return `<span class="badge badge-unpaid">${status}</span>`;
    if (s.includes('return')) return `<span class="badge badge-returned">${status}</span>`;
    return `<span class="badge badge-gray">${status || 'Unknown'}</span>`;
}

function sourceBadge(source: string): string {
    const s = (source || '').toLowerCase();
    if (s.includes('b2b') || s.includes('custom') || s.includes('order')) return `<span class="badge badge-b2b">${source}</span>`;
    if (s.includes('pos') || s.includes('retail')) return `<span class="badge badge-retail">${source}</span>`;
    return source || '—';
}

function header(title: string, date: string): string {
    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const logoHtml = _logoUrl
        ? `<img src="${_logoUrl}" alt="Logo" style="max-height:44px;max-width:180px;object-fit:contain;" />`
        : `<div class="rpt-logo-icon">⌚</div><div class="rpt-logo-name">WatchDoc</div>`;
    return `
    <div class="rpt-header">
        <div class="rpt-logo">${logoHtml}</div>
        <div class="rpt-meta">
            <div class="rpt-title">${title}</div>
            <div class="rpt-date">${fmtDate(date)}</div>
            <div class="rpt-printed">Printed: ${now}</div>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// REPAIR SUMMARY  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
function buildRepairHtml(data: DailyReportData): string {
    const r = data.repair;
    const maxTasks = Math.max(...r.technician_tasks.map(t => t.tasks_completed), 1);

    const ordersReceived = r.received_count === 0
        ? `<p class="empty">No orders received</p>`
        : `<table>
            <thead><tr>
                <th>Order</th><th>Customer</th><th>Status</th><th>Priority</th>
            </tr></thead>
            <tbody>
                ${r.received_orders.map(o => `<tr>
                    <td class="mono">${o.name}</td>
                    <td>${o.customer_name}</td>
                    <td>${statusBadge(o.status)}</td>
                    <td>${o.priority}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    const ordersCompleted = r.completed_count === 0
        ? `<p class="empty">No orders completed</p>`
        : `<table>
            <thead><tr>
                <th>Order</th><th>Customer</th><th class="right">Invoiced</th>
            </tr></thead>
            <tbody>
                ${r.completed_orders.map(o => `<tr>
                    <td class="mono">${o.name}</td>
                    <td>${o.customer_name}</td>
                    <td class="amount">${o.invoiced_amount ? fmt(o.invoiced_amount) : '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    const techSection = r.technician_tasks.length === 0
        ? `<p class="empty">No tasks completed</p>`
        : r.technician_tasks.map(t => `
            <div class="tech-row">
                <div class="tech-avatar">${(t.technician_name || t.technician || 'T').charAt(0).toUpperCase()}</div>
                <div class="tech-info">
                    <div class="tech-name">${t.technician_name || t.technician}</div>
                    <div class="tech-bar-track">
                        <div class="tech-bar-fill" style="width:${Math.min(100, (t.tasks_completed / maxTasks) * 100)}%"></div>
                    </div>
                </div>
                <div class="tech-count">${t.tasks_completed} task${t.tasks_completed !== 1 ? 's' : ''}</div>
            </div>`).join('');

    const issuesSection = r.top_issues.length === 0
        ? `<p class="empty">No issues logged</p>`
        : r.top_issues.map((issue, i) => `
            <div class="issue-row">
                <div class="issue-rank">${i + 1}</div>
                <div class="issue-name">${issue.issue_name}</div>
                <div class="issue-count">×${issue.count}</div>
            </div>`).join('');

    const partsTotalQty = r.parts_used.reduce((s, p) => s + p.total_qty, 0);
    const partsTotalAmt = r.parts_used.reduce((s, p) => s + p.total_amount, 0);
    const partsSection = r.parts_used.length === 0
        ? `<p class="empty">No parts recorded</p>`
        : `<table>
            <thead><tr>
                <th>Part</th><th class="right">Qty</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${r.parts_used.map(p => `<tr>
                    <td>${p.item_name}</td>
                    <td class="right">${p.total_qty}</td>
                    <td class="amount">${fmt(p.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="right">${partsTotalQty}</td>
                <td class="amount">${fmt(partsTotalAmt)}</td>
            </tr></tfoot>
        </table>`;

    return `
        ${header('Repair Summary', data.date)}

        <div class="stats stats-4">
            <div class="stat stat-accent">
                <div class="stat-label">Orders Received</div>
                <div class="stat-value">${r.received_count}</div>
            </div>
            <div class="stat stat-green">
                <div class="stat-label">Orders Completed</div>
                <div class="stat-value">${r.completed_count}</div>
            </div>
            <div class="stat stat-amber">
                <div class="stat-label">Open Orders</div>
                <div class="stat-value">${r.pending_count + r.inprogress_count}</div>
                <div class="stat-sub">${r.inprogress_count} in progress · ${r.pending_count} pending</div>
            </div>
            <div class="stat stat-indigo">
                <div class="stat-label">Technicians Active</div>
                <div class="stat-value">${r.technician_tasks.length}</div>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <div class="section-title">Orders Received (${r.received_count})</div>
                ${ordersReceived}
            </div>
            <div class="card">
                <div class="section-title">Orders Completed (${r.completed_count})</div>
                ${ordersCompleted}
            </div>
            <div class="card">
                <div class="section-title">Technician Performance</div>
                ${techSection}
            </div>
            <div class="card">
                <div class="section-title">Top Issues Reported</div>
                ${issuesSection}
            </div>
        </div>

        <div class="card-full">
            <div class="section-title">Parts Used</div>
            ${partsSection}
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SALES SUMMARY  (redesigned)
// ─────────────────────────────────────────────────────────────────────────────
function buildSalesHtml(data: DailyReportData): string {
    const p = data.pos;
    const fin = data.financial;
    const retailSales = p.total_retail_sales ?? 0;
    const b2bSales    = p.total_b2b_sales   ?? 0;
    const netSales    = p.net_sales          ?? 0;
    const returns_    = p.total_returns      ?? 0;
    const grossSales  = retailSales + b2bSales;
    const txnCount    = p.transaction_count  ?? 0;
    const avgOrder    = txnCount > 0 ? netSales / txnCount : 0;

    const purchaseTotal       = fin?.total_pe_purchases    ?? 0;
    const creditPurchases     = fin?.total_credit_purchases ?? 0;
    const totalPurchaseExposure = purchaseTotal + creditPurchases;
    const netPosition         = netSales - totalPurchaseExposure;
    const totalQty            = p.items_sold.reduce((s, i) => s + i.total_qty, 0);

    // ── 1. Key Insights (leads the page) ─────────────────────────────────────
    const insights: { dot: string; label: string; body: string }[] = [];

    if (txnCount > 0) {
        insights.push({
            dot: '#2563eb',
            label: 'Transaction overview',
            body: `${txnCount} transaction${txnCount !== 1 ? 's' : ''} processed today, averaging ${fmt(avgOrder)} per order.`,
        });
    }

    if (returns_ > 0 && grossSales > 0) {
        const pctR = Math.round((returns_ / grossSales) * 100);
        insights.push({
            dot: pctR >= 10 ? '#e11d48' : '#6b7280',
            label: 'Returns activity',
            body: `${fmt(returns_)} in returns — ${pctR}% of gross sales. ${pctR >= 10 ? 'Elevated return rate; review return reasons.' : 'Within acceptable range.'}`,
        });
    }

    if (p.category_breakdown.length > 0 && netSales > 0) {
        const topCat = [...p.category_breakdown].sort((a, b) => b.total_amount - a.total_amount)[0];
        const catPct = Math.round((topCat.total_amount / netSales) * 100);
        insights.push({
            dot: '#059669',
            label: 'Top revenue category',
            body: `${topCat.item_group} drove ${catPct}% of net sales (${fmt(topCat.total_amount)}) — strongest segment today.`,
        });
    }

    if (p.cashier_breakdown.length > 1 && netSales > 0) {
        const topC  = [...p.cashier_breakdown].sort((a, b) => b.total - a.total)[0];
        const cPct  = Math.round((topC.total / netSales) * 100);
        const cName = topC.owner.includes('@') ? topC.owner.split('@')[0] : topC.owner;
        insights.push({
            dot: '#7c3aed',
            label: 'Top performer',
            body: `${cName} led with ${fmt(topC.total)} (${cPct}% of revenue, ${topC.count} txn${topC.count !== 1 ? 's' : ''}).`,
        });
    }

    if (fin) {
        if (totalPurchaseExposure > 0 && netSales > 0) {
            const ppPct = Math.round((totalPurchaseExposure / netSales) * 100);
            insights.push({
                dot: ppPct >= 80 ? '#e11d48' : ppPct >= 50 ? '#d97706' : '#059669',
                label: 'Purchase pressure',
                body: `Purchases at ${ppPct}% of net sales. ${ppPct >= 80 ? 'High spend ratio — review procurement priorities.' : ppPct >= 50 ? 'Moderate spend level.' : 'Healthy margin buffer maintained.'}`,
            });
        } else if (totalPurchaseExposure === 0) {
            insights.push({
                dot: '#2563eb',
                label: 'No purchases recorded',
                body: 'No purchase payments or outstanding purchase invoices were recorded today.',
            });
        }
    }

    const insightStripHtml = insights.slice(0, 5).map(ins => `
        <div class="insight-card">
            <div class="insight-label">
                <span class="insight-dot" style="background:${ins.dot}"></span>${ins.label}
            </div>
            <div class="insight-body">${ins.body}</div>
        </div>`).join('');

    // ── 2. Revenue vs Spend comparison bar ───────────────────────────────────
    const maxBar = grossSales > 0 ? grossSales : 1;
    const retailPct  = Math.round((retailSales           / maxBar) * 100);
    const b2bPct     = Math.round((b2bSales              / maxBar) * 100);
    const returnsPct = grossSales > 0 ? Math.round((returns_ / grossSales) * 100) : 0;
    const paidPct    = grossSales > 0 ? Math.round((purchaseTotal   / grossSales) * 100) : 0;
    const creditPct  = grossSales > 0 ? Math.round((creditPurchases / grossSales) * 100) : 0;

    const compareBarHtml = `
        <div class="compare-section">
            <div class="compare-title">Revenue vs. spend by stream</div>

            <div class="compare-row">
                <div class="compare-meta">
                    <span style="font-weight:600">Retail (POS)</span>
                    <span style="font-weight:600">${fmt(retailSales)} <span style="color:#9ca3af;font-size:10px;font-weight:400">${retailPct}%</span></span>
                </div>
                <div class="compare-track"><div class="compare-fill" style="width:${retailPct}%;background:#1a365d"></div></div>
            </div>

            <div class="compare-row">
                <div class="compare-meta">
                    <span style="font-weight:600">B2B / Custom orders</span>
                    <span style="font-weight:600">${fmt(b2bSales)} <span style="color:#9ca3af;font-size:10px;font-weight:400">${b2bPct}%</span></span>
                </div>
                <div class="compare-track"><div class="compare-fill" style="width:${b2bPct}%;background:#2563eb"></div></div>
            </div>

            ${returns_ > 0 ? `
            <div class="compare-row">
                <div class="compare-meta">
                    <span style="color:#9ca3af">Returns</span>
                    <span style="color:#e11d48">− ${fmt(returns_)} <span style="color:#9ca3af;font-size:10px">${returnsPct}%</span></span>
                </div>
                <div class="compare-track"><div class="compare-fill" style="width:${returnsPct}%;background:#e11d48"></div></div>
            </div>` : ''}

            ${fin ? `
            <hr class="compare-divider" />
            <div class="compare-row">
                <div class="compare-meta">
                    <span style="color:#6b7280">Paid purchases</span>
                    <span style="color:#d97706;font-weight:600">${fmt(purchaseTotal)} <span style="color:#9ca3af;font-size:10px;font-weight:400">${paidPct}%</span></span>
                </div>
                <div class="compare-track"><div class="compare-fill" style="width:${paidPct}%;background:#d97706"></div></div>
            </div>
            ${creditPurchases > 0 ? `
            <div class="compare-row">
                <div class="compare-meta">
                    <span style="color:#6b7280">Credit purchases (unpaid)</span>
                    <span style="color:#e11d48;font-weight:600">${fmt(creditPurchases)} <span style="color:#9ca3af;font-size:10px;font-weight:400">${creditPct}%</span></span>
                </div>
                <div class="compare-track"><div class="compare-fill" style="width:${creditPct}%;background:#fca5a5"></div></div>
            </div>` : ''}` : ''}

            <div class="legend-row">
                <span><span class="legend-dot" style="background:#1a365d"></span>Retail</span>
                <span><span class="legend-dot" style="background:#2563eb"></span>B2B</span>
                ${fin ? `<span><span class="legend-dot" style="background:#d97706"></span>Paid purchases</span>` : ''}
                ${fin && creditPurchases > 0 ? `<span><span class="legend-dot" style="background:#fca5a5"></span>Credit purchases</span>` : ''}
                ${returns_ > 0 ? `<span><span class="legend-dot" style="background:#e11d48"></span>Returns</span>` : ''}
            </div>
        </div>`;

    // ── 3. Category breakdown ─────────────────────────────────────────────────
    const categorySection = !p.category_breakdown || p.category_breakdown.length === 0
        ? `<p class="empty">No category data</p>`
        : p.category_breakdown.map(cat => {
            const pct = netSales > 0 ? Math.max(0, Math.round((cat.total_amount / netSales) * 100)) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span style="font-weight:600">${cat.item_group}</span>
                    <span style="font-weight:600">${fmt(cat.total_amount)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-navy" style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

    // ── 4. Cashier breakdown (distinct colors per person) ─────────────────────
    const cashierSection = !p.cashier_breakdown || p.cashier_breakdown.length === 0
        ? `<p class="empty">No cashier data</p>`
        : p.cashier_breakdown.map((c, i) => {
            const pct   = netSales > 0 ? Math.round((c.total / netSales) * 100) : 0;
            const col   = CASHIER_COLORS[i % CASHIER_COLORS.length];
            const initials = c.owner.split(/[\s@]/)[0].charAt(0).toUpperCase() +
                             (c.owner.split(/[\s@]/)[1]?.charAt(0).toUpperCase() ?? '');
            return `<div class="cashier-row">
                <div class="cashier-avatar" style="background:${col.bg};color:${col.text}">${initials}</div>
                <div class="cashier-info">
                    <div class="cashier-name">${c.owner} <span style="color:#9ca3af;font-weight:400;font-size:10px">${c.count} txn${c.count !== 1 ? 's' : ''}</span></div>
                    <div class="cashier-bar-track">
                        <div class="cashier-bar-fill" style="background:${col.bar};width:${pct}%"></div>
                    </div>
                </div>
                <div class="cashier-total" style="color:${col.bar}">
                    ${fmt(c.total)}<br>
                    <span style="font-size:10px;color:#9ca3af;font-weight:400">${pct}%</span>
                </div>
            </div>`;
        }).join('');

    // ── 5. Payment methods (absolute value prominent) ─────────────────────────
    const paymentSection = p.payment_breakdown.length === 0
        ? `<p class="empty">No payments recorded</p>`
        : p.payment_breakdown.map(pm => {
            const pct = grossSales > 0 ? Math.round((pm.total / grossSales) * 100) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${pm.mode_of_payment} <span style="color:#9ca3af;font-size:10px">(${pm.txn_count} txn${pm.txn_count !== 1 ? 's' : ''})</span></span>
                    <span style="font-weight:600">${fmt(pm.total)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-teal" style="width:${pct}%"></div></div>
            </div>`;
        }).join('') + `
        <div style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:6px;display:flex;justify-content:space-between;font-size:12px">
            <span style="color:#6b7280">Total collected</span>
            <span style="font-weight:700">${fmt(netSales)}</span>
        </div>`;

    // ── 6. Items sold ─────────────────────────────────────────────────────────
    const itemsSection = p.items_sold.length === 0
        ? `<p class="empty">No items sold</p>`
        : `<table>
            <thead><tr>
                <th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${p.items_sold.map(item => `<tr>
                    <td>${item.item_name}</td>
                    <td class="right">${item.total_qty}</td>
                    <td class="amount">${fmt(item.rate ?? 0)}</td>
                    <td class="amount">${fmt(item.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="right">${totalQty}</td>
                <td></td>
                <td class="amount">${fmt(p.items_sold.reduce((s, i) => s + i.total_amount, 0))}</td>
            </tr></tfoot>
        </table>`;

    // ── 7. Purchase section (conditional) ─────────────────────────────────────
    let purchaseSectionHtml = '';
    if (fin) {
        const peModeRows = (fin.pe_purchases_by_mode ?? []).map(pm => {
            const pct = purchaseTotal > 0 ? Math.round((pm.total / purchaseTotal) * 100) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${pm.mode_of_payment} <span style="color:#9ca3af;font-size:10px">(${pm.count} txn${pm.count !== 1 ? 's' : ''})</span></span>
                    <span style="font-weight:600">${fmt(pm.total)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-purple" style="width:${pct}%"></div></div>
            </div>`;
        }).join('');

        const creditInvRows = (fin.credit_purchase_invoices ?? []).map(inv =>
            `<tr>
                <td class="mono">${inv.name}</td>
                <td>${inv.supplier_name ?? inv.supplier ?? '—'}</td>
                <td class="amount-amber">${fmt(inv.outstanding_amount)}</td>
            </tr>`
        ).join('');

        purchaseSectionHtml = `
        <hr class="divider" />
        <div class="section-title" style="margin-bottom:12px;color:#7c3aed">Purchase Activity</div>
        <div class="grid-2">
            <div class="card">
                <div class="section-title">Paid Purchases by Mode</div>
                ${ (fin.pe_purchases_by_mode ?? []).length === 0
                    ? `<p class="empty">No paid purchases today</p>`
                    : peModeRows + `<div class="net-row bold" style="margin-top:8px"><span>Total Paid</span><span style="color:#8b5cf6">${fmt(purchaseTotal)}</span></div>`
                }
            </div>
            <div class="card">
                <div class="section-title">Credit Purchases (Unpaid)</div>
                ${ (fin.credit_purchase_invoices ?? []).length === 0
                    ? `<p class="empty">No outstanding purchase invoices</p>`
                    : `<table>
                        <thead><tr><th>Invoice</th><th>Supplier</th><th class="right">Outstanding</th></tr></thead>
                        <tbody>${creditInvRows}</tbody>
                        <tfoot><tr class="total-row">
                            <td colspan="2">Total Outstanding</td>
                            <td class="amount-amber">${fmt(creditPurchases)}</td>
                        </tr></tfoot>
                    </table>`
                }
            </div>
        </div>`;
    }

    // ── 8. Items purchased ────────────────────────────────────────────────────
    const itemsPurchasedRows = fin?.items_purchased ?? [];
    const itemsPurchasedHtml = itemsPurchasedRows.length === 0
        ? `<p class="empty">No items purchased</p>`
        : `<table>
            <thead><tr>
                <th>Item</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${itemsPurchasedRows.map(item => `<tr>
                    <td>${item.item_name}</td>
                    <td class="right">${item.total_qty}</td>
                    <td class="amount">${fmt(item.rate ?? 0)}</td>
                    <td class="amount">${fmt(item.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="right">${itemsPurchasedRows.reduce((s, item) => s + Number(item.total_qty || 0), 0)}</td>
                <td></td>
                <td class="amount">${fmt(itemsPurchasedRows.reduce((s, item) => s + Number(item.total_amount || 0), 0))}</td>
            </tr></tfoot>
        </table>`;

    // ── 9. Sales ledger (color-coded rows) ────────────────────────────────────
    const salesLedgerRows = fin?.sales_entries ?? [];
    const salesLedgerHtml = salesLedgerRows.length === 0
        ? `<p class="empty">No detailed sales entries available</p>`
        : `<table>
            <thead><tr>
                <th>Invoice</th><th>Customer</th><th>Source</th><th>Payment mode</th><th>Status</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${salesLedgerRows.map(row => `<tr>
                    <td class="mono">${row.id}</td>
                    <td>${row.party_name || '—'}</td>
                    <td>${sourceBadge(row.source || '')}</td>
                    <td>${row.payment_mode || '—'}</td>
                    <td>${paymentStatusBadge(row.payment_status)}</td>
                    <td class="${amountClass(row.payment_status)}">${fmt(row.amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td colspan="5">Total</td>
                <td class="amount">${fmt(salesLedgerRows.reduce((s, row) => s + Number(row.amount || 0), 0))}</td>
            </tr></tfoot>
        </table>`;

    // ── 10. Purchase ledger ────────────────────────────────────────────────────
    const purchaseLedgerRows = fin?.purchase_entries ?? [];
    const purchaseLedgerHtml = purchaseLedgerRows.length === 0
        ? `<p class="empty">No detailed purchase entries available</p>`
        : `<table>
            <thead><tr>
                <th>Invoice</th><th>Supplier</th><th>Source</th><th>Payment mode</th><th>Status</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${purchaseLedgerRows.map(row => `<tr>
                    <td class="mono">${row.id}</td>
                    <td>${row.party_name || '—'}</td>
                    <td>${sourceBadge(row.source || '')}</td>
                    <td>${row.payment_mode || '—'}</td>
                    <td>${paymentStatusBadge(row.payment_status)}</td>
                    <td class="${amountClass(row.payment_status)}">${fmt(row.amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td colspan="5">Total</td>
                <td class="amount">${fmt(purchaseLedgerRows.reduce((s, row) => s + Number(row.amount || 0), 0))}</td>
            </tr></tfoot>
        </table>`;

    // ── Assemble ──────────────────────────────────────────────────────────────
    return `
        ${header('Daily Sales & Purchase Summary', data.date)}

        <!-- 1. Key Insights — leads the page -->
        ${insights.length > 0 ? `
        <div class="insight-strip">
            ${insightStripHtml}
        </div>` : ''}

        <!-- 2. KPI strip — single row, 4 numbers -->
        <div class="kpi-strip">
            <div class="kpi">
                <div class="kpi-label">Net sales</div>
                <div class="kpi-value" style="color:#059669">${fmt(netSales)}</div>
                <div class="kpi-sub">Gross minus returns</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Transactions</div>
                <div class="kpi-value" style="color:#1a365d">${txnCount}</div>
                <div class="kpi-sub">Avg ${fmt(avgOrder)} / order</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Total purchases</div>
                <div class="kpi-value" style="color:${fin && totalPurchaseExposure > netSales ? '#e11d48' : '#2563eb'}">${fmt(totalPurchaseExposure)}</div>
                <div class="kpi-sub">${fin ? 'Paid + credit' : 'No purchase data'}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Net position</div>
                <div class="kpi-value" style="color:${netPosition >= 0 ? '#059669' : '#e11d48'}">${netPosition < 0 ? '−' : ''}${fmt(Math.abs(netPosition))}</div>
                <div class="kpi-sub">Sales minus purchases</div>
            </div>
        </div>

        <!-- 3. Revenue vs. spend comparison bar -->
        ${compareBarHtml}

        <!-- 4. Category + Cashier + Payment -->
        <div class="grid-3">
            <div class="card">
                <div class="section-title">Sales by category</div>
                ${categorySection}
            </div>
            <div class="card">
                <div class="section-title">Sales by cashier</div>
                ${cashierSection}
            </div>
            <div class="card">
                <div class="section-title">Payment methods</div>
                ${paymentSection}
            </div>
        </div>

        <!-- 5. Items sold -->
        <div class="card-full">
            <div class="section-title">Items sold</div>
            ${itemsSection}
        </div>

        <!-- 6. Purchase activity (conditional) -->
        ${purchaseSectionHtml}

        <!-- 7. Items purchased -->
        <div class="card-full">
            <div class="section-title">Items purchased</div>
            ${itemsPurchasedHtml}
        </div>

        <!-- 8. Sales ledger — color-coded rows -->
        <div class="card-full">
            <div class="section-title">Sales ledger</div>
            ${salesLedgerHtml}
        </div>

        <!-- 9. Purchase ledger — color-coded rows -->
        <div class="card-full">
            <div class="section-title">Purchase ledger</div>
            ${purchaseLedgerHtml}
        </div>

        <div class="rpt-footer">
            WatchDoc &middot; Confidential &middot; For internal use only
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL SUMMARY  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
function buildFinancialHtml(data: DailyReportData): string {
    const r = data.repair;
    const p = data.pos;
    const fin = data.financial ?? { total_expenses: 0, expense_breakdown: [], expense_entries: [], repair_payment_breakdown: [] };

    const retailSales        = p.total_retail_sales ?? 0;
    const repairRevenue      = r.revenue;
    const totalCollections   = fin.total_customer_collections ?? 0;
    const customerCollections = fin.pe_customer_collections ?? [];
    const returns_           = p.total_returns ?? 0;
    const totalIncome        = retailSales + repairRevenue + totalCollections;
    const totalOutflow       = fin.total_expenses;
    const net                = totalIncome - totalOutflow;
    const netClass           = net >= 0 ? 'text-green' : 'text-rose';
    const netLabel           = net >= 0 ? '▲ Positive day' : '▼ Negative day';
    const netLabelColor      = net >= 0 ? '#059669' : '#f43f5e';

    const incomeModeMap = new Map<string, number>();
    p.payment_breakdown.forEach(pm => {
        incomeModeMap.set(pm.mode_of_payment, (incomeModeMap.get(pm.mode_of_payment) ?? 0) + pm.total);
    });
    (fin.repair_payment_breakdown ?? []).forEach((rm: any) => {
        incomeModeMap.set(rm.mode_of_payment, (incomeModeMap.get(rm.mode_of_payment) ?? 0) + rm.total);
    });
    customerCollections.forEach((c: any) => {
        incomeModeMap.set(c.mode_of_payment, (incomeModeMap.get(c.mode_of_payment) ?? 0) + Number(c.amount || 0));
    });
    const incomeModes = Array.from(incomeModeMap.entries())
        .map(([mode, total]) => ({ mode, total }))
        .sort((a, b) => b.total - a.total);

    const modeColors = ['#1a365d', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b'];
    const incomeModeBarsHtml = incomeModes.length === 0
        ? `<p class="empty">No payment mode data</p>`
        : incomeModes.map((m, i) => {
            const pct   = totalIncome > 0 ? Math.round((m.total / totalIncome) * 100) : 0;
            const color = modeColors[i % modeColors.length];
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${m.mode}</span>
                    <span style="font-weight:600">${fmt(m.total)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="background:${color};width:${pct}%"></div></div>
            </div>`;
        }).join('');

    const pePurchases       = fin.pe_purchases       ?? [];
    const peOperatingByMode = fin.pe_operating_by_mode ?? fin.pe_pay_by_mode ?? [];
    const jeEntries         = fin.je_entries          ?? [];

    const purchaseRowsHtml = pePurchases.length === 0
        ? `<p class="empty" style="padding:6px 0">No purchase entries</p>`
        : pePurchases.map((pu: any) =>
            `<div class="net-row"><span>${pu.party_name || pu.party || '—'}</span><span class="text-rose">${fmt(pu.amount)}</span></div>`
        ).join('');

    const expenseRowsHtml = jeEntries.length > 0
        ? jeEntries.map((je: any) =>
            `<div class="net-row"><span>${je.against_account || '—'}</span><span class="text-rose">${fmt(je.amount)}</span></div>`
        ).join('')
        : peOperatingByMode.map((m: any) =>
            `<div class="net-row"><span>${m.mode_of_payment} <span style="color:#9ca3af;font-size:10px">×${m.count}</span></span><span class="text-rose">${fmt(m.total)}</span></div>`
        ).join('') || `<p class="empty" style="padding:6px 0">No expense entries</p>`;

    const purchasesTotal = fin.total_pe_purchases   ?? 0;
    const expensesTotal  = (fin.total_pe_operating ?? 0) + (fin.je_total ?? 0);

    const modeSet = new Set<string>();
    p.payment_breakdown.forEach(pm => modeSet.add(pm.mode_of_payment));
    (fin.repair_payment_breakdown ?? []).forEach((rp: any) => modeSet.add(rp.mode_of_payment));
    customerCollections.forEach((c: any) => modeSet.add(c.mode_of_payment));
    fin.expense_breakdown.forEach((e: any) => modeSet.add(e.mode_of_payment));

    const modeBalances = Array.from(modeSet).map(mode => {
        const posInc  = p.payment_breakdown.find(pm => pm.mode_of_payment === mode)?.total ?? 0;
        const repInc  = (fin.repair_payment_breakdown ?? []).find((rp: any) => rp.mode_of_payment === mode)?.total ?? 0;
        const collIn  = customerCollections
            .filter((c: any) => c.mode_of_payment === mode)
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
        const income   = posInc + repInc + collIn;
        const expenses = fin.expense_breakdown.find((e: any) => e.mode_of_payment === mode)?.total ?? 0;
        return { mode, income, expenses, balance: income - expenses };
    });

    const modeTableTotalIncome = modeBalances.reduce((s, m) => s + m.income, 0);
    const modeTableTotalExp    = modeBalances.reduce((s, m) => s + m.expenses, 0);
    const modeTableNet         = modeTableTotalIncome - modeTableTotalExp;

    const modeTableHtml = modeBalances.length === 0
        ? `<p class="empty">No payment mode data</p>`
        : `<table>
            <thead><tr>
                <th>Mode</th>
                <th class="right">Income (in)</th>
                <th class="right">Expenses (out)</th>
                <th class="right">Balance</th>
                <th class="right">% of income</th>
            </tr></thead>
            <tbody>
                ${modeBalances.map((mb, i) => {
                    const pct      = modeTableTotalIncome > 0 ? Math.round((mb.income / modeTableTotalIncome) * 100) : 0;
                    const dotColor = modeColors[i % modeColors.length];
                    return `<tr>
                        <td><div class="mode-pill"><div class="mode-dot" style="background:${dotColor}"></div>${mb.mode}</div></td>
                        <td class="amount-green">${fmt(mb.income)}</td>
                        <td class="${mb.expenses > 0 ? 'amount-rose' : 'right'}">${mb.expenses > 0 ? fmt(mb.expenses) : '—'}</td>
                        <td class="${mb.balance >= 0 ? 'amount-green' : 'amount-rose'}">${mb.balance < 0 ? '−' : ''}${fmt(Math.abs(mb.balance))}</td>
                        <td class="right" style="color:#9ca3af">${pct}%</td>
                    </tr>`;
                }).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="amount-green">${fmt(modeTableTotalIncome)}</td>
                <td class="amount-rose">${fmt(modeTableTotalExp)}</td>
                <td class="${modeTableNet >= 0 ? 'amount-green' : 'amount-rose'}">${modeTableNet < 0 ? '−' : ''}${fmt(Math.abs(modeTableNet))}</td>
                <td></td>
            </tr></tfoot>
        </table>`;

    const peEntries = fin.pe_entries ?? [];
    const allEntriesRows = [
        ...peEntries.map((e: any) => ({
            entryId: e.name,
            entryType: e.payment_type === 'Receive' ? 'Receive' : 'Pay',
            partyOrAccount: e.party_name || e.party || '—',
            mode: e.mode_of_payment || '—',
            remarks: e.remarks || '—',
            amount: Number(e.amount || 0),
            isReceive: e.payment_type === 'Receive',
        })),
        ...jeEntries.map((je: any) => ({
            entryId: je.name,
            entryType: 'JE',
            partyOrAccount: je.against_account || '—',
            mode: je.mode_of_payment || '—',
            remarks: je.remarks || '—',
            amount: Number(je.amount || 0),
            isReceive: false,
        })),
    ];

    const totalOutflowEntries = allEntriesRows
        .filter(e => !e.isReceive)
        .reduce((sum, e) => sum + e.amount, 0);

    const allEntriesHtml = allEntriesRows.length === 0
        ? ''
        : `<div class="card-full">
            <div class="section-title">All Entries</div>
            <table>
                <thead><tr>
                    <th>Entry ID</th><th>Type</th><th>Party / Account</th><th>Mode</th><th>Remarks</th><th class="right">Amount</th>
                </tr></thead>
                <tbody>
                    ${allEntriesRows.map(rw => `<tr>
                        <td class="mono">${rw.entryId}</td>
                        <td>${entryTypeBadge(rw.entryType)}</td>
                        <td>${rw.partyOrAccount}</td>
                        <td>${rw.mode}</td>
                        <td>${rw.remarks}</td>
                        <td class="${rw.isReceive ? 'amount-green' : 'amount-rose'}">${rw.isReceive ? '+' : ''}${fmt(rw.amount)}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot><tr class="total-row">
                    <td colspan="5">Total Outflow</td>
                    <td class="amount-rose">${fmt(totalOutflowEntries)}</td>
                </tr></tfoot>
            </table>
        </div>`;

    return `
        ${header('Financial Summary', data.date)}

        <div class="stats stats-4">
            <div class="stat stat-green">
                <div class="stat-label">Total Income</div>
                <div class="stat-value text-green">${fmt(totalIncome)}</div>
                <div class="stat-sub">Retail + repair invoices</div>
            </div>
            <div class="stat stat-rose">
                <div class="stat-label">Total Outflow</div>
                <div class="stat-value text-rose">${fmt(totalOutflow)}</div>
                <div class="stat-sub">Expenses + purchases</div>
            </div>
            <div class="stat ${net >= 0 ? 'stat-indigo' : 'stat-rose'}">
                <div class="stat-label">Net Balance</div>
                <div class="stat-value ${netClass}">${net < 0 ? '−' : ''}${fmt(Math.abs(net))}</div>
                <div class="stat-sub" style="color:${netLabelColor}">${netLabel}</div>
            </div>
            <div class="stat stat-purple">
                <div class="stat-label">Transactions</div>
                <div class="stat-value" style="color:#8b5cf6">${(p.payment_breakdown.reduce((s, pm) => s + pm.txn_count, 0))}</div>
                <div class="stat-sub">Across all payment modes</div>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <div class="section-title">Income breakdown</div>
                <div class="stream-label">
                    <div class="stream-dot" style="background:#059669"></div>
                    <div class="stream-label-text" style="color:#059669">Sales stream</div>
                    <div class="stream-label-line"></div>
                </div>
                <div class="net-row"><span>Retail (POS)</span><span class="text-green">${fmt(retailSales)}</span></div>
                <div class="net-row"><span>Repair invoices</span><span class="text-green">${fmt(repairRevenue)}</span></div>
                <div class="net-row"><span>Collection</span><span class="text-green">${fmt(totalCollections)}</span></div>
                <div class="net-row"><span style="color:#9ca3af">Returns</span><span class="text-rose">− ${fmt(returns_)}</span></div>
                <div class="stream-label" style="margin-top:14px">
                    <div class="stream-dot" style="background:#1a365d"></div>
                    <div class="stream-label-text" style="color:#1a365d">By payment mode</div>
                    <div class="stream-label-line"></div>
                </div>
                ${incomeModeBarsHtml}
                <div class="net-row total"><span>Total Income</span><span class="text-green">${fmt(totalIncome)}</span></div>
            </div>

            <div class="card">
                <div class="section-title">Outflow breakdown</div>
                ${purchasesTotal > 0 ? `
                <div class="stream-label">
                    <div class="stream-dot" style="background:#f59e0b"></div>
                    <div class="stream-label-text" style="color:#b45309">Purchases</div>
                    <div class="stream-label-line"></div>
                </div>
                ${purchaseRowsHtml}
                <div class="net-row bold" style="padding-top:6px"><span>Purchases subtotal</span><span class="text-rose">${fmt(purchasesTotal)}</span></div>
                ` : ''}
                <div class="stream-label" style="margin-top:${purchasesTotal > 0 ? 12 : 0}px">
                    <div class="stream-dot" style="background:#f43f5e"></div>
                    <div class="stream-label-text" style="color:#991b1b">Operating expenses</div>
                    <div class="stream-label-line"></div>
                </div>
                ${expenseRowsHtml}
                <div class="net-row bold" style="padding-top:6px"><span>Expenses subtotal</span><span class="text-rose">${fmt(expensesTotal)}</span></div>
                <div class="net-row total"><span>Total Outflow</span><span class="text-rose">${fmt(totalOutflow)}</span></div>
            </div>
        </div>

        <div class="card-full">
            <div class="section-title">Cash flow by payment mode</div>
            ${modeTableHtml}
        </div>

        ${allEntriesHtml}

        <div class="rpt-footer">
            WatchDoc · Confidential · For internal use only
        </div>`;
}

function buildProfitHtml(data: DailyReportData): string {
    const fin = data.financial;
    const rows = fin?.item_profit_summary ?? [];
    const totalQty = rows.reduce((s: number, r: any) => s + Number(r.qty_sold || 0), 0);
    const totalSales = rows.reduce((s: number, r: any) => s + Number(r.sales_amount || 0), 0);
    const totalCogs = rows.reduce((s: number, r: any) => s + Number(r.cogs_amount || 0), 0);
    const totalGross = rows.reduce((s: number, r: any) => s + Number(r.gross_profit || 0), 0);
    const margin = totalSales > 0 ? (totalGross / totalSales) * 100 : 0;

    return `
        ${header('Profit Summary', data.date)}

        <div class="stats stats-4">
            <div class="stat stat-green">
                <div class="stat-label">Sales Amount</div>
                <div class="stat-value text-green">${fmt(totalSales)}</div>
            </div>
            <div class="stat stat-rose">
                <div class="stat-label">COGS</div>
                <div class="stat-value text-rose">${fmt(totalCogs)}</div>
            </div>
            <div class="stat ${totalGross >= 0 ? 'stat-indigo' : 'stat-rose'}">
                <div class="stat-label">Gross Profit</div>
                <div class="stat-value ${totalGross >= 0 ? 'text-green' : 'text-rose'}">${totalGross < 0 ? '−' : ''}${fmt(Math.abs(totalGross))}</div>
            </div>
            <div class="stat ${margin >= 0 ? 'stat-teal' : 'stat-rose'}">
                <div class="stat-label">Gross Margin</div>
                <div class="stat-value">${margin.toFixed(1)}%</div>
            </div>
        </div>

        <div class="card-full">
            <div class="section-title">Item-wise Profitability</div>
            ${rows.length === 0 ? '<p class="empty">No sales items found for this date</p>' : `
                <table>
                    <thead><tr>
                        <th>Item</th>
                        <th class="right">Qty</th>
                        <th class="right">Selling Rate</th>
                        <th class="right">COGS Rate</th>
                        <th class="right">Gross Profit</th>
                        <th class="right">Margin %</th>
                    </tr></thead>
                    <tbody>
                        ${rows.map((r: any) => `
                            <tr>
                                <td>${r.item_name}<br><span style="color:#9ca3af;font-size:10px">${r.item_code}</span></td>
                                <td class="right">${Number(r.qty_sold || 0).toFixed(2)}</td>
                                <td class="amount">${fmt(Number(r.selling_rate || 0))}</td>
                                <td class="amount">${fmt(Number(r.cogs_rate || 0))}</td>
                                <td class="${Number(r.gross_profit || 0) >= 0 ? 'amount-green' : 'amount-rose'}">${fmt(Number(r.gross_profit || 0))}</td>
                                <td class="right">${Number(r.gross_margin_pct || 0).toFixed(1)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot><tr class="total-row">
                        <td>Totals</td>
                        <td class="right">${totalQty.toFixed(2)}</td>
                        <td></td>
                        <td></td>
                        <td class="${totalGross >= 0 ? 'amount-green' : 'amount-rose'}">${fmt(totalGross)}</td>
                        <td class="right">${margin.toFixed(1)}%</td>
                    </tr></tfoot>
                </table>
            `}
        </div>

        <div class="rpt-footer">
            WatchDoc · Confidential · For internal use only
        </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────
export function printReport(
    tab: 'repair' | 'sales' | 'financial' | 'profit',
    data: DailyReportData,
    options?: { logoUrl?: string; currencySymbol?: string; decimalPlaces?: number }
): void {
    _logoUrl        = options?.logoUrl        ?? '';
    _currencySymbol = options?.currencySymbol ?? '$';
    _decimalPlaces  = typeof options?.decimalPlaces === 'number' ? options.decimalPlaces : 2;

    const builders: Record<typeof tab, (d: DailyReportData) => string> = {
        repair:    buildRepairHtml,
        sales:     buildSalesHtml,
        financial: buildFinancialHtml,
        profit:    buildProfitHtml,
    };
    const titles = {
        repair:    'Repair Summary',
        sales:     'Daily Sales & Purchase Summary',
        financial: 'Financial Summary',
        profit:    'Profit Summary',
    };

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>WatchDoc — ${titles[tab]}</title>
    <style>${BASE_STYLES}</style>
</head>
<body>
    ${builders[tab](data)}
    <script>
        window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
        };
    <\/script>
</body>
</html>`);
    win.document.close();
}