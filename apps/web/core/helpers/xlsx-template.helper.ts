/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Minimal browser-native xlsx generator — zero external dependencies.
 * Data validation uses inline lists only (no cross-sheet references)
 * to maximise Excel/LibreOffice/WPS compatibility.
 */

// ─── CRC-32 ──────────────────────────────────────────────────────────────────

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ─── Minimal ZIP builder (store / method=0, no compression) ──────────────────

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

    // ── Local file header (30 + nameLen bytes) ─────────────────────────────
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);         // version needed: 2.0
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, 0, true);          // compression: stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, sz, true);        // compressed size
    lv.setUint32(22, sz, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);         // extra field length
    lh.set(nameBytes, 30);

    // ── Central directory entry (46 + nameLen bytes) ───────────────────────
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);          // flags
    cv.setUint16(10, 0, true);         // compression: stored
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, sz, true);        // compressed size
    cv.setUint32(24, sz, true);        // uncompressed size
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);         // extra field length
    cv.setUint16(32, 0, true);         // file comment length
    cv.setUint16(34, 0, true);         // disk number start
    cv.setUint16(36, 0, true);         // internal file attributes
    cv.setUint32(38, 0, true);         // external file attributes
    cv.setUint32(42, localOffset, true); // relative offset of local header
    cd.set(nameBytes, 46);

    locals.push(lh, data);
    centrals.push(cd);
    localOffset += lh.length + sz;
  }

  // ── End of central directory ───────────────────────────────────────────────
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);   // signature
  ev.setUint16(4, 0, true);            // disk number
  ev.setUint16(6, 0, true);            // disk with start of cd
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true);// total entries
  ev.setUint32(12, cdSize, true);      // size of central directory
  ev.setUint32(16, localOffset, true); // offset of central directory
  ev.setUint16(20, 0, true);           // comment length

  const chunks = [...locals, ...centrals, eocd];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

/** Escape special chars for XML element content */
const x = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Convert 1-based column index to letter(s): 1→A, 26→Z, 27→AA … */
const colLetter = (n: number): string => {
  let s = "";
  while (n > 0) {
    s = String.fromCharCode(64 + (n % 26 || 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/**
 * Build a comma-separated inline-list formula value.
 * Excel limits the formula1 string (including the surrounding quotes) to 255 chars.
 * We keep actual content to ≤ 251 chars to leave room for the 2 quotes + 2 safety chars.
 */
function buildInlineList(values: string[]): string {
  let acc = "";
  for (const v of values) {
    // Strip commas and quotes from individual values to avoid breaking the formula
    const safe = v.replace(/,/g, "，").replace(/"/g, "");
    const next = acc ? `${acc},${safe}` : safe;
    if (next.length > 251) break;
    acc = next;
  }
  return acc;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type TXlsxTemplateParams = {
  headers: string[];
  rows: (string | number)[][];
  columnWidths: number[];
  stateNames: string[];
  priorityValues: string[];
  memberNames: string[];
  moduleNames: string[];
};

// ─── Main export ─────────────────────────────────────────────────────────────

export function generateImportTemplate(params: TXlsxTemplateParams): Uint8Array {
  const { headers, rows, columnWidths, stateNames, priorityValues, memberNames, moduleNames } = params;
  const enc = new TextEncoder();

  // ── Issues sheet ──────────────────────────────────────────────────────────
  const issueRows: string[] = [];

  // Header row — inline strings
  const hCells = headers
    .map((h, i) => `<c r="${colLetter(i + 1)}1" t="inlineStr"><is><t>${x(h)}</t></is></c>`)
    .join("");
  issueRows.push(`<row r="1">${hCells}</row>`);

  // Data rows
  rows.forEach((row, ri) => {
    const rowIdx = ri + 2;
    const cells = row
      .map((cell, ci) => {
        if (cell === "" || cell == null) return "";
        const ref = `${colLetter(ci + 1)}${rowIdx}`;
        if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t>${x(String(cell))}</t></is></c>`;
      })
      .join("");
    if (cells) issueRows.push(`<row r="${rowIdx}">${cells}</row>`);
  });

  // Column widths
  const colsXml = columnWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  // ── Data validations (all inline lists) ───────────────────────────────────
  // col D=State(4) E=Priority(5) F=Assignees(6) H=Modules(8)
  const dvItems: string[] = [];

  const addDv = (sqref: string, list: string) => {
    if (!list) return;
    dvItems.push(
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="${sqref}">` +
        `<formula1>"${list}"</formula1>` +
        `</dataValidation>`
    );
  };

  addDv("E2:E1000", buildInlineList(priorityValues));
  addDv("D2:D1000", buildInlineList(stateNames));
  addDv("F2:F1000", buildInlineList(memberNames));
  addDv("H2:H1000", buildInlineList(moduleNames));

  const dvXml =
    dvItems.length > 0
      ? `<dataValidations count="${dvItems.length}">${dvItems.join("")}</dataValidations>`
      : "";

  // ── Worksheet XML (element order per OOXML spec §18.3.1.99) ───────────────
  const sheet1Xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${colsXml}</cols>` +
    `<sheetData>${issueRows.join("")}</sheetData>` +
    dvXml +
    `</worksheet>`;

  // ── Workbook XML ──────────────────────────────────────────────────────────
  const wbXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="14400" windowHeight="8100"/></bookViews>` +
    `<sheets><sheet name="Issues" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
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

  // ── Assemble ZIP ──────────────────────────────────────────────────────────
  return buildZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(wbXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet1Xml) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml) },
  ]);
}
