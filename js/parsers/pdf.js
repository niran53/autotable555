/* parsers/pdf.js — อ่านตารางจาก PDF ที่มีข้อความ (ไม่ใช่ภาพสแกน)
   ใช้ pdf.js (โหลดจาก CDN เมื่อจำเป็น) ดึงข้อความพร้อมพิกัด แล้วประกอบกลับเป็นแถว/คอลัมน์ตามตำแหน่งหัวตาราง
   รองรับหลายตารางในไฟล์เดียว โดยมีบรรทัดหัวข้อชื่อตาราง เช่น "ครู", "ห้องเรียน", "รายวิชา", "กลุ่มเรียน", "การมอบหมายสอน" */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  TT.parsers = TT.parsers || {};

  const PDFJS = [
    { lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' },
    { lib: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js', worker: 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
  ];

  async function ensurePdfJs() {
    if (root.pdfjsLib) return root.pdfjsLib;
    for (const src of PDFJS) {
      try {
        await TT.parsers.xlsx.loadScript([src.lib]);
        if (root.pdfjsLib) {
          root.pdfjsLib.GlobalWorkerOptions.workerSrc = src.worker;
          return root.pdfjsLib;
        }
      } catch (e) { /* ลองแหล่งถัดไป */ }
    }
    throw new Error('การอ่าน PDF ต้องโหลดตัวอ่าน (pdf.js) จากอินเทอร์เน็ตแต่โหลดไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วกด "ลองใหม่" หรือใช้ไฟล์ .csv / .xlsx แทน');
  }

  /* ฟอนต์ไทยบางตัวเก็บวรรณยุกต์/สระเป็นอักขระ Private Use (U+F700–F71A) เมื่อดึงข้อความออกจาก PDF
     แปลงกลับเป็นยูนิโค้ดมาตรฐาน และเรียงสระ-วรรณยุกต์ให้ถูกลำดับ */
  const PUA = { 0xf700: 0x0e10, 0xf701: 0x0e34, 0xf702: 0x0e35, 0xf703: 0x0e36, 0xf704: 0x0e37, 0xf705: 0x0e48, 0xf706: 0x0e49, 0xf707: 0x0e4a, 0xf708: 0x0e4b, 0xf709: 0x0e4c,
    0xf70a: 0x0e48, 0xf70b: 0x0e49, 0xf70c: 0x0e4a, 0xf70d: 0x0e4b, 0xf70e: 0x0e4c, 0xf70f: 0x0e0d, 0xf710: 0x0e31, 0xf711: 0x0e4d, 0xf712: 0x0e47, 0xf713: 0x0e48,
    0xf714: 0x0e49, 0xf715: 0x0e4a, 0xf716: 0x0e4b, 0xf717: 0x0e4c, 0xf718: 0x0e38, 0xf719: 0x0e39, 0xf71a: 0x0e3a };
  function normalizeThai(str) {
    let s = str.replace(/[\uf700-\uf71a]/g, function (c) { return String.fromCharCode(PUA[c.charCodeAt(0)] || c.charCodeAt(0)); });
    // วรรณยุกต์ (่ ้ ๊ ๋ ์) ต้องอยู่หลังสระบน/ล่าง (ั ิ ี ึ ื ุ ู ฺ ็ ํ)
    s = s.replace(/([\u0e48-\u0e4c])([\u0e31\u0e34-\u0e3a\u0e47\u0e4d])/g, '$2$1');
    // สระอำที่ถูกแยกเป็น ํ + า
    s = s.replace(/\u0e4d\u0e32/g, '\u0e33').replace(/([\u0e48-\u0e4b])\u0e4d\u0e32/g, '\u0e33$1');
    return s.normalize('NFC');
  }

  function cleanTitle(s) {
    return String(s).replace(/^(ตาราง|ข้อมูล|table|sheet)\s*[:：\-]?\s*/i, '').replace(/[:：]\s*$/, '').replace(/\(\s*\d+\s*(รายการ|แถว)?\s*\)\s*$/, '').trim();
  }

  function isNoise(text) {
    const t = text.trim();
    return /^\d{1,4}$/.test(t) || /^หน้า\s*\d+(\s*\/\s*\d+)?$/.test(t) || /^page\s*\d+/i.test(t) || /^\d+\s*\/\s*\d+$/.test(t);
  }

  /* pages: [[{str, x, y, w, h}]] — y นับจากบนลงล่าง */
  function itemsToTables(pages, fileName) {
    const tables = [];
    let cur = null;
    let lineCounter = 0;
    function startTable(name) {
      if (cur && cur.rows.length) tables.push(cur);
      cur = { name: name, rows: [], lines: [], cols: null, headerText: null };
    }
    pages.forEach(function (items, pi) {
      const its = items.filter(function (it) { return it.str && it.str.trim() !== ''; })
        .sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      // รวมเป็นบรรทัดตามแกน y
      const lines = [];
      for (const it of its) {
        const h = it.h || 10;
        let L = null;
        for (let k = lines.length - 1; k >= 0 && k >= lines.length - 3; k--) {
          if (Math.abs(lines[k].y - it.y) <= Math.max(2, h * 0.45)) { L = lines[k]; break; }
        }
        if (!L) { L = { y: it.y, h: h, items: [] }; lines.push(L); }
        L.items.push(it);
      }
      for (const L of lines) {
        L.items.sort(function (a, b) { return a.x - b.x; });
        // รวมเป็นกลุ่มข้อความ (segment) ตามระยะห่าง
        const segs = [];
        for (const it of L.items) {
          const last = segs[segs.length - 1];
          const h = it.h || L.h || 10;
          const gap = last ? it.x - last.x1 : Infinity;
          if (last && gap < h * 0.9) {
            last.text += (gap > h * 0.18 ? ' ' : '') + it.str;
            last.x1 = Math.max(last.x1, it.x + (it.w || 0));
          } else {
            segs.push({ x0: it.x, x1: it.x + (it.w || it.str.length * h * 0.5), text: it.str });
          }
        }
        segs.forEach(function (s) { s.text = normalizeThai(s.text).replace(/\s+/g, ' ').trim(); });
        const texts = segs.map(function (s) { return s.text; }).filter(Boolean);
        if (!texts.length) continue;
        lineCounter++;
        if (texts.length === 1) {
          if (isNoise(texts[0])) continue;
          const ent = TT.schema.entityFromName(cleanTitle(texts[0]));
          if (ent) { startTable(cleanTitle(texts[0])); continue; }
          if (!cur || !cur.cols) continue; // ข้อความชื่อเอกสาร/คำอธิบายก่อนตาราง
        }
        if (!cur) startTable(fileName);
        if (!cur.cols) {
          if (segs.length < 2) continue;
          cur.cols = segs.map(function (s) { return { x0: s.x0, x1: s.x1 }; });
          cur.headerText = texts.join('\u0001');
          cur.rows.push(texts);
          cur.lines.push(0);
          continue;
        }
        if (texts.join('\u0001') === cur.headerText) continue; // หัวตารางซ้ำเมื่อขึ้นหน้าใหม่
        // บรรทัดที่ทุกช่องเป็นชื่อหัวคอลัมน์ = เริ่มตารางใหม่ (เช่น PDF จาก Excel ที่ไม่มีชื่อแผ่นงาน)
        if (texts.length >= 2) {
          const dn = TT.schema.detectEntity(texts, null);
          if (dn) {
            const hm = TT.schema.mapHeaders(dn.entity, texts);
            if (hm.matched === texts.length && hm.matched >= 2) {
              startTable(fileName + ' (ตารางที่ ' + (tables.length + 1) + ')');
              cur.cols = segs.map(function (s) { return { x0: s.x0, x1: s.x1 }; });
              cur.headerText = texts.join('\u0001');
              cur.rows.push(texts); cur.lines.push(0);
              continue;
            }
          }
        }
        const cols = cur.cols;
        const row = cols.map(function () { return ''; });
        for (const s of segs) {
          let best = -1, bestOv = 0;
          for (let c = 0; c < cols.length; c++) {
            const left = cols[c].x0 - 4;
            const right = c + 1 < cols.length ? cols[c + 1].x0 - 4 : Infinity;
            const ov = Math.min(s.x1, right) - Math.max(s.x0, left);
            if (ov > bestOv) { bestOv = ov; best = c; }
          }
          if (best < 0) {
            const cx = (s.x0 + s.x1) / 2; let bd = Infinity;
            for (let c = 0; c < cols.length; c++) {
              const d = Math.abs(cx - (cols[c].x0 + cols[c].x1) / 2);
              if (d < bd) { bd = d; best = c; }
            }
          }
          row[best] = row[best] ? row[best] + ' ' + s.text : s.text;
        }
        cur.rows.push(row);
        cur.lines.push(cur.rows.length - 1);
        cur.page = pi + 1;
      }
    });
    if (cur && cur.rows.length) tables.push(cur);
    return tables.map(function (t) { return { name: t.name, rows: t.rows, lines: t.lines, recordBased: true }; });
  }

  async function parse(buffer, fileName, onProgress, signal) {
    const lib = await ensurePdfJs();
    const task = lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false });
    const doc = await task.promise;
    const pages = [];
    let hasText = false;
    for (let p = 1; p <= doc.numPages; p++) {
      if (signal && signal.aborted) { doc.destroy(); throw new DOMException('ยกเลิก', 'AbortError'); }
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = tc.items.map(function (it) {
        const tr = it.transform;
        const h = Math.abs(tr[3]) || it.height || 10;
        if (it.str && it.str.trim()) hasText = true;
        return { str: it.str, x: tr[4], y: vp.height - tr[5], w: it.width, h: h };
      });
      pages.push(items);
      if (onProgress) onProgress(p / doc.numPages);
    }
    const numPages = doc.numPages;
    doc.destroy();
    if (!hasText) throw new Error('PDF นี้ไม่มีข้อความให้อ่าน (น่าจะเป็นภาพสแกน) — ใช้ไฟล์ PDF ที่ส่งออกจาก Word/Excel/เว็บ หรือใช้ .csv / .xlsx แทน');
    return { tables: itemsToTables(pages, fileName), pages: numPages };
  }

  TT.parsers.pdf = { parse: parse, itemsToTables: itemsToTables, normalizeThai: normalizeThai };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
