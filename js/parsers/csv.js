/* parsers/csv.js — อ่าน CSV/TSV (รองรับเครื่องหมายคำพูด, ตรวจตัวคั่นอัตโนมัติ, UTF-8 และ TIS-620/Windows-874)
   คืนค่า: [{name, rows:[[cell,...], ...]}] — หนึ่งไฟล์อาจมีหลายตาราง ถ้าใช้บรรทัดหัวข้อ #ครู หรือ [teachers] */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  TT.parsers = TT.parsers || {};

  function decode(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let start = 0;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
    // UTF-16 LE BOM (Excel "Unicode text")
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' };
    const body = bytes.subarray(start);
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
      return { text: text, encoding: 'UTF-8' };
    } catch (e) {
      try {
        return { text: new TextDecoder('windows-874').decode(body), encoding: 'TIS-620 (Windows-874)' };
      } catch (e2) {
        return { text: new TextDecoder('utf-8').decode(body), encoding: 'UTF-8 (มีอักขระเสีย)' };
      }
    }
  }

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).filter(function (l) { return l.trim() && !/^\s*(#|\[)/.test(l); }).slice(0, 10);
    const cands = [',', '\t', ';', '|'];
    let best = ',', bestScore = -1;
    for (const d of cands) {
      const counts = sample.map(function (l) { return splitLine(l, d).length; });
      if (!counts.length) continue;
      const min = Math.min.apply(null, counts);
      const same = counts.filter(function (c) { return c === counts[0]; }).length;
      const score = min > 1 ? same * 10 + min : 0;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function splitLine(line, d) {
    // ใช้นับคอลัมน์คร่าว ๆ เท่านั้น
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === d) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /* RFC 4180: รองรับขึ้นบรรทัดใหม่ภายในเครื่องหมายคำพูด */
  function parseRows(text, d) {
    const rows = []; let row = []; let cur = ''; let q = false; let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cur += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        cur += c; i++; continue;
      }
      if (c === '"' && cur.trim() === '') { q = true; cur = ''; i++; continue; }
      if (c === d) { row.push(cur); cur = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (q) throw new Error('เครื่องหมายคำพูด (") ไม่ครบคู่ ตรวจสอบเซลล์ที่มีเครื่องหมาย " ในไฟล์');
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function isSectionLine(cells) {
    const nonEmpty = cells.filter(function (c) { return String(c).trim() !== ''; });
    if (nonEmpty.length !== 1) return null;
    const m = /^\s*(?:#+\s*|\[\s*)([^\]]+?)\s*\]?\s*$/.exec(nonEmpty[0]);
    if (!m) return null;
    if (!/^\s*(#|\[)/.test(nonEmpty[0])) return null;
    return m[1];
  }

  function parse(buffer, fileName) {
    const dec = decode(buffer);
    const text = dec.text;
    if (!text.trim()) return { tables: [], encoding: dec.encoding };
    const d = detectDelimiter(text);
    const all = parseRows(text, d);
    const tables = [];
    let cur = { name: fileName, rows: [], lineOffset: 0 };
    let lineNo = 0;
    for (const cells of all) {
      lineNo++;
      const sec = isSectionLine(cells);
      if (sec) {
        if (cur.rows.length) tables.push(cur);
        cur = { name: sec, rows: [], lineOffset: lineNo, section: true };
        continue;
      }
      if (cells.every(function (c) { return String(c).trim() === ''; })) {
        cur.rows.push(null); // เก็บตำแหน่งบรรทัดว่างไว้เพื่อให้เลขบรรทัดตรงกับไฟล์จริง
        continue;
      }
      cur.rows.push(cells);
    }
    if (cur.rows.length) tables.push(cur);
    return {
      tables: tables.map(function (t) { return normalizeTable(t); }).filter(function (t) { return t.rows.length; }),
      encoding: dec.encoding,
      delimiter: d === '\t' ? 'แท็บ' : d
    };
  }

  /* ตัดบรรทัดว่างหน้า-หลัง และคำนวณเลขบรรทัดในไฟล์ของแต่ละแถว */
  function normalizeTable(t) {
    const rows = []; const lines = [];
    for (let i = 0; i < t.rows.length; i++) {
      if (t.rows[i] == null) continue;
      rows.push(t.rows[i]);
      lines.push(t.lineOffset + i + 1);
    }
    return { name: t.name, rows: rows, lines: lines, section: !!t.section };
  }

  TT.parsers.csv = { parse: parse, decode: decode, parseRows: parseRows, detectDelimiter: detectDelimiter };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
