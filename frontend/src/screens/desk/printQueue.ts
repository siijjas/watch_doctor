// Print of the front desk list, kept from the old report print module.

let _logoUrl = '';

const fmtDate = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

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
  .card-full-flow { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 14px; }

  /* ── Tables ── */
  thead { display: table-header-group; }
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

export interface OrderTrackerPrintRow {
    customer: string;
    mobile: string;
    order: string;
    watch: string;
    serial: string;
    stage: string;
    since: string;
    answer: string;
    promised: string;
    lastMessage: string;
    needsAttention: boolean;
}

const escapeHtml = (value: string) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export function printOrderTracker(
    listTitle: string,
    rows: OrderTrackerPrintRow[],
    options?: { logoUrl?: string }
): void {
    _logoUrl = options?.logoUrl ?? '';

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const followUp = rows.filter(row => row.needsAttention).length;

    const body = rows.map((row, index) => `
            <tr>
                <td class="mono">${index + 1}</td>
                <td><strong>${escapeHtml(row.customer)}</strong>${row.mobile ? `<br>${escapeHtml(row.mobile)}` : ''}</td>
                <td class="mono">${escapeHtml(row.order)}</td>
                <td>${escapeHtml(row.watch)}${row.serial ? `<br><span class="sub">S/N ${escapeHtml(row.serial)}</span>` : ''}</td>
                <td><strong>${escapeHtml(row.stage)}</strong><br><span class="${row.needsAttention ? 'text-rose' : 'sub'}">${escapeHtml(row.since)}</span></td>
                <td>${escapeHtml(row.answer)}${row.promised ? `<br><span class="sub">${escapeHtml(row.promised)}</span>` : ''}</td>
                <td>${escapeHtml(row.lastMessage)}</td>
            </tr>`).join('');

    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>WatchDoc — Order Tracker</title>
    <style>${BASE_STYLES}
      @page { size: A4 landscape; margin: 12mm; }
      .sub { font-size: 10px; color: #6b7280; }
      td { vertical-align: top; }
      tr { break-inside: avoid; }
    </style>
</head>
<body>
    ${header(`Order Tracker — ${escapeHtml(listTitle)}`, todayIso)}
    <div class="section">
        <div class="section-title">${rows.length} ${rows.length === 1 ? 'watch' : 'watches'}${followUp ? ` · ${followUp} need follow-up` : ''}</div>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Customer</th>
                    <th>Order</th>
                    <th>Watch</th>
                    <th>Stage</th>
                    <th>Status for the customer</th>
                    <th>Last message</th>
                </tr>
            </thead>
            <tbody>${body || '<tr><td colspan="7" class="empty">No watches in this list.</td></tr>'}</tbody>
        </table>
    </div>
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
