// Dependency-free .xlsx writer.
// Builds a minimal Office Open XML workbook and wraps it in a ZIP archive
// using "stored" (uncompressed) entries, so no library is needed in the browser.

export type ExcelCell =
    | string
    | number
    | null
    | undefined
    | { date: string | null | undefined }; // ISO yyyy-mm-dd → real Excel date cell

export interface ExcelColumn {
    header: string;
    width?: number; // Excel character widths
}

export interface ExcelSheet {
    name: string;
    columns: ExcelColumn[];
    rows: ExcelCell[][];
}

// ── XML helpers ──────────────────────────────────────────────────────────────
const xmlEscape = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        // Control characters are not allowed in XML 1.0
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const columnName = (index: number): string => {
    let name = '';
    let n = index + 1;
    while (n > 0) {
        const rem = (n - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        n = Math.floor((n - 1) / 26);
    }
    return name;
};

// Excel serial date (1900 date system): days since 1899-12-30.
const excelDateSerial = (iso: string): number | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) return null;
    const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(utc)) return null;
    return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
};

const STYLE_HEADER = 1;
const STYLE_DATE = 2;

const cellXml = (ref: string, value: ExcelCell, style?: number): string => {
    const s = style ? ` s="${style}"` : '';
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') {
        return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
    }
    if (typeof value === 'object') {
        const serial = value.date ? excelDateSerial(value.date) : null;
        if (serial === null) return '';
        return `<c r="${ref}" s="${STYLE_DATE}"><v>${serial}</v></c>`;
    }
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
};

const sheetXml = (sheet: ExcelSheet): string => {
    const colCount = sheet.columns.length;
    const lastCol = columnName(Math.max(colCount - 1, 0));
    const lastRow = sheet.rows.length + 1;

    const cols = sheet.columns
        .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width ?? 16}" customWidth="1"/>`)
        .join('');

    const headerRow = `<row r="1">${sheet.columns
        .map((col, i) => cellXml(`${columnName(i)}1`, col.header, STYLE_HEADER))
        .join('')}</row>`;

    const bodyRows = sheet.rows
        .map((row, r) => {
            const cells = row.map((value, c) => cellXml(`${columnName(c)}${r + 2}`, value)).join('');
            return `<row r="${r + 2}">${cells}</row>`;
        })
        .join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${headerRow}${bodyRows}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
</worksheet>`;
};

const sheetNameSafe = (name: string) => name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet1';

const workbookFiles = (sheet: ExcelSheet): Record<string, string> => ({
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xmlEscape(sheetNameSafe(sheet.name))}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    // cellXfs: 0 = default, 1 = bold header, 2 = date (built-in format 14 = short date)
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    'xl/worksheets/sheet1.xml': sheetXml(sheet),
});

// ── ZIP (stored, no compression) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (d: Date): { time: number; date: number } => ({
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
});

const zipStored = (files: Record<string, string>): Blob => {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const [name, content] of Object.entries(files)) {
        const nameBytes = encoder.encode(name);
        const data = encoder.encode(content);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true); // version needed
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, nameBytes.length, true);
        local.setUint16(28, 0, true);
        localParts.push(new Uint8Array(local.buffer), nameBytes, data);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true); // version made by
        central.setUint16(6, 20, true); // version needed
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint16(12, time, true);
        central.setUint16(14, date, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, data.length, true);
        central.setUint32(24, data.length, true);
        central.setUint16(28, nameBytes.length, true);
        central.setUint16(30, 0, true);
        central.setUint16(32, 0, true);
        central.setUint16(34, 0, true);
        central.setUint16(36, 0, true);
        central.setUint32(38, 0, true);
        central.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, centralParts.length / 2, true);
    end.setUint16(10, centralParts.length / 2, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
};

// ── Public API ───────────────────────────────────────────────────────────────
export const buildExcelBlob = (sheet: ExcelSheet): Blob => zipStored(workbookFiles(sheet));

export function downloadExcel(fileName: string, sheet: ExcelSheet): void {
    const blob = buildExcelBlob(sheet);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// ORDER TRACKER (front-desk list, exported as shown on screen + sortable fields)
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderTrackerExcelRow {
    customer: string;
    mobile: string;
    order: string;
    reference: string;
    watch: string;
    serial: string;
    stage: string;
    since: string;
    answer: string;
    promisedDate: string | null;
    daysLate: number;
    technician: string;
    receivedDate: string | null;
    orderStatus: string;
    priority: string;
    balance: number;
    lastMessage: string;
    lastMessageDate: string | null;
    needsAttention: boolean;
}

const fileSlug = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'list';

export function exportOrderTrackerExcel(listTitle: string, rows: OrderTrackerExcelRow[]): void {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    downloadExcel(`order-tracker-${fileSlug(listTitle)}-${todayIso}.xlsx`, {
        name: 'Order Tracker',
        columns: [
            { header: '#', width: 5 },
            { header: 'Customer', width: 26 },
            { header: 'Mobile', width: 14 },
            { header: 'Order', width: 18 },
            { header: 'Reference', width: 14 },
            { header: 'Watch', width: 28 },
            { header: 'Serial', width: 16 },
            { header: 'Stage', width: 18 },
            { header: 'Since', width: 20 },
            { header: 'Status for the customer', width: 60 },
            { header: 'Promised', width: 12 },
            { header: 'Days late', width: 10 },
            { header: 'Technician', width: 18 },
            { header: 'Received', width: 12 },
            { header: 'Order status', width: 16 },
            { header: 'Priority', width: 10 },
            { header: 'Balance due', width: 12 },
            { header: 'Last message', width: 26 },
            { header: 'Message sent', width: 12 },
            { header: 'Needs follow-up', width: 14 },
        ],
        rows: rows.map((row, index) => [
            index + 1,
            row.customer,
            row.mobile,
            row.order,
            row.reference,
            row.watch,
            row.serial,
            row.stage,
            row.since,
            row.answer,
            { date: row.promisedDate },
            row.daysLate > 0 ? row.daysLate : null,
            row.technician,
            { date: row.receivedDate },
            row.orderStatus,
            row.priority,
            row.balance,
            row.lastMessage,
            { date: row.lastMessageDate },
            row.needsAttention ? 'Yes' : '',
        ]),
    });
}
