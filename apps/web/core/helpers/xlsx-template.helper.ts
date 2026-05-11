/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Minimal browser-native xlsx generator (no external dependencies).
 * Creates a valid .xlsx file (Office Open XML) with data-validation dropdowns.
 * Files are stored uncompressed (ZIP method 0) — perfectly valid xlsx.
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

// ─── Minimal ZIP builder (store / method=0) ───────────────────────────────────

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) >>> 0;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) >>> 0;

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  const u32 = (buf: Uint8Array, off: number, v: number) => new DataView(buf.buffer, buf.byteOffset).setUint32(off, v, true);
  const u16 = (buf: Uint8Array, off: number, v: number) => new DataView(buf.buffer, buf.byteOffset).setUint16(off, v, true);

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const sz = data.length;

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    u32(lh, 0, 0x04034b50); u16(lh, 4, 20); u16(lh, 6, 0); u16(lh, 8, 0);
    u16(lh, 10, dosTime); u16(lh, 12, dosDate);
    u32(lh, 14, crc); u32(lh, 18, sz); u32(lh, 22, sz);
    u16(lh, 26, nameBytes.length); u16(lh, 28, 0);
    lh.set(nameBytes, 30);

    // Central directory entry (46 bytes + name)
    const cd = new Uint8Array(46 + nameBytes.length);
    u32(cd, 0, 0x02014b50); u16(cd, 4, 20); u16(cd, 6, 20); u16(cd, 8, 0); u16(cd, 10, 0);
    u16(cd, 12, dosTime); u16(cd, 14, dosDate);
    u32(cd, 16, crc); u32(cd, 20, sz); u32(cd, 24, sz);
    u16(cd, 28, nameBytes.length); u16(cd, 30, 0); u16(cd, 32, 0);
    u16(cd, 34, 0); u16(cd, 36, 0); u32(cd, 38, 0); u32(cd, 42, localOffset);
    cd.set(nameBytes, 46);

    locals.push(lh, data);
    centrals.push(cd);
    localOffset += lh.length + sz;
  }

  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  u32(eocd, 0, 0x06054b50); u16(eocd, 4, 0); u16(eocd, 6, 0);
  u16(eocd, 8, files.length); u16(eocd, 10, files.length);
  u32(eocd, 12, cdSize); u32(eocd, 16, localOffset); u16(eocd, 20, 0);

  const chunks = [...locals, ...centrals, eocd];
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Main export ─────────────────────────────────────────────────────────────

export type TXlsxTemplateParams = {
  headers: string[];
  rows: (string | number)[][];
  columnWidths: number[];
  stateNames: string[];
  priorityValues: string[];
  memberNames: string[];
  moduleNames: string[];
};

export function generateImportTemplate(params: TXlsxTemplateParams): Uint8Array {
  const { headers, rows, columnWidths, stateNames, priorityValues, memberNames, moduleNames } = params;
  const enc = new TextEncoder();

  // ── Shared strings ────────────────────────────────────────────────────────
  const strings: string[] = [];
  const strMap = new Map<string, number>();
  const si = (s: string): number => {
    if (!strMap.has(s)) { strMap.set(s, strings.length); strings.push(s); }
    return strMap.get(s)!;
  };

  // Pre-register (order matters: determines string indices)
  headers.forEach(si);
  rows.forEach((r) => r.forEach((c) => { if (typeof c === "string" && c) si(c); }));
  ["狀態", "優先級", "指派成員", "模組"].forEach(si);
  stateNames.forEach(si);
  priorityValues.forEach(si);
  memberNames.forEach(si);
  moduleNames.forEach(si);

  const colLetter = (n: number) => {
    let s = "";
    while (n > 0) { s = String.fromCharCode(64 + (n % 26 || 26)) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  // ── Issues sheet ──────────────────────────────────────────────────────────
  const issueRows: string[] = [];

  // Header row
  const hCells = headers.map((h, i) => `<c r="${colLetter(i + 1)}1" t="s"><v>${si(h)}</v></c>`).join("");
  issueRows.push(`<row r="1">${hCells}</row>`);

  // Data rows
  rows.forEach((row, ri) => {
    const rowIdx = ri + 2;
    const cells = row
      .map((cell, ci) => {
        if (cell === "" || cell == null) return "";
        const ref = `${colLetter(ci + 1)}${rowIdx}`;
        return typeof cell === "number"
          ? `<c r="${ref}"><v>${cell}</v></c>`
          : `<c r="${ref}" t="s"><v>${si(String(cell))}</v></c>`;
      })
      .join("");
    if (cells) issueRows.push(`<row r="${rowIdx}">${cells}</row>`);
  });

  // Column widths
  const colsXml = columnWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");

  // Data validations
  const dvItems: string[] = [
    // Priority — inline list
    `<dataValidation type="list" allowBlank="1" sqref="E2:E1000"><formula1>"${esc(priorityValues.join(","))}"</formula1></dataValidation>`,
  ];
  if (stateNames.length > 0)
    dvItems.push(`<dataValidation type="list" allowBlank="1" sqref="D2:D1000"><formula1>Lists!$A$2:$A$${stateNames.length + 1}</formula1></dataValidation>`);
  if (memberNames.length > 0)
    dvItems.push(`<dataValidation type="list" allowBlank="1" sqref="F2:F1000"><formula1>Lists!$C$2:$C$${memberNames.length + 1}</formula1></dataValidation>`);
  if (moduleNames.length > 0)
    dvItems.push(`<dataValidation type="list" allowBlank="1" sqref="H2:H1000"><formula1>Lists!$D$2:$D$${moduleNames.length + 1}</formula1></dataValidation>`);
  const dvXml = `<dataValidations count="${dvItems.length}">${dvItems.join("")}</dataValidations>`;

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${colsXml}</cols><sheetData>${issueRows.join("")}</sheetData>${dvXml}</worksheet>`;

  // ── Lists sheet (hidden) ──────────────────────────────────────────────────
  const maxR = Math.max(stateNames.length, priorityValues.length, memberNames.length, moduleNames.length, 1);
  const listRows: string[] = [];
  listRows.push(
    `<row r="1"><c r="A1" t="s"><v>${si("狀態")}</v></c><c r="B1" t="s"><v>${si("優先級")}</v></c><c r="C1" t="s"><v>${si("指派成員")}</v></c><c r="D1" t="s"><v>${si("模組")}</v></c></row>`
  );
  for (let i = 0; i < maxR; i++) {
    const r = i + 2;
    const cells = [
      stateNames[i] ? `<c r="A${r}" t="s"><v>${si(stateNames[i])}</v></c>` : "",
      priorityValues[i] ? `<c r="B${r}" t="s"><v>${si(priorityValues[i])}</v></c>` : "",
      memberNames[i] ? `<c r="C${r}" t="s"><v>${si(memberNames[i])}</v></c>` : "",
      moduleNames[i] ? `<c r="D${r}" t="s"><v>${si(moduleNames[i])}</v></c>` : "",
    ].join("");
    if (cells) listRows.push(`<row r="${r}">${cells}</row>`);
  }
  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${listRows.join("")}</sheetData></worksheet>`;

  // ── Shared strings XML ────────────────────────────────────────────────────
  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join("")}</sst>`;

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Issues" sheetId="1" r:id="rId1"/><sheet name="Lists" sheetId="2" r:id="rId2" state="hidden"/></sheets></workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts><font><sz val="11"/><name val="Calibri"/></font></fonts><fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(wbXml) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet1Xml) },
    { name: "xl/worksheets/sheet2.xml", data: enc.encode(sheet2Xml) },
    { name: "xl/sharedStrings.xml", data: enc.encode(ssXml) },
    { name: "xl/styles.xml", data: enc.encode(stylesXml) },
  ];

  return buildZip(files);
}
