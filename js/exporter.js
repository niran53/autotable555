/* exporter.js — ส่งออกผลตาราง: CSV, Excel (.xlsx), JSON และเตรียมข้อมูลสำหรับหน้าพิมพ์ PDF */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  function rowsOfPlacements(run) {
    const ds = run.dataset, idx = TT.model.indexes(ds);
    const head = ['วัน', 'คาบเริ่ม', 'จำนวนคาบ', 'เวลา', 'รหัสกลุ่ม', 'กลุ่มเรียน', 'รหัสวิชา', 'ชื่อวิชา', 'ท-ป-น', 'รหัสครู', 'ชื่อครู', 'ตำแหน่ง', 'รหัสห้อง', 'ชื่อห้อง', 'อาคาร', 'ช่วงที่'];
    const rows = [head];
    run.result.placements.forEach(function (p) {
      const s = idx.subject[p.subject_id] || {}, g = idx.group[p.group_id] || {}, r = idx.room[p.room_id] || {};
      const ts = p.teacher_ids.map(function (t) { return idx.teacher[t] || { teacher_id: t, name: t }; });
      rows.push([
        U.DAY_NAMES[p.day], p.period, p.len, TT.model.timeRange(run.settings, p),
        p.group_id, g.name || '', p.subject_id, s.name || '',
        [s.theory, s.practice, s.credit].map(function (x) { return x == null ? '-' : x; }).join('-'),
        p.teacher_ids.join(', '), ts.map(function (t) { return t.name; }).join(', '), ts.map(function (t) { return t.position || ''; }).join(', '),
        p.room_id, r.name || '', r.building || '', p.part + '/' + p.parts
      ]);
    });
    return rows;
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(run) {
    return '﻿' + rowsOfPlacements(run).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function toJson(run) {
    const m = run.metrics;
    return JSON.stringify({
      meta: { app: 'ระบบจัดตารางสอนอัตโนมัติ', version: 1, run_id: run.id, created_at: run.started_at, confirmed_at: run.confirmed_at, school: run.settings.schoolName, term: run.settings.term },
      settings: run.settings,
      summary: {
        periods_required: m.required, periods_scheduled: m.scheduled, periods_unscheduled: m.unscheduledPeriods,
        conflicts: { teacher: m.clashes.teacher.length, room: m.clashes.room.length, group: m.clashes.group.length, other: m.violations.length },
        room_utilization: +m.roomRate.toFixed(4), group_gap_periods: m.totalGroupGaps, avg_teacher_load: +m.avgLoad.toFixed(2)
      },
      result: { placements: run.result.placements, unscheduled: run.result.unscheduled },
      dataset: run.dataset
    }, null, 2);
  }

  /* ตารางแบบกริดสำหรับ Excel: วางหลายตารางซ้อนกันในแผ่นงานเดียว */
  function gridSheet(run, kind, title) {
    const ds = run.dataset, idx = TT.model.indexes(ds);
    const cols = TT.model.columns(run.settings);
    const list = ds[TT.model.VIEWS[kind].list];
    const key = TT.model.VIEWS[kind].key;
    const rows = [], merges = [], styles = {}, heights = {};
    const width = cols.length + 1;
    list.forEach(function (e) {
      const g = TT.model.grid(ds, run.settings, run.result.placements, kind, e[key]);
      if (!g.count) return;
      const r0 = rows.length;
      rows.push([TT.model.entityTitle(kind, e) + '  (' + g.count + ' คาบ/สัปดาห์)']);
      styles[r0 + ',0'] = 2;
      merges.push('A' + (r0 + 1) + ':' + TT.parsers.xlsx.colName(width - 1) + (r0 + 1));
      const head = ['วัน / คาบ'];
      cols.forEach(function (c) { head.push(c.kind === 'period' ? 'คาบ ' + c.p + '\n' + c.time.label : c.label); });
      rows.push(head);
      head.forEach(function (_, c) { styles[(r0 + 1) + ',' + c] = 1; });
      heights[r0 + 1] = 32;
      g.rows.forEach(function (dr) {
        const r = rows.length;
        const line = [U.DAY_NAMES[dr.day]];
        styles[r + ',0'] = 1;
        let ci = 1;
        const colOfPeriod = {};
        cols.forEach(function (c, i) { if (c.kind === 'period') colOfPeriod[c.p] = i + 1; });
        for (let i = 1; i < width; i++) line[i] = '';
        cols.forEach(function (c, i) { if (c.kind === 'break') { line[i + 1] = c.label; styles[r + ',' + (i + 1)] = 4; } });
        dr.cells.forEach(function (cell) {
          const c1 = colOfPeriod[cell.period];
          const c2 = colOfPeriod[cell.period + cell.span - 1];
          let text = '';
          let st = 3;
          if (cell.type === 'class') {
            const t = TT.model.placementText(idx, cell.pl);
            const who = kind === 'teacher' ? t.groupId : t.teachers.join(', ');
            const where = kind === 'room' ? t.groupId : t.room;
            text = t.code + '\n' + t.name + '\n' + who + (kind === 'room' ? '' : '  ห้อง ' + where);
            if (kind === 'room') text = t.code + '\n' + t.name + '\n' + t.groupId + '  ' + t.teachers.join(', ');
          } else if (cell.type === 'blocked') { text = run.settings.blockedLabel || 'กิจกรรม'; st = 4; }
          line[c1] = text;
          for (let c = c1; c <= c2; c++) styles[r + ',' + c] = st;
          // ช่องที่คร่อมคอลัมน์พักจะไม่เกิดขึ้น เพราะตัวจัดตารางไม่ให้เรียนคร่อมช่วงพัก
          if (c2 > c1) merges.push(TT.parsers.xlsx.colName(c1) + (r + 1) + ':' + TT.parsers.xlsx.colName(c2) + (r + 1));
          ci = c2 + 1;
        });
        rows.push(line);
        heights[r] = 62;
      });
      rows.push([]);
    });
    const widths = [12].concat(cols.map(function (c) { return c.kind === 'period' ? 20 : 8; }));
    return { name: title, rows: rows, merges: merges, styles: styles, widths: widths, headerRows: 0, noFreeze: true, rowHeights: heights, landscape: true };
  }

  function toXlsx(run) {
    const m = run.metrics;
    const sheets = [];
    const summary = [
      ['หัวข้อ', 'ค่า'],
      ['สถานศึกษา', run.settings.schoolName || ''], ['ภาคเรียน', run.settings.term || ''],
      ['รหัสรอบรัน', run.id], ['เวลาที่จัด', U.fmtDateTime(run.started_at)], ['ยืนยันผลเมื่อ', U.fmtDateTime(run.confirmed_at)],
      ['คาบที่ต้องจัด', m.required], ['คาบที่จัดได้', m.scheduled], ['คาบที่ยังจัดไม่ได้', m.unscheduledPeriods],
      ['ครูซ้อนคาบ', m.clashes.teacher.length], ['ห้องซ้อนกัน', m.clashes.room.length], ['กลุ่มเรียนเวลาตรงกัน', m.clashes.group.length], ['ข้อขัดแย้งอื่น', m.violations.length],
      ['อัตราการใช้ห้อง (ทุกห้อง)', +(m.roomRate * 100).toFixed(1) + '%'], ['เวลาว่างคั่นรวมของกลุ่มเรียน (คาบ)', m.totalGroupGaps],
      ['ภาระสอนเฉลี่ย (คาบ/สัปดาห์)', +m.avgLoad.toFixed(1)]
    ];
    sheets.push({ name: 'สรุป', rows: summary, widths: [36, 40] });
    sheets.push({ name: 'รายการคาบ', rows: rowsOfPlacements(run), widths: [10, 9, 9, 13, 12, 32, 12, 36, 9, 12, 30, 20, 10, 22, 16, 8] });
    sheets.push(gridSheet(run, 'group', 'ตารางรายกลุ่ม'));
    sheets.push(gridSheet(run, 'teacher', 'ตารางรายครู'));
    sheets.push(gridSheet(run, 'room', 'ตารางรายห้อง'));
    const tl = [['รหัสครู', 'ชื่อ-สกุล', 'ตำแหน่ง', 'แผนกวิชา', 'คาบ/สัปดาห์', 'ภาระสูงสุด', 'สอนสูงสุด/วัน', 'จำนวนวันที่สอน', 'เวลาว่างคั่น (คาบ)', 'จำนวนวิชา', 'จำนวนกลุ่ม']];
    m.teacherLoad.forEach(function (t) { tl.push([t.teacher.teacher_id, t.teacher.name, t.teacher.position || '', t.teacher.department || '', t.periods, t.max || '', t.maxDay, t.days, t.gaps, t.subjects.length, t.groups.length]); });
    sheets.push({ name: 'ภาระสอนครู', rows: tl, widths: [10, 30, 20, 20, 12, 12, 13, 14, 16, 11, 11] });
    const ru = [['รหัสห้อง', 'ชื่อห้อง', 'ประเภท', 'ความจุ', 'คาบที่ใช้', 'คาบที่ใช้ได้', 'อัตราการใช้ห้อง', 'อัตราการใช้ที่นั่ง']];
    m.roomUse.forEach(function (r) { ru.push([r.room.room_id, r.room.name || '', r.room.type || '', r.room.capacity, r.used, r.avail, +(r.rate * 100).toFixed(1) + '%', +(r.seatRate * 100).toFixed(1) + '%']); });
    sheets.push({ name: 'การใช้ห้อง', rows: ru, widths: [10, 26, 18, 9, 10, 12, 15, 16] });
    const gg = [['รหัสกลุ่ม', 'กลุ่มเรียน', 'คาบ/สัปดาห์', 'วันที่เรียน', 'เวลาว่างคั่นรวม (คาบ)', 'ช่วงว่างยาวสุด (คาบ)']];
    m.groupGaps.forEach(function (g) { gg.push([g.group.group_id, g.group.name, g.periods, g.days, g.total, g.longest]); });
    sheets.push({ name: 'เวลาว่างคั่น', rows: gg, widths: [12, 36, 12, 11, 20, 18] });
    if (run.result.unscheduled.length) {
      const un = [['รหัสกลุ่ม', 'รหัสวิชา', 'ครู', 'จำนวนคาบ', 'สาเหตุ', 'วิธีแก้']];
      run.result.unscheduled.forEach(function (u) { un.push([u.group_id, u.subject_id, u.teacher_ids.join(', '), u.len, u.reason.text, u.reason.fix]); });
      sheets.push({ name: 'ยังจัดไม่ได้', rows: un, widths: [12, 12, 14, 10, 60, 50] });
    }
    return TT.parsers.xlsx.writeXlsx(sheets);
  }

  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function fileBase(run) {
    const d = new Date(run.started_at || Date.now());
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return 'ตารางสอน-' + stamp;
  }

  TT.exporter = { toCsv: toCsv, toJson: toJson, toXlsx: toXlsx, rowsOfPlacements: rowsOfPlacements, download: download, fileBase: fileBase };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
