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

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.5; }

  /* ── Header ── */
  .rpt-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 3px solid #1a365d; margin-bottom: 20px; }
  .rpt-logo { display: flex; align-items: center; gap: 10px; }
  .rpt-logo-icon { width: 36px; height: 36px; background: #1a365d; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; }
  .rpt-logo-name { font-size: 20px; font-weight: 700; color: #1f2937; letter-spacing: -0.5px; }
  .rpt-meta { text-align: right; }
  .rpt-title { font-size: 16px; font-weight: 700; color: #1a365d; }
  .rpt-date { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .rpt-printed { font-size: 10px; color: #9ca3af; }

  /* ── Stats row ── */
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
  .section-title { font-size: 10px; font-weight: 700; color: #6b7280; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 6px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; break-inside: avoid; }
  .card-full { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; break-inside: avoid; }

  /* ── Tables ── */
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead tr { border-bottom: 2px solid #e5e7eb; }
  th { text-align: left; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  th.right { text-align: right; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; color: #374151; }
  td.right { text-align: right; }
  td.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
  td.amount { text-align: right; font-weight: 600; }
  td.amount-rose { text-align: right; font-weight: 600; color: #f43f5e; }
  td.amount-green { text-align: right; font-weight: 600; color: #059669; }
  tr.total-row td { border-top: 2px solid #e5e7eb; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .empty { text-align: center; color: #9ca3af; font-style: italic; padding: 16px; }

  /* ── Badges ── */
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 500; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }
  .badge-purple { background: #e0e7ff; color: #1a365d; }
  .badge-receive { background: #d1fae5; color: #065f46; }
  .badge-pay { background: #fee2e2; color: #991b1b; }
  .badge-je { background: #ede9fe; color: #5b21b6; }

  /* ── Bar ── */
  .bar-row { margin-bottom: 10px; }
  .bar-meta { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; }
  .bar-track { height: 5px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-fill-teal { background: #14b8a6; }
  .bar-fill-rose { background: #f43f5e; }
  .bar-fill-navy { background: #1a365d; }
  .bar-fill-blue { background: #3b82f6; }
  .bar-fill-purple { background: #8b5cf6; }

  /* Net summary */
  .net-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f3f4f6; align-items: center; }
  .net-row.bold { font-weight: 600; }
  .net-row.subtotal { font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-top: 8px; }
  .net-row.total { font-weight: 700; font-size: 13px; border-top: 2px solid #1a365d; border-bottom: none; padding-top: 10px; margin-top: 4px; }
  .text-green { color: #059669; }
  .text-rose { color: #f43f5e; }
  .text-purple { color: #1a365d; }

  /* ── Tech bar ── */
  .tech-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .tech-avatar { width: 28px; height: 28px; border-radius: 50%; background: #e0e7ff; color: #1a365d; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .tech-info { flex: 1; }
  .tech-name { font-size: 11px; font-weight: 600; color: #1f2937; }
  .tech-bar-track { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .tech-bar-fill { height: 100%; background: #1a365d; border-radius: 2px; }
  .tech-count { font-size: 11px; font-weight: 700; color: #1a365d; white-space: nowrap; }

  /* ── Issue ── */
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

  /* ── Footer ── */
  .rpt-footer { text-align: center; font-size: 10px; color: #9ca3af; padding-top: 12px; border-top: 1px solid #e5e7eb; margin-top: 4px; }

  /* Divider */
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
`;

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

// ─────────────── REPAIR SUMMARY ───────────────
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

// ─────────────── SALES SUMMARY ───────────────
function buildSalesHtml(data: DailyReportData): string {
    const p = data.pos;
    const baseTotal = (p.total_retail_sales ?? 0) + (p.total_b2b_sales ?? 0);

    const paymentSection = p.payment_breakdown.length === 0
        ? `<p class="empty">No payments recorded</p>`
        : `${p.payment_breakdown.map(pm => {
            const pct = baseTotal > 0 ? Math.round((pm.total / baseTotal) * 100) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${pm.mode_of_payment} <span style="color:#9ca3af;font-size:10px">(${pm.txn_count} txn${pm.txn_count !== 1 ? 's' : ''})</span></span>
                    <span><strong>${fmt(pm.total)}</strong> <span style="color:#9ca3af">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-teal" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}`;

    const categorySection = !p.category_breakdown || p.category_breakdown.length === 0
        ? `<p class="empty">No category data</p>`
        : `${p.category_breakdown.map(cat => {
            const pct = (p.net_sales ?? 0) > 0 ? Math.max(0, Math.round((cat.total_amount / (p.net_sales ?? 1)) * 100)) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span style="font-weight:600">${cat.item_group}</span>
                    <span><strong>${fmt(cat.total_amount)}</strong> <span style="color:#9ca3af">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="background:#1a365d;width:${pct}%"></div></div>
            </div>`;
        }).join('')}`;

    const cashierSection = !p.cashier_breakdown || p.cashier_breakdown.length === 0
        ? `<p class="empty">No cashier data</p>`
        : `<table>
            <thead><tr>
                <th>Cashier / User</th><th class="right">Transactions</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${p.cashier_breakdown.map(c => `<tr>
                    <td>${c.owner}</td>
                    <td class="right">${c.count}</td>
                    <td class="amount">${fmt(c.total)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    const itemsSection = p.items_sold.length === 0
        ? `<p class="empty">No items sold</p>`
        : `<table>
            <thead><tr>
                <th>Item</th><th class="right">Qty</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${p.items_sold.map(item => `<tr>
                    <td>${item.item_name}</td>
                    <td class="right">${item.total_qty}</td>
                    <td class="amount">${fmt(item.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;

    return `
        ${header('Sales Summary', data.date)}

        <div class="stats stats-4">
            <div class="stat stat-teal">
                <div class="stat-label">Net Sales</div>
                <div class="stat-value">${fmt(p.net_sales ?? 0)}</div>
                <div class="stat-sub">Gross minus returns</div>
            </div>
            <div class="stat stat-indigo">
                <div class="stat-label">Retail (POS)</div>
                <div class="stat-value">${fmt(p.total_retail_sales ?? 0)}</div>
            </div>
            <div class="stat stat-blue">
                <div class="stat-label">B2B / Custom</div>
                <div class="stat-value">${fmt(p.total_b2b_sales ?? 0)}</div>
            </div>
            <div class="stat stat-rose">
                <div class="stat-label">Returns</div>
                <div class="stat-value">${fmt(p.total_returns ?? 0)}</div>
            </div>
        </div>

        <div class="grid-2">
            <div class="card">
                <div class="section-title">Sales by Category</div>
                ${categorySection}
            </div>
            <div class="card">
                <div class="section-title">Sales by Cashier</div>
                ${cashierSection}
            </div>
            <div class="card">
                <div class="section-title">Payment Methods</div>
                ${paymentSection}
            </div>
            <div class="card">
                <div class="section-title">Items Sold</div>
                ${itemsSection}
            </div>
        </div>`;
}

// ─────────────── FINANCIAL SUMMARY (REDESIGNED) ───────────────
function buildFinancialHtml(data: DailyReportData): string {
    const r = data.repair;
    const p = data.pos;
    const fin = data.financial ?? { total_expenses: 0, expense_breakdown: [], expense_entries: [], repair_payment_breakdown: [] };

    const retailSales = p.total_retail_sales ?? 0;
    const repairRevenue = r.revenue;
    const returns = p.total_returns ?? 0;
    const totalIncome = retailSales + repairRevenue;
    const totalOutflow = fin.total_expenses;
    const net = totalIncome - totalOutflow;
    const netClass = net >= 0 ? 'text-green' : 'text-rose';
    const netLabel = net >= 0 ? '▲ Positive day' : '▼ Negative day';
    const netLabelColor = net >= 0 ? '#059669' : '#f43f5e';

    // ── Income payment mode bars ──
    const incomeModeMap = new Map<string, number>();
    p.payment_breakdown.forEach(pm => {
        incomeModeMap.set(pm.mode_of_payment, (incomeModeMap.get(pm.mode_of_payment) ?? 0) + pm.total);
    });
    (fin.repair_payment_breakdown ?? []).forEach(rm => {
        incomeModeMap.set(rm.mode_of_payment, (incomeModeMap.get(rm.mode_of_payment) ?? 0) + rm.total);
    });
    const incomeModes = Array.from(incomeModeMap.entries())
        .map(([mode, total]) => ({ mode, total }))
        .sort((a, b) => b.total - a.total);

    const modeColors = ['#1a365d', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b'];
    const incomeModeBarsHtml = incomeModes.length === 0
        ? `<p class="empty">No payment mode data</p>`
        : incomeModes.map((m, i) => {
            const pct = totalIncome > 0 ? Math.round((m.total / totalIncome) * 100) : 0;
            const color = modeColors[i % modeColors.length];
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${m.mode}</span>
                    <span style="font-weight:600">${fmt(m.total)} <span style="color:#9ca3af;font-weight:400">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="background:${color};width:${pct}%"></div></div>
            </div>`;
        }).join('');

    // ── Outflow breakdown ──
    const pePurchases = fin.pe_purchases ?? [];
    const peOperatingByMode = fin.pe_operating_by_mode ?? fin.pe_pay_by_mode ?? [];
    const jeEntries = fin.je_entries ?? [];

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

    const purchasesTotal = fin.total_pe_purchases ?? 0;
    const expensesTotal = (fin.total_pe_operating ?? 0) + (fin.je_total ?? 0);

    // ── Cash flow by payment mode table ──
    const modeSet = new Set<string>();
    p.payment_breakdown.forEach(pm => modeSet.add(pm.mode_of_payment));
    (fin.repair_payment_breakdown ?? []).forEach(rp => modeSet.add(rp.mode_of_payment));
    fin.expense_breakdown.forEach(e => modeSet.add(e.mode_of_payment));

    const modeBalances = Array.from(modeSet).map(mode => {
        const posInc = p.payment_breakdown.find(pm => pm.mode_of_payment === mode)?.total ?? 0;
        const repInc = (fin.repair_payment_breakdown ?? []).find((rp: any) => rp.mode_of_payment === mode)?.total ?? 0;
        const income = posInc + repInc;
        const expenses = fin.expense_breakdown.find(e => e.mode_of_payment === mode)?.total ?? 0;
        return { mode, income, expenses, balance: income - expenses };
    });

    const modeTableTotalIncome = modeBalances.reduce((s, m) => s + m.income, 0);
    const modeTableTotalExp = modeBalances.reduce((s, m) => s + m.expenses, 0);
    const modeTableNet = modeTableTotalIncome - modeTableTotalExp;

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
                    const pct = modeTableTotalIncome > 0 ? Math.round((mb.income / modeTableTotalIncome) * 100) : 0;
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

    // ── All entries table ──
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

        <!-- KPI Strip: 4 cards for quick executive read -->
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

        <!-- Income & Outflow side-by-side -->
        <div class="grid-2">
            <!-- Income -->
            <div class="card">
                <div class="section-title">Income breakdown</div>

                <div class="stream-label">
                    <div class="stream-dot" style="background:#059669"></div>
                    <div class="stream-label-text" style="color:#059669">Sales stream</div>
                    <div class="stream-label-line"></div>
                </div>
                <div class="net-row"><span>Retail (POS)</span><span class="text-green">${fmt(retailSales)}</span></div>
                <div class="net-row"><span>Repair invoices</span><span class="text-green">${fmt(repairRevenue)}</span></div>
                <div class="net-row"><span style="color:#9ca3af">Returns</span><span class="text-rose">− ${fmt(returns)}</span></div>

                <div class="stream-label" style="margin-top:14px">
                    <div class="stream-dot" style="background:#1a365d"></div>
                    <div class="stream-label-text" style="color:#1a365d">By payment mode</div>
                    <div class="stream-label-line"></div>
                </div>
                ${incomeModeBarsHtml}

                <div class="net-row total"><span>Total Income</span><span class="text-green">${fmt(totalIncome)}</span></div>
            </div>

            <!-- Outflow -->
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

        <!-- Cash Flow by Payment Mode — promoted as key summary table -->
        <div class="card-full">
            <div class="section-title">Cash flow by payment mode</div>
            ${modeTableHtml}
        </div>

        <!-- All Entries — detailed audit trail -->
        ${allEntriesHtml}

        <div class="rpt-footer">
            WatchDoc · Confidential · For internal use only
        </div>`;
}

// ─────────────── Main entry point ───────────────
export function printReport(
    tab: 'repair' | 'sales' | 'financial',
    data: DailyReportData,
    options?: { logoUrl?: string; currencySymbol?: string; decimalPlaces?: number }
): void {
    _logoUrl = options?.logoUrl ?? '';
    _currencySymbol = options?.currencySymbol ?? '$';
    _decimalPlaces = typeof options?.decimalPlaces === 'number' ? options.decimalPlaces : 2;

    const builders: Record<typeof tab, (d: DailyReportData) => string> = {
        repair: buildRepairHtml,
        sales: buildSalesHtml,
        financial: buildFinancialHtml,
    };
    const titles = { repair: 'Repair Summary', sales: 'Sales Summary', financial: 'Financial Summary' };

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