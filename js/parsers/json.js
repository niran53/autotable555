/* parsers/json.js — อ่าน JSON ได้ทั้งแบบรวม {teachers:[], rooms:[], ...} แบบอาร์เรย์เดี่ยว
   และไฟล์ที่ส่งออกจากระบบนี้ ({dataset:{...}}) — แปลงเป็นรูปแบบตารางเดียวกับ CSV */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  TT.parsers = TT.parsers || {};

  function lineOfError(text, msg) {
    const m = /position (\d+)/i.exec(msg);
    if (!m) { const m2 = /line (\d+)/i.exec(msg); return m2 ? +m2[1] : null; }
    const pos = +m[1];
    return text.slice(0, pos).split('\n').length;
  }

  function cellValue(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(cellValue).join('|');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function arrayToTable(name, arr) {
    const headers = [];
    const seen = {};
    arr.forEach(function (o) {
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        Object.keys(o).forEach(function (k) { if (!seen[k]) { seen[k] = true; headers.push(k); } });
      }
    });
    const rows = [headers]; const lines = [0];
    arr.forEach(function (o, i) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) {
        rows.push(headers.map(function () { return ''; }));
      } else {
        rows.push(headers.map(function (h) { return cellValue(o[h]); }));
      }
      lines.push(i + 1);
    });
    return { name: name, rows: rows, lines: lines, recordBased: true, bad: arr.map(function (o, i) { return (!o || typeof o !== 'object' || Array.isArray(o)) ? i + 1 : null; }).filter(Boolean) };
  }

  function parse(buffer, fileName) {
    const dec = TT.parsers.csv.decode(buffer);
    const text = dec.text.replace(/^﻿/, '');
    if (!text.trim()) return { tables: [] };
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) {
      const line = lineOfError(text, e.message);
      const err = new Error('รูปแบบ JSON ไม่ถูกต้อง' + (line ? ' ใกล้บรรทัดที่ ' + line : '') + ' — ตรวจเครื่องหมายจุลภาค (,) วงเล็บ { } [ ] และเครื่องหมายคำพูดให้ครบคู่');
      err.line = line;
      throw err;
    }
    if (obj && obj.dataset && typeof obj.dataset === 'object') obj = obj.dataset;
    if (obj && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) obj = obj.data;
    const tables = [];
    let settings = null;
    if (Array.isArray(obj)) {
      tables.push(arrayToTable(fileName, obj));
    } else if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(function (k) {
        if (Array.isArray(obj[k])) tables.push(arrayToTable(k, obj[k]));
      });
      if (obj.settings && typeof obj.settings === 'object') settings = obj.settings;
    } else {
      throw new Error('ไฟล์ JSON ต้องเป็นอ็อบเจกต์ เช่น {"teachers": [...], "rooms": [...]} หรืออาร์เรย์ของรายการ');
    }
    return { tables: tables.filter(function (t) { return t.rows.length > 1; }), settings: settings };
  }

  TT.parsers.json = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
