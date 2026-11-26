/* parsers/xlsx.js — อ่าน/เขียนไฟล์ Excel (.xlsx) โดยไม่ต้องพึ่งไลบรารีภายนอก
   - อ่าน: แตกไฟล์ ZIP ด้วย DecompressionStream('deflate-raw') ของเบราว์เซอร์ แล้วอ่าน XML ของแต่ละแผ่นงาน
   - เขียน: สร้าง ZIP แบบไม่บีบอัด (stored) พร้อม CRC32
   - .xls / .ods (รูปแบบเก่า) จะโหลด SheetJS จาก CDN เมื่อจำเป็นเท่านั้น */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  TT.parsers = TT.parsers || {};

  /* ---------- ZIP ---------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับการแตกไฟล์ .xlsx กรุณาใช้ Chrome, Edge, Firefox หรือ Safari รุ่นใหม่ หรือบันทึกเป็น .csv');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function unzip(buffer) {
    const b = new Uint8Array(buffer);
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    // หา End of Central Directory
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ไฟล์ไม่ใช่ .xlsx ที่ถูกต้อง (ไม่พบโครงสร้าง ZIP) อาจเป็นไฟล์เสียหรือเปลี่ยนนามสกุลมา');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder('utf-8');
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('โครงสร้าง ZIP ในไฟล์ .xlsx เสียหาย');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      const lnameLen = dv.getUint16(localOff + 26, true);
      const lextraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lnameLen + lextraLen;
      files[name] = { method: method, data: b.subarray(start, start + csize) };
    }
    return {
      names: Object.keys(files),
      read: async function (name) {
        const f = files[name];
        if (!f) return null;
        const raw = f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : null;
        if (!raw) throw new Error('ไฟล์ .xlsx ใช้วิธีบีบอัดที่ไม่รองรับ');
        return dec.decode(raw);
      }
    };
  }

  function zip(entries) {
    // entries: [{name, data: Uint8Array|string}]
    const enc = new TextEncoder();
    const chunks = []; const central = []; let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const e of entries) {
      const nameB = enc.encode(e.name);
      const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
      const crc = crc32(data);
      const lh = new Uint8Array(30 + nameB.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameB.length, true); dv.setUint16(28, 0, true);
      lh.set(nameB, 30);
      chunks.push(lh, data);
      const ch = new Uint8Array(46 + nameB.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true); cv.setUint16(28, nameB.length, true);
      cv.setUint32(42, offset, true);
      ch.set(nameB, 46);
      central.push(ch);
      offset += lh.length + data.length;
    }
    let csize = 0; for (const c of central) csize += c.length;
    const end = new Uint8Array(22); const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, csize, true); ev.setUint32(16, offset, true);
    const parts = chunks.concat(central, [end]);
    let total = 0; for (const c of parts) total += c.length;
    const out = new Uint8Array(total); let o = 0;
    for (const c of parts) { out.set(c, o); o += c.length; }
    return out;
  }

  /* ---------- XML helpers ---------- */
  function unescapeXml(s) {
    return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, function (m, e) {
      if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&';
      if (e === 'quot') return '"'; if (e === 'apos') return "'";
      if (e[1] === 'x' || e[1] === 'X') return String.fromCodePoint(parseInt(e.slice(2), 16));
      return String.fromCodePoint(parseInt(e.slice(1), 10));
    });
  }
  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      // ตัดอักขระควบคุมที่ XML ไม่อนุญาต
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  }
  function attr(tag, name) {
    const m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
    return m ? unescapeXml(m[1]) : null;
  }
  function textOf(xml) {
    // รวมข้อความใน <t> ทั้งหมด (รองรับ rich text) และไม่สนใจ <rPh> (คำอ่าน)
    const clean = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
    let out = '';
    const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
    let m;
    while ((m = re.exec(clean))) out += m[1] ? unescapeXml(m[1]) : '';
    return out;
  }
  function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(ref);
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function colName(i) {
    let s = ''; i++;
    while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }

  async function readXlsx(buffer) {
    const z = await unzip(buffer);
    const wb = await z.read('xl/workbook.xml');
    if (!wb) throw new Error('ไม่พบ xl/workbook.xml — ไฟล์นี้ไม่ใช่ Excel (.xlsx) ที่ถูกต้อง');
    const relsXml = (await z.read('xl/_rels/workbook.xml.rels')) || '';
    const rels = {};
    (relsXml.match(/<Relationship\b[^>]*>/g) || []).forEach(function (r) {
      rels[attr(r, 'Id')] = attr(r, 'Target');
    });
    const ssXml = await z.read('xl/sharedStrings.xml');
    const shared = [];
    if (ssXml) {
      const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g; let m;
      while ((m = re.exec(ssXml))) shared.push(m[1] ? textOf(m[1]) : '');
    }
    const sheets = [];
    const sheetTags = wb.match(/<sheet\b[^>]*>/g) || [];
    for (const tag of sheetTags) {
      const name = attr(tag, 'name');
      const state = attr(tag, 'state');
      if (state === 'hidden' || state === 'veryHidden') continue;
      const rid = attr(tag, 'r:id') || attr(tag, 'id');
      let target = rels[rid];
      if (!target) continue;
      target = target.replace(/^\//, '');
      const path = target.indexOf('xl/') === 0 ? target : 'xl/' + target;
      const xml = await z.read(path);
      if (!xml) continue;
      sheets.push({ name: name, rows: parseSheet(xml, shared) });
    }
    return sheets;
  }

  function parseSheet(xml, shared) {
    const rows = []; const lines = [];
    const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
    let rm; let autoRow = 0;
    while ((rm = rowRe.exec(xml))) {
      const rattr = rm[1] || rm[3] || '';
      const rNum = +(attr('<x ' + rattr, 'r') || autoRow + 1);
      autoRow = rNum;
      const body = rm[2] || '';
      const cells = [];
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let cm; let autoCol = 0;
      while ((cm = cellRe.exec(body))) {
        const ca = '<c ' + cm[1];
        const ref = attr(ca, 'r');
        const ci = ref ? colIndex(ref) : autoCol;
        autoCol = ci + 1;
        const t = attr(ca, 't');
        const inner = cm[2] || '';
        let v = '';
        const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (t === 's') v = vm ? (shared[+vm[1]] != null ? shared[+vm[1]] : '') : '';
        else if (t === 'inlineStr') v = textOf(inner);
        else if (t === 'b') v = vm ? (vm[1] === '1' ? 'TRUE' : 'FALSE') : '';
        else if (t === 'e') v = vm ? unescapeXml(vm[1]) : '';
        else v = vm ? unescapeXml(vm[1]) : '';
        if (t !== 's' && t !== 'inlineStr' && /^-?\d+\.\d{9,}$/.test(v)) {
          // ปัดเศษทศนิยมจากการคำนวณของ Excel (เช่น 2.0000000001)
          v = String(Math.round(parseFloat(v) * 1e6) / 1e6);
        }
        cells[ci] = v;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
      if (cells.some(function (c) { return String(c).trim() !== ''; })) { rows.push(cells); lines.push(rNum); }
    }
    return { rows: rows, lines: lines };
  }

  /* ---------- SheetJS สำรองสำหรับ .xls / .ods ---------- */
  const SHEETJS_URLS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];
  function loadScript(urls) {
    return new Promise(function (resolve, reject) {
      let i = 0;
      function next() {
        if (i >= urls.length) { reject(new Error('โหลดไลบรารีจากอินเทอร์เน็ตไม่สำเร็จ')); return; }
        const s = document.createElement('script');
        s.src = urls[i++]; s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { s.remove(); next(); };
        document.head.appendChild(s);
      }
      next();
    });
  }
  async function readLegacy(buffer) {
    if (typeof document === 'undefined') throw new Error('อ่าน .xls ได้เฉพาะในเบราว์เซอร์');
    if (!root.XLSX) {
      try { await loadScript(SHEETJS_URLS); }
      catch (e) { throw new Error('ไฟล์ .xls/.ods ต้องใช้ตัวอ่านเพิ่มเติมจากอินเทอร์เน็ตแต่โหลดไม่สำเร็จ — เชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่ หรือเปิดไฟล์ใน Excel แล้วบันทึกเป็น .xlsx หรือ .csv'); }
    }
    const wb = root.XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return wb.SheetNames.map(function (n) {
      const aoa = root.XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
      const rows = []; const lines = [];
      aoa.forEach(function (r, i) {
        if (r.some(function (c) { return String(c).trim() !== ''; })) { rows.push(r.map(String)); lines.push(i + 1); }
      });
      return { name: n, rows: { rows: rows, lines: lines } };
    });
  }

  async function parse(buffer, fileName) {
    const ext = (/\.([a-z0-9]+)$/i.exec(fileName || '') || [])[1];
    const isZip = new Uint8Array(buffer.slice ? buffer.slice(0, 2) : buffer)[0] === 0x50;
    let sheets;
    if ((ext && ext.toLowerCase() === 'xlsx') || (isZip && ext !== 'ods')) sheets = await readXlsx(buffer);
    else sheets = await readLegacy(buffer);
    return {
      tables: sheets.filter(function (s) { return s.rows.rows.length; }).map(function (s) {
        return { name: s.name, rows: s.rows.rows, lines: s.rows.lines, sheet: s.name };
      })
    };
  }

  /* ---------- เขียน .xlsx ----------
     sheets: [{name, rows:[[value,...]], widths:[n], merges:['A1:C1'], headerRows:1, styles:{'r,c':styleId}}]
     styleId: 0 ปกติ, 1 หัวตาราง, 2 หัวเรื่องใหญ่, 3 เซลล์คาบเรียน (ตัดบรรทัด), 4 ช่องพัก/กิจกรรม */
  function sheetName(n, used) {
    let s = String(n).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31).trim() || 'Sheet';
    let base = s, k = 2;
    while (used[s.toLowerCase()]) { s = base.slice(0, 28) + ' ' + k++; }
    used[s.toLowerCase()] = true;
    return s;
  }
  function writeXlsx(sheets) {
    const used = {};
    const names = sheets.map(function (s) { return sheetName(s.name, used); });
    const files = [];
    files.push({ name: '[Content_Types].xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>' });
    files.push({ name: '_rels/.rels', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>' });
    files.push({ name: 'docProps/core.xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>ตารางสอน</dc:title><dc:creator>ระบบจัดตารางสอนอัตโนมัติ</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created>' +
      '</cp:coreProperties>' });
    files.push({ name: 'xl/workbook.xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + escapeXml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' });
    files.push({ name: 'xl/styles.xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3"><font><sz val="12"/><name val="Tahoma"/></font><font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="14"/><name val="Tahoma"/></font></fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF1F5B4B"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEFEA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left style="thin"><color rgb="FFB9C6BF"/></left><right style="thin"><color rgb="FFB9C6BF"/></right><top style="thin"><color rgb="FFB9C6BF"/></top><bottom style="thin"><color rgb="FFB9C6BF"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });

    sheets.forEach(function (s, i) {
      const headerRows = s.headerRows == null ? 1 : s.headerRows;
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
      if (headerRows > 0 && !s.noFreeze) xml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + headerRows + '" topLeftCell="A' + (headerRows + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
      if (s.widths && s.widths.length) {
        xml += '<cols>' + s.widths.map(function (w, c) { return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
      }
      xml += '<sheetData>';
      s.rows.forEach(function (row, r) {
        const ht = s.rowHeights && s.rowHeights[r] ? ' ht="' + s.rowHeights[r] + '" customHeight="1"' : '';
        xml += '<row r="' + (r + 1) + '"' + ht + '>';
        row.forEach(function (v, c) {
          if (v == null || v === '') {
            const st0 = s.styles && s.styles[r + ',' + c];
            if (st0 != null) xml += '<c r="' + colName(c) + (r + 1) + '" s="' + st0 + '"/>';
            return;
          }
          let st = s.styles && s.styles[r + ',' + c];
          if (st == null) st = r < headerRows ? 1 : 0;
          const ref = colName(c) + (r + 1);
          if (typeof v === 'number' && isFinite(v)) xml += '<c r="' + ref + '" s="' + st + '"><v>' + v + '</v></c>';
          else xml += '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + escapeXml(v) + '</t></is></c>';
        });
        xml += '</row>';
      });
      xml += '</sheetData>';
      if (s.merges && s.merges.length) xml += '<mergeCells count="' + s.merges.length + '">' + s.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>';
      xml += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>';
      if (s.landscape) xml += '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
      xml += '</worksheet>';
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: xml });
    });
    return zip(files);
  }

  TT.parsers.xlsx = { parse: parse, readXlsx: readXlsx, writeXlsx: writeXlsx, unzip: unzip, zip: zip, crc32: crc32, colName: colName, loadScript: loadScript };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
