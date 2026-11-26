/* timetable-model.js — สร้างโครงตาราง (วัน × คาบ) ตามมุมมอง: กลุ่มเรียน / ครู / ห้อง
   ใช้ร่วมกันโดยหน้า "ตารางผลลัพธ์", หน้าพิมพ์ และการส่งออก Excel */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  function indexes(ds) {
    const idx = { teacher: {}, room: {}, group: {}, subject: {}, assignment: {} };
    ds.teachers.forEach(function (x) { idx.teacher[x.teacher_id] = x; });
    ds.rooms.forEach(function (x) { idx.room[x.room_id] = x; });
    ds.groups.forEach(function (x) { idx.group[x.group_id] = x; });
    ds.subjects.forEach(function (x) { idx.subject[x.subject_id] = x; });
    ds.assignments.forEach(function (x) { idx.assignment[x.assignment_id] = x; });
    return idx;
  }

  const VIEWS = {
    group: { label: 'กลุ่มเรียน', list: 'groups', key: 'group_id', match: function (p, id) { return p.group_id === id; } },
    teacher: { label: 'ครู', list: 'teachers', key: 'teacher_id', match: function (p, id) { return p.teacher_ids.indexOf(id) >= 0; } },
    room: { label: 'ห้อง', list: 'rooms', key: 'room_id', match: function (p, id) { return p.room_id === id; } }
  };

  function entityTitle(kind, e) {
    if (!e) return '';
    if (kind === 'group') return e.name + ' (' + e.group_id + ')';
    if (kind === 'teacher') return e.name + (e.position ? ' — ' + e.position : '');
    return (e.name || e.room_id) + ' (' + e.room_id + ')';
  }

  /* คืน {rows:[{day, di, cells:[{type:'class'|'empty'|'blocked'|'break', pl, span}]}], times, periods} */
  function grid(ds, settings, placements, kind, id) {
    const tm = TT.timeModel(settings);
    const view = VIEWS[kind];
    const mine = placements.filter(function (p) { return view.match(p, id); });
    const rows = tm.days.map(function (day, di) {
      const cells = [];
      const at = {};
      mine.forEach(function (p) { if (p.di === di || (p.di == null && tm.dayPos[p.day] === di)) at[p.period] = (at[p.period] || []).concat([p]); });
      let p = 1;
      while (p <= tm.P) {
        const here = at[p];
        if (here && here.length) {
          const pl = here[0];
          cells.push({ type: 'class', pl: pl, span: pl.len, extra: here.slice(1), period: p });
          p += pl.len;
          continue;
        }
        if (tm.blocked[di * tm.P + p - 1]) {
          let span = 1;
          while (p + span <= tm.P && tm.blocked[di * tm.P + p + span - 1] && !(at[p + span] && at[p + span].length) && tm.segOf[p + span] === tm.segOf[p]) span++;
          cells.push({ type: 'blocked', span: span, period: p });
          p += span; continue;
        }
        cells.push({ type: 'empty', span: 1, period: p });
        p++;
      }
      return { day: day, di: di, cells: cells };
    });
    return { rows: rows, times: tm.times, tm: tm, count: mine.reduce(function (s, x) { return s + x.len; }, 0), items: mine };
  }

  /* ลำดับคอลัมน์รวมช่วงพัก: [{kind:'period', p} | {kind:'break', label}] */
  function columns(settings) {
    const tm = TT.timeModel(settings);
    const cols = [];
    for (let p = 1; p <= tm.P; p++) {
      cols.push({ kind: 'period', p: p, time: tm.times[p - 1] });
      const b = (settings.breaks || []).find(function (x) { return x.after === p && p < tm.P; });
      if (b) cols.push({ kind: 'break', label: b.label || 'พัก', minutes: b.minutes });
    }
    return cols;
  }

  function placementText(idx, p) {
    const s = idx.subject[p.subject_id] || {};
    const g = idx.group[p.group_id] || {};
    const r = idx.room[p.room_id] || {};
    const ts = p.teacher_ids.map(function (t) { return idx.teacher[t] ? idx.teacher[t].name : t; });
    return { code: p.subject_id, name: s.name || p.subject_id, group: g.name || p.group_id, groupId: p.group_id, room: p.room_id, roomName: r.name || p.room_id, teachers: ts, teacherIds: p.teacher_ids };
  }

  function timeRange(settings, p) {
    const times = U.periodTimes(settings);
    const a = times[p.period - 1], b = times[p.period + p.len - 2];
    return a && b ? U.fmtTime(a.start) + '–' + U.fmtTime(b.end) : '';
  }

  TT.model = { indexes: indexes, grid: grid, columns: columns, VIEWS: VIEWS, entityTitle: entityTitle, placementText: placementText, timeRange: timeRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
