/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Generates a multi-sheet project statistics Excel report.
 * Reuses the ZIP builder logic from xlsx-template.helper.ts.
 */

import type { TProjectStats } from "./project-stats.helper";

// ─── Shared ZIP builder (duplicated minimal version to keep helpers independent) ─

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) >>> 0;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) >>> 0;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const sz = data.length;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, sz, true); lv.setUint32(22, sz, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true); cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, sz, true);
    cv.setUint32(24, sz, true); cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true); cv.setUint32(42, localOffset, true);
    cd.set(nameBytes, 46);

    locals.push(lh, data);
    centrals.push(cd);
    localOffset += lh.length + sz;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, localOffset, true); ev.setUint16(20, 0, true);

  const chunks = [...locals, ...centrals, eocd];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

const x = (s: string | number) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const colLetter = (n: number): string => {
  let s = "";
  while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

/** Build a worksheet XML from a 2D array. Row 1 is treated as header. */
function buildWorksheet(rows: (string | number)[][], colWidths?: number[]): string {
  const rowsXml = rows.map((row, ri) => {
    const rowIdx = ri + 1;
    const cells = row
      .map((cell, ci) => {
        const ref = `${colLetter(ci + 1)}${rowIdx}`;
        if (cell === "" || cell == null) return "";
        if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t>${x(cell)}</t></is></c>`;
      })
      .join("");
    return cells ? `<row r="${rowIdx}">${cells}</row>` : "";
  }).filter(Boolean).join("");

  const colsXml = colWidths
    ? colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (colsXml ? `<cols>${colsXml}</cols>` : "") +
    `<sheetData>${rowsXml}</sheetData>` +
    `</worksheet>`
  );
}

// ─── Labels (passed in from the caller for i18n) ──────────────────────────────

export type TReportLabels = {
  sheetOverview: string;
  sheetRisk: string;
  sheetMembers: string;
  sheetModules: string;
  totalIssues: string;
  completed: string;
  inProgress: string;
  unstarted: string;
  cancelled: string;
  completionRate: string;
  estimateHours: string;
  actualHours: string;
  completedHours: string;
  remainingHours: string;
  hoursCompletionRate: string;
  hoursVariance: string;
  riskOverdue: string;
  riskDueSoon: string;
  riskHighPriority: string;
  memberName: string;
  issueCount: string;
  moduleName: string;
  moduleCompleted: string;
  issueName: string;
  priority: string;
  dueDate: string;
  assignees: string;
};

// ─── Sheet builders ───────────────────────────────────────────────────────────

function buildOverviewSheet(stats: TProjectStats, L: TReportLabels & { sheetHours?: string }): string {
  const { overview: o, hours: h } = stats;
  const pct = (n: number) => `${n}%`;

  const rows: (string | number)[][] = [
    // Overview section
    [L.sheetOverview],
    [L.totalIssues, o.total],
    [L.completed, o.completed],
    [L.inProgress, o.inProgress],
    [L.unstarted, o.unstarted],
    [L.cancelled, o.cancelled],
    [L.completionRate, pct(o.completionRate)],
    [""],
    // Hours section
    [L.sheetHours ?? L.estimateHours],
    [L.estimateHours, h.estimateHours],
    [L.actualHours, h.actualHours],
    [L.completedHours, h.completedHours],
    [L.remainingHours, h.remainingHours],
    [L.hoursCompletionRate, pct(h.hoursCompletionRate)],
    [L.hoursVariance, h.hoursVariance],
  ];

  return buildWorksheet(rows, [30, 20]);
}

function buildRiskSheet(stats: TProjectStats, L: TReportLabels): string {
  const rows: (string | number)[][] = [];
  const priorityLabel: Record<string, string> = {
    urgent: "🔴 緊急", high: "🟠 高", medium: "🟡 中", low: "🟢 低", none: "⚪ 無",
  };
  const addSection = (title: string, list: typeof stats.risk.overdue) => {
    rows.push([title]);
    if (list.length === 0) {
      rows.push(["—"]);
    } else {
      rows.push([L.issueName, L.priority, L.dueDate, L.assignees]);
      list.forEach((i) =>
        rows.push([i.name, priorityLabel[i.priority] ?? i.priority, i.targetDate ?? "—", i.assigneeNames.join(", ")])
      );
    }
    rows.push([""]);
  };

  addSection(L.riskOverdue, stats.risk.overdue);
  addSection(L.riskDueSoon, stats.risk.dueSoon);
  addSection(L.riskHighPriority, stats.risk.highPriorityUnfinished);

  return buildWorksheet(rows, [40, 12, 14, 24]);
}

function buildMembersSheet(stats: TProjectStats, L: TReportLabels): string {
  const rows: (string | number)[][] = [
    [L.memberName, L.issueCount, L.estimateHours, L.actualHours, L.completedHours, L.remainingHours],
    ...stats.memberHours.map((m) => [
      m.memberName,
      m.issueCount,
      m.estimateHours,
      m.actualHours,
      m.completedHours,
      m.remainingHours,
    ]),
  ];
  return buildWorksheet(rows, [22, 10, 14, 14, 16, 14]);
}

function buildModulesSheet(stats: TProjectStats, L: TReportLabels): string {
  const rows: (string | number)[][] = [
    [L.moduleName, L.issueCount, L.moduleCompleted, L.completionRate, L.estimateHours, L.actualHours, L.remainingHours],
    ...stats.moduleProgress.map((m) => [
      m.moduleName,
      m.issueCount,
      m.completedCount,
      `${m.completionRate}%`,
      m.estimateHours,
      m.actualHours,
      m.remainingHours,
    ]),
  ];
  return buildWorksheet(rows, [22, 10, 10, 12, 14, 14, 14]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateReportXlsx(
  stats: TProjectStats,
  labels: TReportLabels & { sheetHours?: string }
): Uint8Array {
  const enc = new TextEncoder();

  const sheets = [
    { name: labels.sheetOverview, xml: buildOverviewSheet(stats, labels) },
    { name: labels.sheetRisk, xml: buildRiskSheet(stats, labels) },
    { name: labels.sheetMembers, xml: buildMembersSheet(stats, labels) },
    { name: labels.sheetModules, xml: buildModulesSheet(stats, labels) },
  ];

  // Workbook with all 4 sheets
  const sheetDefs = sheets
    .map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  const wbXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16384" windowHeight="9000"/></bookViews>` +
    `<sheets>${sheetDefs}</sheets>` +
    `</workbook>`;

  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" ` +
          `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
          `Target="worksheets/sheet${i + 1}.xml"/>`
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" ` +
    `Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const sheetOverrides = sheets
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheetOverrides +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const zipFiles: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(wbXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(s.xml),
    })),
    { name: "xl/styles.xml", data: enc.encode(stylesXml) },
  ];

  return buildZip(zipFiles);
}
