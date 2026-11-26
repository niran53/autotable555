/* print.js — หน้าพิมพ์ตารางสอนจากผลที่ "ยืนยันแล้ว" เท่านั้น จัดหน้า A4 แนวนอน หนึ่งตารางต่อหนึ่งหน้า */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, M = TT.model;
  const esc = U.escapeHtml;
  const $ = function (s) { return document.querySelector(s); };

  let run = null, idx = null;

  function params() {
    const q = new URLSearchParams(location.search);
    return { run: q.get('run'), view: q.get('view') || 'group', id: q.get('id') || '' };
  }

  function fail(msg, fix) {
    $('#printInfo').innerHTML = '';
    $('#pages').innerHTML = '<div class="print-msg"><div class="callout callout-error" role="alert"><div><p><b>' + esc(msg) + '</b></p>' + (fix ? '<p class="small">' + esc(fix) + '</p>' : '') + '<p style="margin-top:0.8rem"><a class="btn" href="index.html#results">กลับไปหน้าผลลัพธ์</a></p></div></div></div>';
  }

  function pageHtml(kind, ent) {
    const s = run.settings;
    const g = M.grid(run.dataset, s, run.result.placements, kind, ent[M.VIEWS[kind].key]);
    const cols = M.columns(s);
    const titleKind = kind === 'group' ? 'ตารางเรียน' : kind === 'teacher' ? 'ตารางสอน' : 'ตารางการใช้ห้อง';
    let sub = '';
    if (kind === 'group') sub = (ent.level ? ent.level + ' ' : '') + (ent.department ? 'แผนกวิชา' + ent.department + ' ' : '') + 'ผู้เรียน ' + ent.students + ' คน';
    if (kind === 'teacher') sub = (ent.department ? 'แผนกวิชา' + ent.department + ' ' : '') + 'ภาระสอน ' + g.count + ' คาบ/สัปดาห์' + (ent.max_periods ? ' (สูงสุด ' + ent.max_periods + ')' : '');
    if (kind === 'room') sub = (ent.type || 'ห้องทั่วไป') + ' ความจุ ' + ent.capacity + ' คน' + (ent.building ? ' ' + ent.building : '') + ' ใช้ ' + g.count + ' คาบ/สัปดาห์';
    let html = '<section class="sheet-page"><header class="pp-head"><div><div class="pp-school">' + esc(s.schoolName || '') + '</div><h2>' + titleKind + ' ' + esc(M.entityTitle(kind, ent)) + '</h2><div class="pp-sub">' + esc(sub) + '</div></div><div class="pp-term">' + esc(s.term || '') + '</div></header>';
    html += '<table class="pp-grid"><thead><tr><th class="pp-day">วัน / คาบ</th>';
    cols.forEach(function (c) {
      if (c.kind === 'period') html += '<th>คาบ ' + c.p + '<br><span>' + c.time.label + '</span></th>';
      else html += '<th class="pp-break">พัก</th>';
    });
    html += '</tr></thead><tbody>';
    const colOf = {};
    cols.forEach(function (c, i) { if (c.kind === 'period') colOf[c.p] = i; });
    g.rows.forEach(function (row, ri) {
      html += '<tr><th class="pp-day">' + U.DAY_NAMES[row.day] + '</th>';
      let ci = 0;
      row.cells.forEach(function (cell) {
        const start = colOf[cell.period];
        while (ci < start) { // คอลัมน์พัก
          if (cols[ci].kind === 'break') html += ri === 0 ? '<td class="pp-break" rowspan="' + g.rows.length + '"><span>' + esc(cols[ci].label) + '</span></td>' : '';
          ci++;
        }
        if (cell.type === 'class') {
          const t = M.placementText(idx, cell.pl);
          const who = kind === 'teacher' ? t.groupId : t.teachers.join(', ');
          const where = kind === 'room' ? t.groupId + ' ' + t.teachers.join(', ') : 'ห้อง ' + t.room;
          const line2 = kind === 'room' ? where : who + '  ' + where;
          html += '<td colspan="' + cell.span + '" class="pp-class c' + U.colorIndex(cell.pl.subject_id) + '"><b>' + esc(t.code) + '</b><div class="pp-name">' + esc(t.name) + '</div><div class="pp-who">' + esc(line2) + '</div></td>';
        } else if (cell.type === 'blocked') {
          html += '<td colspan="' + cell.span + '" class="pp-blocked">' + esc(s.blockedLabel || 'กิจกรรม') + '</td>';
        } else html += '<td></td>';
        ci = start + cell.span;
      });
      while (ci < cols.length) { if (cols[ci].kind === 'break' && ri === 0) html += '<td class="pp-break" rowspan="' + g.rows.length + '"><span>' + esc(cols[ci].label) + '</span></td>'; ci++; }
      html += '</tr>';
    });
    html += '</tbody></table>';
    // รายการวิชาในตารางนี้
    const agg = {};
    g.items.forEach(function (p) {
      const k = kind === 'teacher' ? p.subject_id + '|' + p.group_id : p.subject_id + '|' + p.group_id;
      if (!agg[k]) agg[k] = { p: p, n: 0 };
      agg[k].n += p.len;
    });
    const head = '<thead><tr><th>รหัสวิชา</th><th>ชื่อวิชา</th><th>ท-ป-น</th><th>' + (kind === 'group' ? 'ครูผู้สอน' : 'กลุ่มเรียน') + '</th><th>' + (kind === 'room' ? 'ครูผู้สอน' : 'ห้อง') + '</th><th>คาบ</th></tr></thead>';
    const rowsHtml = Object.keys(agg).sort().map(function (k) {
      const a = agg[k], p = a.p, sj = idx.subject[p.subject_id] || {};
      const rooms = Array.from(new Set(g.items.filter(function (x) { return x.subject_id === p.subject_id && x.group_id === p.group_id; }).map(function (x) { return x.room_id; }))).join(', ');
      const teachers = p.teacher_ids.map(function (t) { return idx.teacher[t] ? idx.teacher[t].name : t; }).join(', ');
      return '<tr><td>' + esc(p.subject_id) + '</td><td>' + esc(sj.name || '') + '</td><td>' + [sj.theory, sj.practice, sj.credit].map(function (x) { return x == null ? '-' : x; }).join('-') + '</td><td>' + esc(kind === 'group' ? teachers : p.group_id) + '</td><td>' + esc(kind === 'room' ? teachers : rooms) + '</td><td class="num">' + a.n + '</td></tr>';
    });
    const total = '<tr class="pp-total"><td colspan="5">รวม</td><td class="num">' + g.count + '</td></tr>';
    if (rowsHtml.length > 5) {
      const half = Math.ceil(rowsHtml.length / 2);
      html += '<div class="pp-lists"><table class="pp-list">' + head + '<tbody>' + rowsHtml.slice(0, half).join('') + '</tbody></table>' +
        '<table class="pp-list">' + head + '<tbody>' + rowsHtml.slice(half).join('') + total + '</tbody></table></div>';
    } else {
      html += '<div class="pp-lists one"><table class="pp-list">' + head + '<tbody>' + rowsHtml.join('') + total + '</tbody></table></div>';
    }
    html += '<footer class="pp-foot"><div class="pp-sign"><div>ลงชื่อ ........................................ ผู้จัดตาราง</div><div>ลงชื่อ ........................................ รองผู้อำนวยการฝ่ายวิชาการ</div></div>' +
      '<div class="pp-meta">รอบ ' + esc(String(run.id).slice(0, 8)) + ' ยืนยันผลเมื่อ ' + U.fmtDateTime(run.confirmed_at) + ' พิมพ์เมื่อ ' + U.fmtDateTime(new Date().toISOString()) + '</div></footer></section>';
    return html;
  }

  function summaryHtml() {
    const m = run.metrics, s = run.settings;
    return '<section class="sheet-page pp-summary"><header class="pp-head"><div><div class="pp-school">' + esc(s.schoolName || '') + '</div><h2>สรุปผลการจัดตารางสอน</h2><div class="pp-sub">รอบ ' + esc(String(run.id).slice(0, 8)) + ' จัดเมื่อ ' + U.fmtDateTime(run.started_at) + ' ยืนยันผลเมื่อ ' + U.fmtDateTime(run.confirmed_at) + '</div></div><div class="pp-term">' + esc(s.term || '') + '</div></header>' +
      '<table class="pp-list pp-kv"><tbody>' +
      [['ข้อมูลนำเข้า', 'ครู ' + run.dataset.teachers.length + ' คน, ห้อง ' + run.dataset.rooms.length + ' ห้อง, วิชา ' + run.dataset.subjects.length + ' วิชา, กลุ่มเรียน ' + run.dataset.groups.length + ' กลุ่ม, รายการสอน ' + run.dataset.assignments.length + ' รายการ'],
        ['คาบที่ต้องจัด / จัดได้', m.required + ' / ' + m.scheduled + ' คาบ' + (m.unscheduledPeriods ? ' (ยังจัดไม่ได้ ' + m.unscheduledPeriods + ' คาบ)' : ' (ครบ)')],
        ['ครูซ้อนคาบ', m.clashes.teacher.length + ' รายการ'], ['ห้องซ้อนกัน', m.clashes.room.length + ' รายการ'], ['กลุ่มเรียนเวลาตรงกัน', m.clashes.group.length + ' รายการ'], ['ข้อขัดแย้งอื่น', m.violations.length + ' รายการ'],
        ['อัตราการใช้ห้อง', U.fmtPct(m.roomRateUsed) + ' (เฉพาะห้องที่ใช้ ' + m.roomsUsed + ' ห้อง), ทุกห้อง ' + U.fmtPct(m.roomRate)],
        ['เวลาว่างคั่นระหว่างวิชา', m.totalGroupGaps + ' คาบ รวมทุกกลุ่ม (เฉลี่ย ' + U.fmtNum(m.avgGapPerGroup, 2) + ' คาบ/กลุ่ม)'],
        ['ภาระสอนเฉลี่ย', U.fmtNum(m.avgLoad, 1) + ' คาบ/สัปดาห์ (ส่วนเบี่ยงเบน ' + U.fmtNum(m.sdLoad, 1) + ') เกินภาระ ' + m.overloaded + ' คน'],
        ['ช่วงเวลาเรียน', TT.timeModel(s).days.map(function (d) { return U.DAY_NAMES[d]; }).join(' ') + ' วันละ ' + s.periodsPerDay + ' คาบ เริ่ม ' + s.startTime + ' คาบละ ' + s.periodMinutes + ' นาที' + (s.blocked ? ' กิจกรรม ' + s.blocked : '')]
      ].map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') +
      '</tbody></table></section>';
  }

  function renderPages() {
    const kind = $('#pView').value;
    const which = $('#pWhich').value;
    const V = M.VIEWS[kind];
    const list = run.dataset[V.list].filter(function (e) {
      if (which && which !== '__all') return e[V.key] === which;
      return run.result.placements.some(function (p) { return V.match(p, e[V.key]); });
    });
    let html = $('#pSummary').checked ? summaryHtml() : '';
    list.forEach(function (e) { html += pageHtml(kind, e); });
    $('#pages').innerHTML = html;
    $('#printInfo').textContent = (run.settings.schoolName || '') + ' — ' + list.length + ' ตาราง' + ($('#pSummary').checked ? ' + หน้าสรุป' : '') + ' (' + (list.length + ($('#pSummary').checked ? 1 : 0)) + ' หน้า A4 แนวนอน)';
  }

  function fillWhich(kind, selected) {
    const V = M.VIEWS[kind];
    const opts = ['<option value="__all">ทั้งหมดที่มีคาบ</option>'].concat(run.dataset[V.list].map(function (e) {
      return '<option value="' + esc(e[V.key]) + '"' + (e[V.key] === selected ? ' selected' : '') + '>' + esc(e[V.key] + ' — ' + (e.name || '')) + '</option>';
    }));
    $('#pWhich').innerHTML = opts.join('');
  }

  async function init() {
    const p = params();
    if (!p.run) { fail('ไม่ได้ระบุรอบรันที่จะพิมพ์', 'เปิดหน้านี้จากปุ่ม "หน้าพิมพ์ PDF" ในหน้าตารางผลลัพธ์'); return; }
    try {
      run = await TT.store.getRun(p.run);
      if (!run || !run.result) { fail('ไม่พบผลของรอบรันนี้', 'อาจถูกล้างจากเครื่องนี้แล้ว หรือยังไม่ได้เชื่อมต่อ Supabase เครื่องเดียวกับที่จัดตาราง'); return; }
      if (!run.confirmed) { fail('ผลของรอบนี้ยังไม่ได้ยืนยัน', 'กลับไปที่หน้าตารางผลลัพธ์ กด "ยืนยันผลตาราง" ก่อน แล้วจึงเปิดหน้าพิมพ์'); return; }
      const ds = await TT.store.getDataset(run.dataset_id);
      if (!ds || !ds.payload) { fail('ไม่พบชุดข้อมูลของรอบนี้'); return; }
      run.dataset = ds.payload;
    } catch (e) { fail('โหลดข้อมูลไม่สำเร็จ: ' + e.message); return; }
    run.metrics = TT.metrics.analyze(run.dataset, run.settings, run.result.placements, run.result.unscheduled);
    idx = M.indexes(run.dataset);
    document.title = 'ตารางสอน ' + (run.settings.schoolName || '') + ' ' + (run.settings.term || '');
    $('#printControls').hidden = false;
    $('#printTip').hidden = false;
    $('#pView').value = M.VIEWS[p.view] ? p.view : 'group';
    fillWhich($('#pView').value, '__all');
    $('#pView').onchange = function () { fillWhich($('#pView').value, '__all'); renderPages(); };
    $('#pWhich').onchange = renderPages;
    $('#pSummary').onchange = renderPages;
    $('#pPrint').onclick = function () { root.print(); };
    renderPages();
  }

  document.addEventListener('DOMContentLoaded', init);
})(typeof self !== 'undefined' ? self : globalThis);
