/* utils.js — ฟังก์ชันช่วยที่ใช้ร่วมกันทั้งหน้าเว็บ, Web Worker และสคริปต์ทดสอบ (Node) */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});

  const DAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  const DAY_SHORT = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
  const DAY_ALIASES = [
    // เรียงคำยาวก่อนเพื่อไม่ให้ "พ" จับ "พฤ"
    ['พฤหัสบดี', 3], ['พฤหัส', 3], ['พฤ.', 3], ['พฤ', 3],
    ['อาทิตย์', 6], ['อา.', 6], ['อา', 6],
    ['จันทร์', 0], ['อังคาร', 1], ['พุธ', 2], ['ศุกร์', 4], ['เสาร์', 5],
    ['จ.', 0], ['อ.', 1], ['พ.', 2], ['ศ.', 4], ['ส.', 5],
    ['จ', 0], ['อ', 1], ['พ', 2], ['ศ', 4], ['ส', 5],
    ['monday', 0], ['tuesday', 1], ['wednesday', 2], ['thursday', 3], ['friday', 4], ['saturday', 5], ['sunday', 6],
    ['mon', 0], ['tue', 1], ['wed', 2], ['thu', 3], ['fri', 4], ['sat', 5], ['sun', 6]
  ];

  function escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + r;
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ตัวสุ่มแบบกำหนด seed ได้ เพื่อให้รันซ้ำแล้วได้ผลเดิม */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function str(v) {
    if (v == null) return '';
    return String(v).replace(/ /g, ' ').trim();
  }

  function normKey(v) {
    return str(v).toLowerCase().replace(/[\s_\-.()\[\]/:]+/g, '');
  }

  function normType(v) {
    return str(v).toLowerCase().replace(/\s+/g, ' ');
  }

  function toMinutes(hhmm) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(str(hhmm));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function fmtTime(min) {
    const h = Math.floor(min / 60) % 24, m = min % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /* คำนวณเวลาเริ่ม-จบของแต่ละคาบจากการตั้งค่า */
  function periodTimes(settings) {
    const out = [];
    let t = toMinutes(settings.startTime);
    if (t == null) t = 8 * 60;
    const len = settings.periodMinutes || 60;
    const breaks = settings.breaks || [];
    for (let p = 1; p <= settings.periodsPerDay; p++) {
      out.push({ period: p, start: t, end: t + len, label: fmtTime(t) + '–' + fmtTime(t + len) });
      t += len;
      for (const b of breaks) if (b.after === p) t += b.minutes || 0;
    }
    return out;
  }

  /* แปลงข้อความเวลาเช่น "จ1-2; พ5; ศ" เป็นรายการ {day, from, to}
     คืน {ok, items, bad:[token]} */
  function parseSlotSpec(text, periodsPerDay) {
    const s = str(text);
    const res = { ok: true, items: [], bad: [] };
    if (!s || s === '-') return res;
    const tokens = s.split(/[;|\n]+|,(?=\s*[^\d\s])/).map(function (x) { return x.trim(); }).filter(Boolean);
    for (const tok of tokens) {
      const low = tok.toLowerCase();
      let day = -1, rest = '';
      for (const pair of DAY_ALIASES) {
        if (low.indexOf(pair[0]) === 0) { day = pair[1]; rest = tok.slice(pair[0].length).trim(); break; }
      }
      if (day < 0) { res.bad.push(tok); continue; }
      rest = rest.replace(/^คาบ(ที่)?/, '').replace(/^[:\s]+/, '').trim();
      if (!rest) { res.items.push({ day: day, from: 1, to: periodsPerDay || 99 }); continue; }
      const parts = rest.split(/\s*,\s*/);
      let okTok = true;
      for (const part of parts) {
        const m = /^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/.exec(part);
        if (!m) { okTok = false; break; }
        const a = +m[1], b = m[2] ? +m[2] : a;
        if (a < 1 || b < a || (periodsPerDay && b > periodsPerDay)) { okTok = false; break; }
        res.items.push({ day: day, from: a, to: b });
      }
      if (!okTok) res.bad.push(tok);
    }
    res.ok = res.bad.length === 0;
    return res;
  }

  function levenshtein(a, b) {
    a = String(a); b = String(b);
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  /* หารหัสที่ใกล้เคียง เพื่อแนะนำวิธีแก้ */
  function closest(value, candidates, limit) {
    const v = String(value).toLowerCase();
    return candidates
      .map(function (c) { return { c: c, d: levenshtein(v, String(c).toLowerCase()) }; })
      .sort(function (x, y) { return x.d - y.d; })
      .slice(0, limit || 3)
      .filter(function (x) { return x.d <= Math.max(2, Math.ceil(v.length / 2)); })
      .map(function (x) { return x.c; });
  }

  function popcount(x) {
    x = x - ((x >>> 1) & 0x55555555);
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }

  function fmtNum(n, digits) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString('th-TH', { maximumFractionDigits: digits == null ? 0 : digits, minimumFractionDigits: digits || 0 });
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '-';
    return (n * 100).toLocaleString('th-TH', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%';
  }

  function fmtDuration(ms) {
    if (ms == null) return '-';
    if (ms < 1000) return ms + ' มิลลิวินาที';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + ' วินาที';
    return Math.floor(s / 60) + ' นาที ' + Math.round(s % 60) + ' วินาที';
  }

  function fmtDateTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function fileExt(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  /* สีประจำวิชา: แปลงรหัสวิชาเป็นลำดับสี 0..11 แบบคงที่ */
  function colorIndex(key) {
    let h = 0;
    const s = String(key);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 12;
  }

  TT.util = {
    DAY_NAMES, DAY_SHORT, escapeHtml, uid, uuid, rng, str, normKey, normType,
    toMinutes, fmtTime, periodTimes, parseSlotSpec, levenshtein, closest, popcount,
    fmtNum, fmtPct, fmtDuration, fmtDateTime, fileExt, deepClone, colorIndex
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
