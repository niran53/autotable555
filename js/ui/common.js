/* ui/common.js — ตัวช่วยฝั่งหน้าจอ: ไอคอน, แจ้งเตือน, เอฟเฟกต์คลิก, เปลี่ยนหน้า */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  const P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = {
    upload: '<path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    retry: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>',
    play: '<path d="M7 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L8.5 4.64A1 1 0 0 0 7 5.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    download: '<path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5"/><path d="M4 18v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1"/>',
    print: '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.4v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
    okc: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.2 9.6"/>',
    grid: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M9 4.5v15M14.5 4.5v15"/>',
    left: '<path d="m14.5 6-6 6 6 6"/>',
    right: '<path d="m9.5 6 6 6-6 6"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="2.7"/><path d="M5 6v12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6"/><path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    sheet: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9h16M4 14.5h16M10 9v11.5"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" ' + P + ' aria-hidden="true" focusable="false">' + (ICONS[name] || '') + '</svg>';
  }

  function $(sel, rootEl) { return (rootEl || document).querySelector(sel); }
  function $$(sel, rootEl) { return Array.from((rootEl || document).querySelectorAll(sel)); }
  const esc = U.escapeHtml;

  /* แจ้งเตือนชั่วคราว (ประกาศให้โปรแกรมอ่านหน้าจอด้วย) */
  function toast(text, kind, ms) {
    const box = $('#toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast'; el.dataset.kind = kind || 'info';
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = '<span class="ti"></span><div>' + esc(text) + '</div><button type="button" aria-label="ปิดข้อความ">' + '&times;' + '</button>';
    el.querySelector('button').onclick = function () { el.remove(); };
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, ms || (kind === 'error' ? 8000 : 4200));
  }

  /* เอฟเฟกต์วงคลื่นเมื่อคลิกปุ่ม */
  function installRipple() {
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    document.addEventListener('pointerdown', function (e) {
      const btn = e.target.closest('.btn');
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const s = document.createElement('span');
      s.className = 'ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = (e.clientX - r.left - size / 2) + 'px';
      s.style.top = (e.clientY - r.top - size / 2) + 'px';
      btn.appendChild(s);
      setTimeout(function () { s.remove(); }, 600);
    });
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function sevLabel(s) { return s === 'error' ? 'ข้อผิดพลาด' : s === 'warning' ? 'คำเตือน' : 'ข้อสังเกต'; }

  /* ตารางข้อมูลแบบเรียงลำดับได้ + แบ่งหน้า */
  function dataTable(container, opts) {
    // opts: {columns:[{key,label,num,render(row),sort(row)}], rows, pageSize, rowClass(row), empty}
    let sortKey = opts.sortKey || null, sortDir = opts.sortDir || 1, page = 0;
    const pageSize = opts.pageSize || 100;
    function render() {
      let rows = opts.rows.slice();
      if (sortKey) {
        const col = opts.columns.find(function (c) { return c.key === sortKey; });
        const f = col && (col.sort || function (r) { return r[col.key]; });
        rows.sort(function (a, b) {
          const x = f(a), y = f(b);
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
          return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'th') * sortDir;
        });
      }
      const pages = Math.max(1, Math.ceil(rows.length / pageSize));
      if (page >= pages) page = pages - 1;
      const slice = rows.slice(page * pageSize, page * pageSize + pageSize);
      let html = '<div class="table-wrap"' + (opts.maxHeight ? ' style="max-height:' + opts.maxHeight + '"' : '') + '><table class="data"><thead><tr>';
      opts.columns.forEach(function (c) {
        const sorted = sortKey === c.key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none';
        html += '<th scope="col" class="' + (c.num ? 'num ' : '') + (c.nosort ? '' : 'sortable') + '" data-key="' + esc(c.key) + '"' + (c.nosort ? '' : ' aria-sort="' + sorted + '" tabindex="0"') + '>' + esc(c.label) + '</th>';
      });
      html += '</tr></thead><tbody>';
      if (!slice.length) html += '<tr><td colspan="' + opts.columns.length + '" class="muted" style="text-align:center;padding:1.5rem">' + esc(opts.empty || 'ไม่มีข้อมูล') + '</td></tr>';
      slice.forEach(function (r) {
        html += '<tr class="' + (opts.rowClass ? opts.rowClass(r) : '') + '"' + (opts.rowAttr ? ' ' + opts.rowAttr(r) : '') + '>';
        opts.columns.forEach(function (c) {
          const v = c.render ? c.render(r) : esc(r[c.key] == null ? '' : r[c.key]);
          html += '<td class="' + (c.num ? 'num ' : '') + (c.cellClass ? c.cellClass(r) : '') + '">' + v + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      if (pages > 1) {
        html += '<div class="pager"><span>แสดง ' + U.fmtNum(page * pageSize + 1) + '–' + U.fmtNum(Math.min(rows.length, (page + 1) * pageSize)) + ' จาก ' + U.fmtNum(rows.length) + ' รายการ</span>' +
          '<button class="btn btn-sm" data-pg="-1"' + (page === 0 ? ' disabled' : '') + ' aria-label="หน้าก่อนหน้า">' + icon('left') + '</button>' +
          '<span class="num">หน้า ' + (page + 1) + '/' + pages + '</span>' +
          '<button class="btn btn-sm" data-pg="1"' + (page >= pages - 1 ? ' disabled' : '') + ' aria-label="หน้าถัดไป">' + icon('right') + '</button></div>';
      }
      container.innerHTML = html;
      $$('th.sortable', container).forEach(function (th) {
        const go = function () { const k = th.dataset.key; if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; } render(); };
        th.onclick = go;
        th.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
      });
      $$('[data-pg]', container).forEach(function (b) { b.onclick = function () { page += +b.dataset.pg; render(); }; });
      if (opts.afterRender) opts.afterRender(container);
    }
    render();
    return {
      setRows: function (rows) { opts.rows = rows; page = 0; render(); },
      goToRow: function (pred) {
        let rows = opts.rows.slice();
        const i = rows.findIndex(pred);
        if (i < 0) return false;
        sortKey = null; page = Math.floor(i / pageSize); render(); return true;
      },
      render: render
    };
  }

  TT.ui = { icon: icon, $: $, $$: $$, esc: esc, toast: toast, installRipple: installRipple, fmtBytes: fmtBytes, sevLabel: sevLabel, dataTable: dataTable };
})(typeof self !== 'undefined' ? self : globalThis);
