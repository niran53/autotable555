/* ui/history-view.js — หน้า "ประวัติรอบรัน": รายการรอบที่ผ่านมาจาก Supabase/ในเครื่อง เปิดผลเดิมหรือพิมพ์ได้ */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui;
  TT.views = TT.views || {};

  const STATUS = {
    completed: ['เสร็จสมบูรณ์', 'badge-ok'], cancelled: ['ยกเลิก', ''], failed: ['ผิดพลาด', 'badge-error'], running: ['กำลังคำนวณ / ค้าง', 'badge-info']
  };

  async function load() {
    const body = ui.$('#historyBody');
    body.innerHTML = '<p class="muted">กำลังโหลด…</p>';
    const res = await TT.store.listRuns();
    ui.$('#historyLine').textContent = (res.where === 'remote' ? 'ข้อมูลจาก Supabase' : 'ข้อมูลในเบราว์เซอร์นี้') + ' ' + res.runs.length + ' รอบ' + (res.error ? ' (เชื่อมต่อ Supabase ไม่ได้: ' + res.error + ')' : '');
    if (!res.runs.length) {
      body.innerHTML = '<div class="empty-state">' + ui.icon('clock') + '<h3>ยังไม่มีรอบรัน</h3><p style="margin:0 auto">ยืนยันข้อมูลนำเข้าแล้วกด "จัดตาราง" ประวัติจะแสดงที่นี่</p><p style="margin:1rem auto 0"><a class="btn btn-primary" href="#import">ไปนำเข้าข้อมูล</a></p></div>';
      return;
    }
    const current = TT.app.state.run && TT.app.state.run.id;
    ui.dataTable(body, {
      rows: res.runs, pageSize: 50, maxHeight: '680px',
      columns: [
        { key: 'started_at', label: 'เริ่มเมื่อ', render: function (r) { return '<span class="nowrap">' + U.fmtDateTime(r.started_at) + '</span><br><span class="small muted">รอบ ' + ui.esc(String(r.id).slice(0, 8)) + (r.id === current ? ' (เปิดอยู่)' : '') + '</span>'; } },
        { key: 'status', label: 'สถานะ', render: function (r) { const s = STATUS[r.status] || [r.status, '']; return '<span class="badge ' + s[1] + '">' + s[0] + '</span>' + (r.confirmed ? '<br><span class="badge badge-board" style="margin-top:4px">ยืนยันผลแล้ว</span>' : ''); } },
        { key: 'counts', label: 'ข้อมูล', nosort: true, render: function (r) { const c = r.counts || {}; return '<span class="small">ครู ' + (c.teachers || 0) + ', ห้อง ' + (c.rooms || 0) + ', กลุ่ม ' + (c.groups || 0) + ', รายการสอน ' + (c.assignments || 0) + '</span><br><span class="small muted">' + ui.esc((r.sources || []).join(', ')) + '</span>'; } },
        { key: 'sched', label: 'คาบที่จัดได้', num: true, sort: function (r) { return r.stats ? r.stats.scheduled : -1; }, render: function (r) { return r.stats ? r.stats.scheduled + '/' + r.stats.required : '-'; } },
        { key: 'clash', label: 'คาบชน', num: true, sort: function (r) { return r.stats ? r.stats.clashTeacher + r.stats.clashRoom + r.stats.clashGroup : -1; }, render: function (r) { if (!r.stats) return '-'; const n = r.stats.clashTeacher + r.stats.clashRoom + r.stats.clashGroup; return n ? '<b style="color:var(--danger)">' + n + '</b>' : '0'; } },
        { key: 'roomRate', label: 'ใช้ห้อง', num: true, sort: function (r) { return r.stats ? r.stats.roomRate : -1; }, render: function (r) { return r.stats ? U.fmtPct(r.stats.roomRate) : '-'; } },
        { key: 'duration_ms', label: 'ใช้เวลา', num: true, render: function (r) { return r.duration_ms != null ? U.fmtDuration(r.duration_ms) : '-'; } },
        { key: 'where', label: 'ที่เก็บ', nosort: true, render: function (r) { return r.localOnly || res.where === 'local' ? '<span class="badge">ในเครื่อง</span>' : '<span class="badge badge-ok">Supabase</span>'; } },
        { key: 'act', label: '', nosort: true, render: function (r) {
          if (r.status !== 'completed') return r.error ? '<span class="small muted">' + ui.esc(r.error) + '</span>' : '';
          return '<div class="row" style="gap:0.35rem;flex-wrap:nowrap"><button type="button" class="btn btn-sm btn-primary" data-open="' + ui.esc(r.id) + '">เปิดผล</button>' +
            (r.confirmed ? '<a class="btn btn-sm" href="print.html?run=' + encodeURIComponent(r.id) + '" target="_blank" rel="noopener">' + ui.icon('print') + 'พิมพ์</a>' : '') + '</div>';
        } }
      ]
    });
    body.onclick = async function (e) {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      b.disabled = true;
      try {
        const r = await TT.store.getRun(b.dataset.open);
        if (!r || !r.result) throw new Error('ไม่พบผลของรอบนี้');
        const ds = await TT.store.getDataset(r.dataset_id);
        if (!ds || !ds.payload) throw new Error('ไม่พบชุดข้อมูลของรอบนี้');
        r.dataset = ds.payload;
        r.metrics = null;
        TT.app.state.dataset = ds;
        TT.views.results.openRun(r);
      } catch (err) {
        ui.toast('เปิดรอบนี้ไม่ได้: ' + err.message, 'error');
        b.disabled = false;
      }
    };
  }

  TT.views.history = {
    init: function () { ui.$('#reloadHistory').addEventListener('click', load); },
    show: load
  };
})(typeof self !== 'undefined' ? self : globalThis);
