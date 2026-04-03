import type { DailyReportData } from './reportShared';

const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const BASE_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; background: #fff; font-size: 12px; line-height: 1.5; }

  /* ── Header ── */
  .rpt-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 3px solid #7c3aed; margin-bottom: 20px; }
  .rpt-logo { display: flex; align-items: center; gap: 10px; }
  .rpt-logo-icon { width: 36px; height: 36px; background: #7c3aed; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 18px; }
  .rpt-logo-name { font-size: 20px; font-weight: 700; color: #1f2937; letter-spacing: -0.5px; }
  .rpt-meta { text-align: right; }
  .rpt-title { font-size: 16px; font-weight: 700; color: #7c3aed; }
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
  .stat-accent { border-top: 3px solid #7c3aed; }
  .stat-green { border-top: 3px solid #10b981; }
  .stat-amber { border-top: 3px solid #f59e0b; }
  .stat-blue { border-top: 3px solid #3b82f6; }
  .stat-teal { border-top: 3px solid #14b8a6; }
  .stat-rose { border-top: 3px solid #f43f5e; }
  .stat-pink { border-top: 3px solid #ec4899; }
  .stat-indigo { border-top: 3px solid #6366f1; }

  /* ── Sections ── */
  .section { margin-bottom: 20px; break-inside: avoid; }
  .section-title { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 6px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; break-inside: avoid; }
  .card-full { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin-bottom: 16px; break-inside: avoid; }

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
  tr.total-row td { border-top: 2px solid #e5e7eb; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .empty { text-align: center; color: #9ca3af; font-style: italic; padding: 16px; }

  /* ── Badges ── */
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 500; }
  .badge-yellow { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }
  .badge-purple { background: #ede9fe; color: #6d28d9; }

  /* ── Bar ── */
  .bar-row { margin-bottom: 10px; }
  .bar-meta { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; }
  .bar-track { height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-fill-teal { background: #14b8a6; }
  .bar-fill-rose { background: #f43f5e; }

  /* Net summary */
  .net-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; border-bottom: 1px solid #f3f4f6; }
  .net-row.subtotal { font-weight: 600; border-bottom: 1px solid #e5e7eb; padding-top: 8px; }
  .net-row.total { font-weight: 700; font-size: 14px; border-top: 2px solid #7c3aed; border-bottom: none; padding-top: 10px; margin-top: 4px; }
  .text-green { color: #059669; }
  .text-rose { color: #f43f5e; }
  .text-purple { color: #7c3aed; }

  /* ── Tech bar ── */
  .tech-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .tech-avatar { width: 28px; height: 28px; border-radius: 50%; background: #ede9fe; color: #6d28d9; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .tech-info { flex: 1; }
  .tech-name { font-size: 11px; font-weight: 600; color: #1f2937; }
  .tech-bar-track { height: 4px; background: #f3f4f6; border-radius: 2px; overflow: hidden; margin-top: 4px; }
  .tech-bar-fill { height: 100%; background: #6366f1; border-radius: 2px; }
  .tech-count { font-size: 11px; font-weight: 700; color: #6366f1; white-space: nowrap; }

  /* ── Issue ── */
  .issue-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
  .issue-rank { width: 18px; text-align: center; font-size: 11px; font-weight: 700; color: #9ca3af; }
  .issue-name { flex: 1; font-size: 11px; color: #374151; }
  .issue-count { font-size: 10px; font-weight: 700; background: #fef3c7; color: #92400e; padding: 1px 7px; border-radius: 10px; }

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

function header(title: string, date: string): string {
    const now = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    return `
    <div class="rpt-header">
        <div class="rpt-logo">
            <div class="rpt-logo-icon">⌚</div>
            <div class="rpt-logo-name">WatchDoc</div>
        </div>
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
                    <td class="amount">${o.invoiced_amount ? '$' + fmt(o.invoiced_amount) : '—'}</td>
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
                    <td class="amount">$${fmt(p.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="right">${partsTotalQty}</td>
                <td class="amount">$${fmt(partsTotalAmt)}</td>
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
    const totalQty = p.items_sold.reduce((s, i) => s + i.total_qty, 0);

    const paymentSection = p.payment_breakdown.length === 0
        ? `<p class="empty">No POS payments</p>`
        : `${p.payment_breakdown.map(pm => {
            const pct = p.total_sales > 0 ? Math.round((pm.total / p.total_sales) * 100) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${pm.mode_of_payment} <span style="color:#9ca3af;font-size:10px">(${pm.txn_count} txn${pm.txn_count !== 1 ? 's' : ''})</span></span>
                    <span><strong>$${fmt(pm.total)}</strong> <span style="color:#9ca3af">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-teal" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px">
            <span>Total</span><span>$${fmt(p.total_sales)}</span>
        </div>`;

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
                    <td class="amount">$${fmt(item.total_amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="right">${totalQty}</td>
                <td class="amount">$${fmt(p.total_sales)}</td>
            </tr></tfoot>
        </table>`;

    return `
        ${header('Sales Summary', data.date)}

        <div class="stats stats-3">
            <div class="stat stat-teal">
                <div class="stat-label">POS Total Sales</div>
                <div class="stat-value">$${fmt(p.total_sales)}</div>
            </div>
            <div class="stat stat-indigo">
                <div class="stat-label">Transactions</div>
                <div class="stat-value">${p.transaction_count}</div>
            </div>
            <div class="stat stat-blue">
                <div class="stat-label">Items Sold (qty)</div>
                <div class="stat-value">${totalQty}</div>
            </div>
        </div>

        <div class="grid-2">
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

// ─────────────── FINANCIAL SUMMARY ───────────────
function buildFinancialHtml(data: DailyReportData): string {
    const r = data.repair;
    const p = data.pos;
    const fin = data.financial ?? { total_expenses: 0, expense_breakdown: [], expense_entries: [], repair_payment_breakdown: [] };
    const totalRevenue = r.revenue + p.total_sales;
    const net = totalRevenue - fin.total_expenses;
    const netClass = net >= 0 ? 'text-green' : 'text-rose';

    const expenseBreakdown = fin.expense_breakdown.length === 0
        ? `<p class="empty">No expenses for configured payment modes</p>`
        : `${fin.expense_breakdown.map(e => {
            const pct = fin.total_expenses > 0 ? Math.round((e.total / fin.total_expenses) * 100) : 0;
            return `<div class="bar-row">
                <div class="bar-meta">
                    <span>${e.mode_of_payment} <span style="color:#9ca3af;font-size:10px">(${e.count} ${e.count === 1 ? 'entry' : 'entries'})</span></span>
                    <span><strong class="text-rose">$${fmt(e.total)}</strong> <span style="color:#9ca3af">${pct}%</span></span>
                </div>
                <div class="bar-track"><div class="bar-fill bar-fill-rose" style="width:${pct}%"></div></div>
            </div>`;
        }).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px">
            <span>Total Expenses</span>
            <span class="text-rose">$${fmt(fin.total_expenses)}</span>
        </div>`;

    const expenseEntries = !fin.expense_entries || fin.expense_entries.length === 0
        ? `<p class="empty">No expense entries</p>`
        : `<table>
            <thead><tr>
                <th>Entry</th><th>Mode</th><th>Debit Account</th><th>Remarks</th><th class="right">Amount</th>
            </tr></thead>
            <tbody>
                ${fin.expense_entries.map(e => `<tr>
                    <td class="mono">${e.name}</td>
                    <td>${e.mode_of_payment}</td>
                    <td>${e.debit_account || '—'}</td>
                    <td>${e.remarks || '—'}</td>
                    <td class="amount-rose">$${fmt(e.amount)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td colspan="4">Total</td>
                <td class="amount-rose">$${fmt(fin.total_expenses)}</td>
            </tr></tfoot>
        </table>`;

    // Payment mode balance
    const modeSet = new Set<string>();
    p.payment_breakdown.forEach(pm => modeSet.add(pm.mode_of_payment));
    (fin.repair_payment_breakdown ?? []).forEach(rp => modeSet.add(rp.mode_of_payment));
    fin.expense_breakdown.forEach(e => modeSet.add(e.mode_of_payment));
    const modeBalances = Array.from(modeSet).map(mode => {
        const posInc = p.payment_breakdown.find(pm => pm.mode_of_payment === mode)?.total ?? 0;
        const repInc = (fin.repair_payment_breakdown ?? []).find(rp => rp.mode_of_payment === mode)?.total ?? 0;
        const income = posInc + repInc;
        const expenses = fin.expense_breakdown.find(e => e.mode_of_payment === mode)?.total ?? 0;
        return { mode, income, expenses, balance: income - expenses };
    });
    const totalIncome = modeBalances.reduce((s, m) => s + m.income, 0);
    const totalExpOut = modeBalances.reduce((s, m) => s + m.expenses, 0);

    const modeBalanceTable = modeBalances.length === 0
        ? `<p class="empty">No payment mode data</p>`
        : `<table>
            <thead><tr>
                <th>Mode</th><th class="right">Income (In)</th><th class="right">Expenses (Out)</th><th class="right">Balance</th>
            </tr></thead>
            <tbody>
                ${modeBalances.map(mb => `<tr>
                    <td>${mb.mode}</td>
                    <td class="amount">$${fmt(mb.income)}</td>
                    <td class="${mb.expenses > 0 ? 'amount-rose' : 'right'} ">${mb.expenses > 0 ? `$${fmt(mb.expenses)}` : '—'}</td>
                    <td class="${mb.balance >= 0 ? 'amount' : 'amount-rose'}">${mb.balance < 0 ? '−' : ''}$${fmt(Math.abs(mb.balance))}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr class="total-row">
                <td>Total</td>
                <td class="amount">$${fmt(totalIncome)}</td>
                <td class="amount-rose">$${fmt(totalExpOut)}</td>
                <td class="${net >= 0 ? 'amount' : 'amount-rose'}">${net < 0 ? '−' : ''}$${fmt(Math.abs(net))}</td>
            </tr></tfoot>
        </table>`;

    return `
        ${header('Financial Summary', data.date)}

        <div class="stats stats-3">
            <div class="stat stat-green">
                <div class="stat-label">Total Revenue</div>
                <div class="stat-value">$${fmt(totalRevenue)}</div>
            </div>
            <div class="stat stat-rose">
                <div class="stat-label">Total Expenses</div>
                <div class="stat-value">$${fmt(fin.total_expenses)}</div>
            </div>
            <div class="stat ${net >= 0 ? 'stat-green' : 'stat-rose'}">
                <div class="stat-label">Net Revenue</div>
                <div class="stat-value ${netClass}">${net < 0 ? '−' : ''}$${fmt(Math.abs(net))}</div>
                <div class="stat-sub">${net >= 0 ? 'Profitable' : 'Loss'}</div>
            </div>
        </div>

        <div class="card-full">
            <div class="section-title">Payment Mode Balance</div>
            ${modeBalanceTable}
        </div>

        <div class="grid-2">
            <div class="card">
                <div class="section-title">Net Revenue Summary</div>
                <div class="net-row"><span>Repair Revenue</span><span>$${fmt(r.revenue)}</span></div>
                <div class="net-row"><span>POS Revenue</span><span>$${fmt(p.total_sales)}</span></div>
                <div class="net-row subtotal"><span>Total Revenue</span><span>$${fmt(totalRevenue)}</span></div>
                <div class="net-row"><span>Total Expenses</span><span class="text-rose">− $${fmt(fin.total_expenses)}</span></div>
                <div class="net-row total"><span>Net Revenue</span><span class="${netClass}">${net < 0 ? '−' : ''}$${fmt(Math.abs(net))}</span></div>
            </div>
            <div class="card">
                <div class="section-title">Expenses by Payment Mode</div>
                ${expenseBreakdown}
            </div>
        </div>

        <div class="card-full">
            <div class="section-title">Expense Details</div>
            ${expenseEntries}
        </div>

        <div class="card-full">
            <div class="section-title">POS — Payment Methods</div>
            ${p.payment_breakdown.length === 0
                ? `<p class="empty">No POS payments</p>`
                : `<table>
                    <thead><tr>
                        <th>Mode</th><th>Transactions</th><th class="right">Amount</th>
                    </tr></thead>
                    <tbody>
                        ${p.payment_breakdown.map(pm => `<tr>
                            <td>${pm.mode_of_payment}</td>
                            <td>${pm.txn_count}</td>
                            <td class="amount">$${fmt(pm.total)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot><tr class="total-row">
                        <td colspan="2">Total POS</td>
                        <td class="amount">$${fmt(p.total_sales)}</td>
                    </tr></tfoot>
                </table>`}
        </div>

        <div class="grid-2">
            <div class="card">
                <div class="section-title">Transaction Details — Repair</div>
                <div class="net-row"><span>Invoices Issued</span><span>${r.invoice_count}</span></div>
                <div class="net-row"><span>Total Invoiced</span><span>$${fmt(r.revenue)}</span></div>
                ${r.invoice_count > 0 ? `<div class="net-row"><span>Avg. per Invoice</span><span>$${fmt(r.revenue / r.invoice_count)}</span></div>` : ''}
                <div class="net-row"><span>Orders Completed</span><span>${r.completed_count}</span></div>
            </div>
            <div class="card">
                <div class="section-title">Transaction Details — POS</div>
                <div class="net-row"><span>Transactions</span><span>${p.transaction_count}</span></div>
                <div class="net-row"><span>Total Sales</span><span>$${fmt(p.total_sales)}</span></div>
                <div class="net-row"><span>Unique Items Sold</span><span>${p.items_sold.length}</span></div>
                ${fin.expense_breakdown.length > 0
                    ? `<div class="net-row"><span>Expense Entries</span><span>${fin.expense_entries?.length ?? 0}</span></div>` : ''}
            </div>
        </div>`;
}

// ─────────────── Main entry point ───────────────
export function printReport(tab: 'repair' | 'sales' | 'financial', data: DailyReportData): void {
    const builders: Record<typeof tab, (d: DailyReportData) => string> = {
        repair: buildRepairHtml,
        sales: buildSalesHtml,
        financial: buildFinancialHtml,
    };
    const bodyHtml = builders[tab](data);
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
    ${bodyHtml}
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
