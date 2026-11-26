/* ui/results-view.js — หน้า "ตารางผลลัพธ์": ตัวชี้วัด, ตารางรายกลุ่ม/ครู/ห้อง, ค้นหาวิชา, รายการคาบ,
   ภาระสอนรายครู, การใช้ห้อง, เวลาว่างคั่น, ข้อขัดแย้ง และการยืนยันผล/ส่งออก */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui, M = TT.model;
  TT.views = TT.views || {};

  const st = { tab: 'grid', view: 'group', id: null, q: '', compact: false, listQ: '', listDay: 'all', checkedAt: null };
  let idx = null, runRef = null;

  function run() { return TT.app.state.run; }

  /* ---------- ส่วนหัว: ยืนยันผล + ส่งออก ---------- */
  function renderActions() {
    const r = run();
    const m = r.metrics;
    const confirmed = !!r.confirmed;
    const lock = confirmed ? '' : ' disabled aria-describedby="exportHint"';
    let html = confirmed
      ? '<span class="badge badge-ok">' + ui.icon('check') + 'ยืนยันผลแล้ว ' + U.fmtDateTime(r.confirmed_at) + '</span>'
      : '<span class="badge badge-chalk">ร่าง ยังไม่ยืนยัน</span>' +
        '<button type="button" class="btn btn-primary" id="btnConfirmRun"' + (m.conflictTotal ? ' disabled' : '') + '>' + ui.icon('lock') + (m.unscheduledPeriods ? 'ยืนยันผล (ยังจัดไม่ได้ ' + m.unscheduledPeriods + ' คาบ)' : 'ยืนยันผลตาราง') + '</button>';
    html += '<button type="button" class="btn" data-export="csv"' + lock + '>' + ui.icon('download') + 'CSV</button>' +
      '<button type="button" class="btn" data-export="xlsx"' + lock + '>' + ui.icon('sheet') + 'Excel</button>' +
      '<button type="button" class="btn" data-export="json"' + lock + '>' + ui.icon('download') + 'JSON</button>' +
      '<button type="button" class="btn btn-accent" data-export="pdf"' + lock + '>' + ui.icon('print') + 'หน้าพิมพ์ PDF</button>';
    if (!confirmed) html += '<span class="small muted" id="exportHint" style="flex-basis:100%;text-align:right">ส่งออกและพิมพ์ได้หลังกด "ยืนยันผลตาราง"' + (m.conflictTotal ? ' (ยืนยันไม่ได้เพราะมีข้อขัดแย้ง ' + m.conflictTotal + ' รายการ)' : '') + '</span>';
    ui.$('#resultActions').innerHTML = html;
    const c = ui.$('#btnConfirmRun');
    if (c) c.onclick = confirmRun;
    ui.$$('[data-export]').forEach(function (b) { b.onclick = function () { doExport(b.dataset.export); }; });
  }

  async function confirmRun() {
    const r = run();
    if (r.metrics.conflictTotal) { ui.toast('ยังมีข้อขัดแย้ง ยืนยันไม่ได้', 'error'); return; }
    r.confirmed = true;
    r.confirmed_at = new Date().toISOString();
    const res = await TT.store.saveRun(Object.assign({}, r, { dataset: undefined, metrics: undefined }));
    TT.app.setRun(r);
    renderActions();
    ui.$('#resultsLine').innerHTML = headLine();
    ui.toast('ยืนยันผลตารางแล้ว' + (res.where === 'remote' ? ' บันทึกใน Supabase' : res.error ? ' (บันทึกในเครื่อง: ' + res.error + ')' : '') + ' ส่งออกหรือพิมพ์ได้แล้ว', res.error ? 'error' : 'ok');
  }

  function doExport(kind) {
    const r = run();
    if (!r.confirmed) { ui.toast('ยืนยันผลตารางก่อนส่งออก', 'error'); return; }
    const base = TT.exporter.fileBase(r);
    try {
      if (kind === 'csv') TT.exporter.download(TT.exporter.toCsv(r), base + '.csv', 'text/csv;charset=utf-8');
      else if (kind === 'json') TT.exporter.download(TT.exporter.toJson(r), base + '.json', 'application/json');
      else if (kind === 'xlsx') TT.exporter.download(TT.exporter.toXlsx(r), base + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else if (kind === 'pdf') {
        const view = st.view, id = st.id;
        const url = 'print.html?run=' + encodeURIComponent(r.id) + '&view=' + view + (id ? '&id=' + encodeURIComponent(id) : '');
        const w = root.open(url, '_blank');
        if (!w) location.href = url;
        return;
      }
      ui.toast('ส่งออกไฟล์ ' + kind.toUpperCase() + ' แล้ว', 'ok');
    } catch (e) {
      ui.toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error');
    }
  }

  function headLine() {
    const r = run();
    const s = r.result.solver || {};
    return 'รอบ ' + ui.esc(r.id.slice(0, 8)) + ' จัดเมื่อ ' + U.fmtDateTime(r.started_at) + ' ใช้เวลา ' + U.fmtDuration(r.duration_ms) +
      (s.attempt ? ' (ผลดีที่สุดจากรอบค้นหาที่ ' + s.attempt + ')' : '') + ' — ' + ui.esc((r.sources || []).join(', '));
  }

  /* ---------- ตัวชี้วัด ---------- */
  function metricsHtml() {
    const m = run().metrics;
    const clashT = m.clashes.teacher.length, clashR = m.clashes.room.length, clashG = m.clashes.group.length;
    const cell = function (label, value, note, cls) { return '<div class="metric ' + (cls || '') + '"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div>' + (note ? '<div class="metric-note">' + note + '</div>' : '') + '</div>'; };
    return '<div class="metrics" id="metricBand">' +
      cell('คาบที่จัดได้', U.fmtNum(m.scheduled) + '<small> / ' + U.fmtNum(m.required) + ' คาบ</small>', m.unscheduledPeriods ? 'ยังจัดไม่ได้ ' + m.unscheduledPeriods + ' คาบ' : 'ครบทุกรายการสอน (' + U.fmtNum(m.sessions) + ' ช่วงสอน)', m.unscheduledPeriods ? 'is-bad' : 'is-ok') +
      cell('ครูซ้อนคาบ', clashT, 'ครู 1 คน 2 ห้องในเวลาเดียวกัน', clashT ? 'is-bad' : 'is-ok') +
      cell('ห้องซ้อนกัน', clashR, 'ห้องเดียวกันมีมากกว่า 1 กลุ่ม', clashR ? 'is-bad' : 'is-ok') +
      cell('กลุ่มเรียนเวลาตรงกัน', clashG, 'กลุ่มเดียวมี 2 วิชาในคาบเดียว', clashG ? 'is-bad' : 'is-ok') +
      cell('อัตราการใช้ห้อง', U.fmtPct(m.roomRateUsed), 'เฉลี่ยห้องที่ใช้ ' + m.roomsUsed + ' ห้อง (ทุกห้อง ' + U.fmtPct(m.roomRate) + ')') +
      cell('เวลาว่างคั่น', m.totalGroupGaps + '<small> คาบ</small>', 'มี ' + m.groupsWithGaps + ' จาก ' + m.groupGaps.length + ' กลุ่มเรียน') +
      cell('ภาระสอนเฉลี่ย', U.fmtNum(m.avgLoad, 1) + '<small> คาบ/สัปดาห์</small>', 'ส่วนเบี่ยงเบน ' + U.fmtNum(m.sdLoad, 1) + ', เกินภาระ ' + m.overloaded + ' คน') +
      '</div>' +
      '<div class="row between small muted" style="margin:0.6rem 0 1.1rem"><span id="checkLine">' + checkLine() + '</span>' +
      '<button type="button" class="btn btn-sm" id="btnRecheck">' + ui.icon('retry') + 'ตรวจซ้ำจากตาราง</button></div>';
  }
  function checkLine() {
    const m = run().metrics;
    return 'ตรวจนับจากรายการคาบในตารางจริง ' + U.fmtNum(m.sessions) + ' ช่วงสอน (' + U.fmtNum(m.scheduled) + ' คาบ) ข้อขัดแย้งรวม ' + m.conflictTotal + ' รายการ' + (st.checkedAt ? ' — ตรวจซ้ำล่าสุด ' + st.checkedAt : '');
  }

  /* ---------- แท็บ ---------- */
  const TABS = [['grid', 'ตารางสอน'], ['list', 'รายการคาบ'], ['load', 'ภาระสอนรายครู'], ['rooms', 'การใช้ห้อง'], ['gaps', 'เวลาว่างคั่น'], ['issues', 'ข้อขัดแย้งและคาบที่จัดไม่ได้']];

  function render() {
    const r = run();
    if (runRef !== r) { runRef = r; idx = M.indexes(r.dataset); st.id = null; st.checkedAt = null; }
    ui.$('#resultsLine').innerHTML = headLine();
    renderActions();
    const m = r.metrics;
    let html = metricsHtml();
    html += '<div class="tabs" role="tablist" id="resTabs">' + TABS.map(function (t) {
      let extra = '';
      if (t[0] === 'issues') extra = ' <span class="badge ' + (m.conflictTotal || m.unscheduledPeriods ? 'badge-error' : 'badge-ok') + '">' + (m.conflictTotal + r.result.unscheduled.length) + '</span>';
      return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (st.tab === t[0]) + '">' + t[1] + extra + '</button>';
    }).join('') + '</div><div id="resTab"></div>';
    ui.$('#resultsBody').innerHTML = html;
    ui.$$('#resTabs button').forEach(function (b) { b.onclick = function () { st.tab = b.dataset.tab; ui.$$('#resTabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); }); renderTab(); }; });
    ui.$('#btnRecheck').onclick = function () {
      r.metrics = TT.metrics.analyze(r.dataset, r.settings, r.result.placements, r.result.unscheduled);
      st.checkedAt = new Date().toLocaleTimeString('th-TH');
      const tab = st.tab; render(); st.tab = tab;
      ui.toast('ตรวจซ้ำแล้ว: ครูซ้อนคาบ ' + r.metrics.clashes.teacher.length + ', ห้องซ้อน ' + r.metrics.clashes.room.length + ', กลุ่มเวลาตรงกัน ' + r.metrics.clashes.group.length, r.metrics.conflictTotal ? 'error' : 'ok');
    };
    renderTab();
  }

  function renderTab() {
    const box = ui.$('#resTab');
    if (st.tab === 'grid') return renderGrid(box);
    if (st.tab === 'list') return renderList(box);
    if (st.tab === 'load') return renderLoad(box);
    if (st.tab === 'rooms') return renderRooms(box);
    if (st.tab === 'gaps') return renderGaps(box);
    return renderIssues(box);
  }

  /* ---------- ตารางสอนแบบกริด ---------- */
  function entities(view) {
    const r = run();
    const V = M.VIEWS[view];
    const used = {};
    r.result.placements.forEach(function (p) {
      if (view === 'group') used[p.group_id] = (used[p.group_id] || 0) + p.len;
      else if (view === 'room') used[p.room_id] = (used[p.room_id] || 0) + p.len;
      else p.teacher_ids.forEach(function (t) { used[t] = (used[t] || 0) + p.len; });
    });
    return r.dataset[V.list].map(function (e) { return { id: e[V.key], e: e, n: used[e[V.key]] || 0 }; });
  }

  function matchQ(p, q) {
    if (!q) return false;
    const s = idx.subject[p.subject_id];
    q = q.toLowerCase();
    return p.subject_id.toLowerCase().indexOf(q) >= 0 || (s && String(s.name).toLowerCase().indexOf(q) >= 0);
  }

  function renderGrid(box) {
    const r = run();
    const list = entities(st.view);
    if (!st.id || !list.some(function (x) { return x.id === st.id; })) st.id = (list.find(function (x) { return x.n > 0; }) || list[0] || {}).id;
    const V = M.VIEWS[st.view];
    let html = '<div class="tt-toolbar">' +
      '<div class="field"><span>มุมมอง</span><div class="segmented" role="group" aria-label="มุมมองตาราง" id="viewPick">' +
      ['group', 'teacher', 'room'].map(function (k) { return '<button type="button" data-view="' + k + '" aria-pressed="' + (st.view === k) + '">' + M.VIEWS[k].label + '</button>'; }).join('') + '</div></div>' +
      '<label class="field grow"><span>เลือก' + V.label + '</span><div class="row" style="gap:0.35rem;flex-wrap:nowrap">' +
      '<button type="button" class="icon-btn" id="entPrev" aria-label="ก่อนหน้า">' + ui.icon('left') + '</button>' +
      '<select class="select" id="entPick">' + list.map(function (x) { return '<option value="' + ui.esc(x.id) + '"' + (x.id === st.id ? ' selected' : '') + '>' + ui.esc(x.id + ' — ' + (x.e.name || x.id)) + ' (' + x.n + ' คาบ)</option>'; }).join('') + '</select>' +
      '<button type="button" class="icon-btn" id="entNext" aria-label="ถัดไป">' + ui.icon('right') + '</button></div></label>' +
      '<label class="field grow"><span>ค้นหาวิชา</span><span class="search">' + ui.icon('search') + '<input class="input" type="search" id="subjQ" placeholder="รหัสหรือชื่อวิชา เช่น 20204 หรือ เว็บไซต์" value="' + ui.esc(st.q) + '"></span></label>' +
      '<label class="check" style="align-self:center"><input type="checkbox" id="compactPick"' + (st.compact ? ' checked' : '') + '> <span>แบบกะทัดรัด</span></label>' +
      '</div><div id="searchInfo"></div><div id="gridBox"></div>';
    box.innerHTML = html;
    ui.$$('#viewPick button').forEach(function (b) { b.onclick = function () { st.view = b.dataset.view; st.id = null; renderGrid(box); }; });
    ui.$('#entPick').onchange = function (e) { st.id = e.target.value; drawGrid(); };
    const step = function (d) {
      const i = list.findIndex(function (x) { return x.id === st.id; });
      const n = list[(i + d + list.length) % list.length];
      if (n) { st.id = n.id; ui.$('#entPick').value = n.id; drawGrid(); }
    };
    ui.$('#entPrev').onclick = function () { step(-1); };
    ui.$('#entNext').onclick = function () { step(1); };
    ui.$('#subjQ').oninput = function (e) { st.q = e.target.value.trim(); drawGrid(); };
    ui.$('#compactPick').onchange = function (e) { st.compact = e.target.checked; drawGrid(); };
    drawGrid();
  }

  function drawGrid() {
    const r = run();
    const s = r.settings;
    const V = M.VIEWS[st.view];
    const ent = r.dataset[V.list].find(function (x) { return x[V.key] === st.id; });
    const g = M.grid(r.dataset, s, r.result.placements, st.view, st.id);
    const cols = M.columns(s);
    const tm = g.tm;
    // ข้อมูลประกอบหัวตาราง
    let sub = g.count + ' คาบ/สัปดาห์';
    if (st.view === 'teacher' && ent) sub += (ent.max_periods ? ' (ภาระสูงสุด ' + ent.max_periods + ')' : '') + (ent.department ? ' — ' + ent.department : '');
    if (st.view === 'group' && ent) sub += ' — ผู้เรียน ' + ent.students + ' คน' + (ent.level ? ', ' + ent.level : '');
    if (st.view === 'room' && ent) sub += ' — ' + (ent.type || 'ห้องทั่วไป') + ', จุ ' + ent.capacity + ' คน' + (ent.building ? ', ' + ent.building : '');
    const colTpl = ['7.2rem'].concat(cols.map(function (c) { return c.kind === 'period' ? 'minmax(7.4rem, 1fr)' : '2.2rem'; })).join(' ');
    const colIndex = {};
    cols.forEach(function (c, i) { if (c.kind === 'period') colIndex[c.p] = i + 2; });
    let html = '<div class="tt-title"><h2>' + ui.esc(M.entityTitle(st.view, ent)) + '</h2><span class="muted">' + ui.esc(sub) + '</span></div>';
    html += '<div class="tt-scroll"><div class="tt' + (st.q ? ' is-searching' : '') + (st.compact ? ' is-compact' : '') + '" style="grid-template-columns:' + colTpl + '" role="table" aria-label="ตารางสอน ' + ui.esc(M.entityTitle(st.view, ent)) + '">';
    html += '<div class="tt-corner" role="columnheader">วัน / คาบ</div>';
    cols.forEach(function (c) {
      if (c.kind === 'period') html += '<div class="tt-period" role="columnheader"><b>คาบ ' + c.p + '</b><span>' + c.time.label + '</span></div>';
      else html += '<div class="tt-break-head" role="columnheader">พัก</div>';
    });
    let matches = 0;
    g.rows.forEach(function (row, ri) {
      const gr = ri + 2;
      html += '<div class="tt-day" role="rowheader" style="grid-row:' + gr + ';grid-column:1"><b>' + U.DAY_NAMES[row.day] + '</b><span>' + row.cells.filter(function (c) { return c.type === 'class'; }).reduce(function (s2, c) { return s2 + c.span; }, 0) + ' คาบ</span></div>';
      row.cells.forEach(function (cell) {
        const c1 = colIndex[cell.period], c2 = colIndex[cell.period + cell.span - 1] + 1;
        const pos = 'grid-row:' + gr + ';grid-column:' + c1 + '/' + c2;
        if (cell.type === 'class') {
          const p = cell.pl;
          const t = M.placementText(idx, p);
          const isM = matchQ(p, st.q);
          if (isM) matches++;
          const who = st.view === 'teacher' ? t.group : t.teachers.join(', ');
          const where = st.view === 'room' ? t.groupId : 'ห้อง ' + t.room;
          const pos2 = st.view === 'room' ? t.teachers.join(', ') : '';
          html += '<div class="tt-slot" role="cell" style="' + pos + '"><button type="button" class="tt-card c' + U.colorIndex(p.subject_id) + (p.len === 1 ? ' is-short' : '') + (isM ? ' is-match' : '') + (cell.extra.length ? ' is-clash' : '') + '" data-sid="' + p.sid + '" aria-label="' + ui.esc(U.DAY_NAMES[row.day] + ' คาบ ' + p.period + (p.len > 1 ? '-' + (p.period + p.len - 1) : '') + ' ' + t.name + ' ' + who + ' ' + where) + '">' +
            '<span class="code"><span>' + ui.esc(t.code) + '</span><span>' + M.timeRange(r.settings, p) + '</span></span>' +
            '<span class="name">' + ui.esc(t.name) + '</span>' +
            '<span class="who">' + ui.esc(who) + '</span>' +
            '<span class="where">' + ui.esc(where) + (pos2 ? ' — ' + ui.esc(pos2) : '') + '</span></button></div>';
        } else if (cell.type === 'blocked') {
          html += '<div class="tt-slot is-blocked" role="cell" style="' + pos + '">' + ui.esc(r.settings.blockedLabel || 'กิจกรรม') + '</div>';
        } else {
          html += '<div class="tt-slot" role="cell" style="' + pos + '"></div>';
        }
      });
    });
    cols.forEach(function (c, i) {
      if (c.kind === 'break') html += '<div class="tt-breakcol" style="grid-row:2/' + (g.rows.length + 2) + ';grid-column:' + (i + 2) + '"><span>' + ui.esc(c.label) + '</span></div>';
    });
    html += '</div></div>';
    html += '<div class="tt-legend" style="margin-top:0.7rem"><span><i style="background:repeating-linear-gradient(135deg,#f2f4f2 0 4px,#e2e8e3 4px 8px)"></i>' + ui.esc(r.settings.blockedLabel || 'กิจกรรม') + '</span><span><i style="background:#f1ead4"></i>ช่วงพัก</span><span>คลิกบัตรวิชาเพื่อดูรายละเอียด</span></div>';
    ui.$('#gridBox').innerHTML = html;
    ui.$$('#gridBox .tt-card').forEach(function (b) { b.onclick = function () { openDetail(+b.dataset.sid); }; });

    // สรุปผลค้นหาวิชา: วิชานี้อยู่ในตารางไหนบ้าง
    const info = ui.$('#searchInfo');
    if (!st.q) { info.innerHTML = ''; return; }
    const all = r.result.placements.filter(function (p) { return matchQ(p, st.q); });
    const where = {};
    all.forEach(function (p) {
      const ids = st.view === 'group' ? [p.group_id] : st.view === 'room' ? [p.room_id] : p.teacher_ids;
      ids.forEach(function (id) { where[id] = (where[id] || 0) + p.len; });
    });
    const keys = Object.keys(where);
    const subj = Array.from(new Set(all.map(function (p) { return p.subject_id; })));
    info.innerHTML = '<div class="callout callout-info" style="margin-bottom:0.8rem">' + ui.icon('search') + '<div><p>พบ "' + ui.esc(st.q) + '" ' + all.length + ' ช่วงสอน (' + all.reduce(function (s2, p) { return s2 + p.len; }, 0) + ' คาบ) ใน ' + subj.length + ' วิชา, ' + keys.length + ' ' + M.VIEWS[st.view].label + ' — ในตารางนี้ ' + matches + ' ช่วง</p>' +
      (keys.length ? '<div class="row" style="gap:0.35rem;margin-top:0.4rem">' + keys.slice(0, 30).map(function (k) { return '<button type="button" class="btn btn-sm' + (k === st.id ? ' btn-primary' : '') + '" data-jump="' + ui.esc(k) + '">' + ui.esc(k) + ' (' + where[k] + ')</button>'; }).join('') + (keys.length > 30 ? '<span class="small">และอีก ' + (keys.length - 30) + '</span>' : '') + '</div>' : '') +
      '</div></div>';
    ui.$$('[data-jump]', info).forEach(function (b) { b.onclick = function () { st.id = b.dataset.jump; ui.$('#entPick').value = st.id; drawGrid(); }; });
  }

  /* ---------- รายละเอียดคาบ ---------- */
  function openDetail(sid) {
    const r = run();
    const p = r.result.placements.find(function (x) { return x.sid === sid; });
    if (!p) return;
    const s = idx.subject[p.subject_id] || {}, g = idx.group[p.group_id] || {}, rm = idx.room[p.room_id] || {};
    const ts = p.teacher_ids.map(function (t) { return idx.teacher[t] || { teacher_id: t, name: t }; });
    ui.$('#detailCode').textContent = p.subject_id + (s.theory != null ? '  (' + [s.theory, s.practice, s.credit].join('-') + ')' : '');
    ui.$('#detailTitle').textContent = s.name || p.subject_id;
    ui.$('#detailBody').innerHTML = '<dl class="kv">' +
      '<dt>วันและเวลา</dt><dd>' + U.DAY_NAMES[p.day] + ' คาบ ' + p.period + (p.len > 1 ? '–' + (p.period + p.len - 1) : '') + ' (' + M.timeRange(r.settings, p) + ')</dd>' +
      '<dt>ช่วงที่</dt><dd>' + p.part + ' จาก ' + p.parts + ' ช่วงต่อสัปดาห์ (' + p.len + ' คาบ)</dd>' +
      '<dt>กลุ่มเรียน</dt><dd>' + ui.esc(g.name || p.group_id) + ' <span class="muted">(' + ui.esc(p.group_id) + ', ' + (g.students || '-') + ' คน)</span></dd>' +
      '<dt>ครูผู้สอน</dt><dd>' + ts.map(function (t) { return ui.esc(t.name) + ' <span class="muted">(' + ui.esc(t.teacher_id) + (t.position ? ', ' + ui.esc(t.position) : '') + ')</span>'; }).join('<br>') + '</dd>' +
      '<dt>ห้องเรียน</dt><dd>' + ui.esc(rm.name || p.room_id) + ' <span class="muted">(' + ui.esc(p.room_id) + ', ' + ui.esc(rm.type || '-') + ', จุ ' + (rm.capacity || '-') + ' คน' + (rm.building ? ', ' + ui.esc(rm.building) : '') + ')</span></dd>' +
      '</dl><div class="row">' +
      '<button type="button" class="btn btn-sm" data-goto="group" data-id="' + ui.esc(p.group_id) + '">ตารางกลุ่มนี้</button>' +
      ts.map(function (t) { return '<button type="button" class="btn btn-sm" data-goto="teacher" data-id="' + ui.esc(t.teacher_id) + '">ตาราง ' + ui.esc(t.name.split(' ')[0]) + '</button>'; }).join('') +
      '<button type="button" class="btn btn-sm" data-goto="room" data-id="' + ui.esc(p.room_id) + '">ตารางห้อง ' + ui.esc(p.room_id) + '</button></div>';
    const dlg = ui.$('#detailDialog');
    ui.$$('[data-goto]', dlg).forEach(function (b) {
      b.onclick = function () { dlg.close(); st.tab = 'grid'; st.view = b.dataset.goto; st.id = b.dataset.id; render(); };
    });
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  /* ---------- รายการคาบ ---------- */
  function renderList(box) {
    const r = run();
    box.innerHTML = '<div class="tt-toolbar"><label class="field grow"><span>ค้นหา (วิชา ครู ห้อง กลุ่ม)</span><span class="search">' + ui.icon('search') + '<input class="input" type="search" id="listQ" value="' + ui.esc(st.listQ) + '" placeholder="เช่น ฐานข้อมูล หรือ T012 หรือ COM01"></span></label>' +
      '<label class="field"><span>วัน</span><select class="select" id="listDay"><option value="all">ทุกวัน</option>' + TT.timeModel(r.settings).days.map(function (d) { return '<option value="' + d + '"' + (String(d) === st.listDay ? ' selected' : '') + '>' + U.DAY_NAMES[d] + '</option>'; }).join('') + '</select></label></div><div id="listTable"></div>';
    const rowsAll = r.result.placements.map(function (p) {
      const t = M.placementText(idx, p);
      const ts = p.teacher_ids.map(function (x) { return idx.teacher[x] || {}; });
      return { p: p, day: p.day, dayName: U.DAY_NAMES[p.day], period: p.period, time: M.timeRange(r.settings, p), len: p.len, group: p.group_id, groupName: t.group, code: p.subject_id, name: t.name, teachers: ts.map(function (x) { return x.name; }).join(', '), positions: ts.map(function (x) { return x.position || ''; }).join(', '), tids: p.teacher_ids.join(' '), room: p.room_id, roomName: t.roomName };
    });
    const filter = function () {
      const q = st.listQ.toLowerCase();
      return rowsAll.filter(function (x) {
        if (st.listDay !== 'all' && String(x.day) !== st.listDay) return false;
        if (!q) return true;
        return [x.code, x.name, x.teachers, x.tids, x.room, x.roomName, x.group, x.groupName].join(' ').toLowerCase().indexOf(q) >= 0;
      });
    };
    const tbl = ui.dataTable(ui.$('#listTable'), {
      rows: filter(), pageSize: 100, maxHeight: '620px',
      columns: [
        { key: 'dayName', label: 'วัน', sort: function (x) { return x.day * 100 + x.period; } },
        { key: 'time', label: 'เวลา', sort: function (x) { return x.day * 100 + x.period; }, render: function (x) { return '<span class="nowrap num">' + x.time + '</span><br><span class="small muted">คาบ ' + x.period + (x.len > 1 ? '–' + (x.period + x.len - 1) : '') + '</span>'; } },
        { key: 'group', label: 'กลุ่มเรียน', render: function (x) { return ui.esc(x.group) + '<br><span class="small muted">' + ui.esc(x.groupName) + '</span>'; } },
        { key: 'code', label: 'วิชา', render: function (x) { return '<span class="small muted">' + ui.esc(x.code) + '</span><br>' + ui.esc(x.name); } },
        { key: 'teachers', label: 'ครู (ตำแหน่ง)', render: function (x) { return ui.esc(x.teachers) + '<br><span class="small muted">' + ui.esc(x.positions) + '</span>'; } },
        { key: 'room', label: 'ห้อง', render: function (x) { return ui.esc(x.room) + '<br><span class="small muted">' + ui.esc(x.roomName) + '</span>'; } },
        { key: 'len', label: 'คาบ', num: true }
      ]
    });
    ui.$('#listQ').oninput = function (e) { st.listQ = e.target.value; tbl.setRows(filter()); };
    ui.$('#listDay').onchange = function (e) { st.listDay = e.target.value; tbl.setRows(filter()); };
  }

  /* ---------- ภาระสอนรายครู ---------- */
  function renderLoad(box) {
    const m = run().metrics;
    const maxP = Math.max.apply(null, m.teacherLoad.map(function (t) { return Math.max(t.periods, t.max || 0); }).concat([1]));
    const loads = m.teacherLoad.map(function (t) { return t.periods; });
    box.innerHTML = '<div class="callout callout-info" style="margin-bottom:1rem">' + ui.icon('info') + '<div><p>ครู ' + m.teacherLoad.length + ' คน ภาระเฉลี่ย ' + U.fmtNum(m.avgLoad, 1) + ' คาบ/สัปดาห์ (สูงสุด ' + Math.max.apply(null, loads.concat([0])) + ', ต่ำสุด ' + Math.min.apply(null, loads.concat([0])) + ') สอนมากที่สุดวันละ ' + m.maxDayLoad + ' คาบ เกินภาระที่กำหนด ' + m.overloaded + ' คน เส้นดำในแถบคือภาระสูงสุดของครูแต่ละคน</p></div></div><div id="loadTable"></div>';
    const days = TT.timeModel(run().settings).days;
    ui.dataTable(ui.$('#loadTable'), {
      rows: m.teacherLoad, pageSize: 200, maxHeight: '640px', sortKey: 'periods', sortDir: -1,
      columns: [
        { key: 'id', label: 'ครู', sort: function (t) { return t.teacher.teacher_id; }, render: function (t) { return ui.esc(t.teacher.name) + '<br><span class="small muted">' + ui.esc(t.teacher.teacher_id) + (t.teacher.position ? ', ' + ui.esc(t.teacher.position) : '') + '</span>'; } },
        { key: 'dept', label: 'แผนกวิชา', sort: function (t) { return t.teacher.department || ''; }, render: function (t) { return ui.esc(t.teacher.department || '-'); } },
        { key: 'periods', label: 'คาบ/สัปดาห์', num: true, render: function (t) { return '<b class="num">' + t.periods + '</b>' + (t.max ? '<span class="muted"> / ' + t.max + '</span>' : ''); } },
        { key: 'bar', label: 'เทียบภาระสูงสุด', nosort: true, render: function (t) { return '<div class="bar' + (t.status === 'over' ? ' is-over' : t.status === 'low' ? ' is-low' : '') + '"><span style="width:' + (100 * t.periods / maxP).toFixed(1) + '%"></span>' + (t.max ? '<i style="left:' + (100 * t.max / maxP).toFixed(1) + '%"></i>' : '') + '</div>'; } },
        { key: 'perDay', label: 'รายวัน (' + days.map(function (d) { return U.DAY_SHORT[d]; }).join(' ') + ')', nosort: true, render: function (t) { return '<span class="minibars" title="' + t.perDay.map(function (n, i) { return U.DAY_SHORT[days[i]] + ' ' + n; }).join(', ') + '">' + t.perDay.map(function (n) { return '<span class="' + (n ? '' : 'zero') + '" style="height:' + Math.max(2, n * 3) + 'px"></span>'; }).join('') + '</span>'; } },
        { key: 'maxDay', label: 'สูงสุด/วัน', num: true },
        { key: 'gaps', label: 'ว่างคั่น', num: true },
        { key: 'groups', label: 'กลุ่ม/วิชา', num: true, sort: function (t) { return t.groups.length; }, render: function (t) { return t.groups.length + ' / ' + t.subjects.length; } },
        { key: 'status', label: 'สถานะ', render: function (t) { return t.status === 'over' ? '<span class="badge badge-error">เกินภาระ</span>' : t.status === 'low' ? '<span class="badge badge-info">ต่ำกว่าครึ่ง</span>' : t.periods ? '<span class="badge badge-ok">เหมาะสม</span>' : '<span class="badge">ไม่มีคาบ</span>'; } }
      ]
    });
  }

  /* ---------- การใช้ห้อง ---------- */
  function renderRooms(box) {
    const m = run().metrics;
    const idle = m.roomUse.filter(function (x) { return !x.used; }).length;
    box.innerHTML = '<div class="callout callout-info" style="margin-bottom:1rem">' + ui.icon('info') + '<div><p>อัตราการใช้ห้อง = คาบที่มีการเรียน ÷ คาบที่เปิดใช้ได้ต่อสัปดาห์ (' + m.availPerRoom + ' คาบต่อห้อง ไม่นับช่วงกิจกรรม) เฉลี่ยทุกห้อง ' + U.fmtPct(m.roomRate) + ', เฉพาะห้องที่ใช้ ' + U.fmtPct(m.roomRateUsed) + ', ห้องที่ไม่ได้ใช้ ' + idle + ' ห้อง การใช้ที่นั่ง = จำนวนผู้เรียน ÷ ความจุ เฉลี่ยตามคาบ</p></div></div><div id="roomTable"></div>';
    ui.dataTable(ui.$('#roomTable'), {
      rows: m.roomUse, pageSize: 200, maxHeight: '640px', sortKey: 'rate', sortDir: -1,
      columns: [
        { key: 'id', label: 'ห้อง', sort: function (x) { return x.room.room_id; }, render: function (x) { return ui.esc(x.room.room_id) + '<br><span class="small muted">' + ui.esc(x.room.name || '') + '</span>'; } },
        { key: 'type', label: 'ประเภท', sort: function (x) { return x.room.type || ''; }, render: function (x) { return ui.esc(x.room.type || '-'); } },
        { key: 'cap', label: 'ความจุ', num: true, sort: function (x) { return x.room.capacity; }, render: function (x) { return x.room.capacity; } },
        { key: 'used', label: 'คาบที่ใช้', num: true, render: function (x) { return x.used + '<span class="muted"> / ' + x.avail + '</span>'; } },
        { key: 'rate', label: 'อัตราการใช้ห้อง', render: function (x) { return '<div class="row" style="gap:0.6rem;flex-wrap:nowrap"><div class="bar" style="flex:1"><span style="width:' + (x.rate * 100).toFixed(1) + '%"></span></div><b class="num" style="min-width:3.6rem;text-align:right">' + U.fmtPct(x.rate) + '</b></div>'; } },
        { key: 'seatRate', label: 'การใช้ที่นั่ง', num: true, render: function (x) { return x.used ? U.fmtPct(x.seatRate) : '-'; } }
      ]
    });
  }

  /* ---------- เวลาว่างคั่น ---------- */
  function renderGaps(box) {
    const m = run().metrics;
    const days = TT.timeModel(run().settings).days;
    box.innerHTML = '<div class="callout callout-info" style="margin-bottom:1rem">' + ui.icon('info') + '<div><p>เวลาว่างคั่น = คาบว่างระหว่างวิชาแรกและวิชาสุดท้ายของวัน (ไม่นับช่วงพักและช่วงกิจกรรม) รวมทุกกลุ่ม ' + m.totalGroupGaps + ' คาบ เฉลี่ย ' + U.fmtNum(m.avgGapPerGroup, 2) + ' คาบต่อกลุ่มต่อสัปดาห์ กลุ่มที่มีเวลาว่างคั่น ' + m.groupsWithGaps + ' กลุ่ม</p></div></div><div id="gapTable"></div>';
    ui.dataTable(ui.$('#gapTable'), {
      rows: m.groupGaps, pageSize: 200, maxHeight: '640px', sortKey: 'total', sortDir: -1,
      columns: [
        { key: 'id', label: 'กลุ่มเรียน', sort: function (g) { return g.group.group_id; }, render: function (g) { return ui.esc(g.group.group_id) + '<br><span class="small muted">' + ui.esc(g.group.name) + '</span>'; } },
        { key: 'periods', label: 'คาบ/สัปดาห์', num: true },
        { key: 'days', label: 'วันที่เรียน', num: true },
        { key: 'total', label: 'ว่างคั่นรวม', num: true, render: function (g) { return g.total ? '<b style="color:var(--warn)">' + g.total + '</b>' : '0'; } },
        { key: 'perDay', label: 'รายวัน', nosort: true, render: function (g) { return g.perDay.map(function (n, i) { return '<span class="badge' + (n ? ' badge-warning' : '') + '" style="margin:1px">' + U.DAY_SHORT[days[i]] + ' ' + n + '</span>'; }).join(''); } },
        { key: 'longest', label: 'ช่วงว่างยาวสุด', num: true }
      ]
    });
  }

  /* ---------- ข้อขัดแย้ง ---------- */
  function renderIssues(box) {
    const r = run(), m = r.metrics;
    const tm = TT.timeModel(r.settings);
    const rowsC = [
      ['ครูซ้อนคาบ', 'ครูคนเดียวกันอยู่ในคาบเดียวกันมากกว่า 1 รายการ', m.clashes.teacher],
      ['ห้องซ้อนกัน', 'ห้องเดียวกันถูกใช้มากกว่า 1 กลุ่มในคาบเดียวกัน', m.clashes.room],
      ['กลุ่มเรียนเวลาตรงกัน', 'กลุ่มเรียนเดียวกันมีมากกว่า 1 วิชาในคาบเดียวกัน', m.clashes.group]
    ];
    let html = '<div class="panel"><h2>สรุปคาบชนจากตารางจริง</h2><p class="muted small">ระบบนับใหม่จากรายการคาบทั้งหมด ' + U.fmtNum(m.sessions) + ' ช่วงสอน โดยแยกทุกคาบของครู ห้อง และกลุ่มเรียน แล้วหาช่องที่มีมากกว่า 1 รายการ (ไม่ได้ใช้ค่าที่ตัวจัดตารางรายงาน)</p>' +
      '<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>ประเภท</th><th>วิธีตรวจ</th><th class="num">จำนวน</th><th>ผล</th></tr></thead><tbody>';
    rowsC.forEach(function (x) { html += '<tr><td><b>' + x[0] + '</b></td><td>' + x[1] + '</td><td class="num">' + x[2].length + '</td><td>' + (x[2].length ? '<span class="badge badge-error">พบ</span>' : '<span class="badge badge-ok">' + ui.icon('check') + 'ไม่พบ</span>') + '</td></tr>'; });
    html += '<tr><td><b>เงื่อนไขอื่น</b></td><td>เวลาไม่ว่างของครู, ช่วงกิจกรรม, คร่อมพัก, ประเภทห้อง, ความจุห้อง</td><td class="num">' + m.violations.length + '</td><td>' + (m.violations.length ? '<span class="badge badge-error">พบ</span>' : '<span class="badge badge-ok">' + ui.icon('check') + 'ไม่พบ</span>') + '</td></tr>';
    html += '<tr><td><b>จำนวนคาบ</b></td><td>คาบที่จัดได้เทียบกับคาบที่มอบหมาย (รายวิชา-กลุ่ม)</td><td class="num">' + m.scheduled + '/' + m.required + '</td><td>' + (m.shortAssign.length ? '<span class="badge badge-warning">ไม่ครบ ' + m.shortAssign.length + ' รายการ</span>' : '<span class="badge badge-ok">' + ui.icon('check') + 'ครบ</span>') + '</td></tr>';
    html += '</tbody></table></div>';
    const clashList = m.clashes.teacher.concat(m.clashes.room, m.clashes.group);
    if (clashList.length) {
      html += '<h3 style="margin-top:1rem">รายละเอียดคาบชน</h3><ul class="issues">' + clashList.map(function (c) {
        return '<li class="issue" data-sev="error"><span class="badge badge-error">' + (c.kind === 'teacher' ? 'ครู' : c.kind === 'room' ? 'ห้อง' : 'กลุ่ม') + '</span><div class="msg">' + ui.esc(c.id) + ' — ' + tm.slotLabel(c.di, c.period) + ': ' + c.items.map(function (p) { return p.subject_id + ' (' + p.group_id + ')'; }).join(', ') + '</div></li>';
      }).join('') + '</ul>';
    }
    if (m.violations.length) {
      html += '<h3 style="margin-top:1rem">เงื่อนไขที่ไม่ผ่าน</h3><ul class="issues">' + m.violations.slice(0, 200).map(function (v) { return '<li class="issue" data-sev="error"><span class="badge badge-error">' + ui.esc(v.kind) + '</span><div class="msg">' + ui.esc(v.pl.subject_id + ' (' + v.pl.group_id + '): ' + v.text) + '</div></li>'; }).join('') + '</ul>';
    }
    html += '</div>';
    html += '<div class="panel" style="margin-top:1.25rem"><h2>คาบที่จัดไม่ได้</h2>';
    if (!r.result.unscheduled.length) html += '<div class="callout callout-ok">' + ui.icon('okc') + '<div><p>จัดได้ครบทุกคาบ ไม่มีรายการค้าง</p></div></div>';
    else {
      html += '<p class="muted small">สาเหตุวิเคราะห์จากตารางสุดท้าย ใช้แนวทางแก้แล้วกลับไปนำเข้าหรือจัดตารางใหม่</p><ul class="issues">' + r.result.unscheduled.map(function (u) {
        const s = idx.subject[u.subject_id] || {};
        return '<li class="issue" data-sev="warning"><span class="badge badge-warning">' + u.len + ' คาบ</span><div><div class="msg">' + ui.esc(u.subject_id + ' ' + (s.name || '') + ' — กลุ่ม ' + u.group_id + ', ครู ' + u.teacher_ids.join(', ')) + '</div><div class="where">' + ui.esc(u.reason.text) + '</div></div><div class="fix"><b>วิธีแก้:</b> ' + ui.esc(u.reason.fix) + '</div></li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
    box.innerHTML = html;
  }

  TT.views.results = {
    init: function () {
      ui.$('#detailClose').addEventListener('click', function () { ui.$('#detailDialog').close(); });
      ui.$('#detailDialog').addEventListener('click', function (e) { if (e.target === e.currentTarget) e.currentTarget.close(); });
    },
    show: function () { if (run() && run().result) render(); },
    openRun: function (r) { TT.app.setRun(r); st.tab = 'grid'; TT.app.go('results'); }
  };
})(typeof self !== 'undefined' ? self : globalThis);
