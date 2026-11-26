/* metrics.js — ตรวจผลตารางจริงแบบอิสระจากตัวจัดตาราง (นับซ้ำจากรายการคาบทั้งหมด)
   และคำนวณตัวชี้วัด: จำนวนคาบ, คาบชน, อัตราการใช้ห้อง, เวลาว่างคั่นระหว่างวิชา, ภาระสอนรายครู */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  function analyze(ds, settings, placements, unscheduled) {
    const tm = TT.timeModel(settings);
    const P = tm.P, D = tm.D;
    const byId = function (arr, key) { const m = {}; arr.forEach(function (x) { m[x[key]] = x; }); return m; };
    const T = byId(ds.teachers, 'teacher_id'), R = byId(ds.rooms, 'room_id'), G = byId(ds.groups, 'group_id'), Sj = byId(ds.subjects, 'subject_id');
    const A = byId(ds.assignments, 'assignment_id');

    /* ---------- ตรวจข้อขัดแย้งจากตารางจริง ---------- */
    const occ = { teacher: {}, room: {}, group: {} };
    const violations = [];
    function mark(kind, id, di, p, pl) {
      const k = id + '|' + di + '|' + p;
      (occ[kind][k] = occ[kind][k] || []).push(pl);
    }
    placements.forEach(function (pl) {
      const di = tm.dayPos[pl.day];
      for (let q = pl.period; q < pl.period + pl.len; q++) {
        mark('group', pl.group_id, di, q, pl);
        mark('room', pl.room_id, di, q, pl);
        pl.teacher_ids.forEach(function (t) { mark('teacher', t, di, q, pl); });
        const slot = di * P + q - 1;
        if (di == null || q > P) violations.push({ kind: 'outside', pl: pl, text: 'อยู่นอกช่วงเวลาเรียน' });
        else if (tm.blocked[slot]) violations.push({ kind: 'blocked', pl: pl, text: 'ทับช่วงกิจกรรม ' + tm.slotLabel(di, q) });
        if (q > pl.period && tm.segOf[q] !== tm.segOf[q - 1] && settings.noCrossBreak !== false) violations.push({ kind: 'break', pl: pl, text: 'คร่อมช่วงพัก' });
        pl.teacher_ids.forEach(function (t) {
          const tt = T[t];
          if (tt && tt.unavailable && di != null) {
            const um = tm.unavailMask(tt.unavailable).mask;
            if (um[slot]) violations.push({ kind: 'unavailable', pl: pl, text: 'ครู ' + t + ' ไม่ว่าง ' + tm.slotLabel(di, q) });
          }
        });
      }
      const room = R[pl.room_id], grp = G[pl.group_id], sub = Sj[pl.subject_id], asg = A[pl.assignment_id];
      if (!room) violations.push({ kind: 'room', pl: pl, text: 'ไม่พบห้อง ' + pl.room_id });
      else {
        if (grp && (room.capacity || 0) < (grp.students || 0)) violations.push({ kind: 'capacity', pl: pl, text: 'ห้อง ' + room.room_id + ' จุไม่พอ (' + room.capacity + ' < ' + grp.students + ')' });
        const fixed = asg && asg.room_id;
        if (!fixed && sub && sub.room_type && U.normType(sub.room_type) !== U.normType(room.type)) violations.push({ kind: 'roomtype', pl: pl, text: 'ห้อง ' + room.room_id + ' ไม่ใช่ประเภท ' + sub.room_type });
      }
    });
    function collect(kind) {
      const list = [];
      Object.keys(occ[kind]).forEach(function (k) {
        const arr = occ[kind][k];
        if (arr.length > 1) {
          const parts = k.split('|');
          list.push({ kind: kind, id: parts[0], di: +parts[1], period: +parts[2], items: arr });
        }
      });
      return list;
    }
    const clashes = { teacher: collect('teacher'), room: collect('room'), group: collect('group') };

    /* ---------- จำนวนคาบ ---------- */
    const required = ds.assignments.reduce(function (s, a) { return s + (a.periods || 0); }, 0);
    const scheduled = placements.reduce(function (s, p) { return s + p.len; }, 0);
    const unscheduledPeriods = (unscheduled || []).reduce(function (s, p) { return s + p.len; }, 0);
    const perAssign = {};
    placements.forEach(function (p) { perAssign[p.assignment_id] = (perAssign[p.assignment_id] || 0) + p.len; });
    const shortAssign = ds.assignments.filter(function (a) { return (perAssign[a.assignment_id] || 0) !== (a.periods || 0); })
      .map(function (a) { return { assignment: a, got: perAssign[a.assignment_id] || 0 }; });

    /* ---------- อัตราการใช้ห้อง ---------- */
    const avail = tm.availTotal;
    const roomUse = ds.rooms.map(function (r) {
      const used = placements.filter(function (p) { return p.room_id === r.room_id; }).reduce(function (s, p) { return s + p.len; }, 0);
      const seatUse = placements.filter(function (p) { return p.room_id === r.room_id; }).reduce(function (s, p) { const g = G[p.group_id]; return s + p.len * Math.min(1, (g ? g.students : 0) / (r.capacity || 1)); }, 0);
      return { room: r, used: used, avail: avail, rate: avail ? used / avail : 0, seatRate: used ? seatUse / used : 0 };
    }).sort(function (a, b) { return b.rate - a.rate; });
    const roomTotalUsed = roomUse.reduce(function (s, r) { return s + r.used; }, 0);
    const roomRate = ds.rooms.length && avail ? roomTotalUsed / (ds.rooms.length * avail) : 0;
    const roomsUsed = roomUse.filter(function (r) { return r.used > 0; });
    const roomRateUsed = roomsUsed.length && avail ? roomTotalUsed / (roomsUsed.length * avail) : 0;

    /* ---------- เวลาว่างคั่นระหว่างวิชา ---------- */
    function dayMasks(filterFn) {
      const masks = new Array(D).fill(0);
      placements.forEach(function (p) {
        if (!filterFn(p)) return;
        const di = tm.dayPos[p.day];
        if (di == null) return;
        for (let q = p.period; q < p.period + p.len; q++) masks[di] |= 1 << (q - 1);
      });
      return masks;
    }
    function gapsOf(masks) {
      let total = 0; const perDay = [];
      let longest = 0;
      masks.forEach(function (m, di) {
        let g = 0, run = 0;
        if (m) {
          const lo = 31 - Math.clz32(m & -m), hi = 31 - Math.clz32(m);
          for (let b = lo; b <= hi; b++) {
            const isBlocked = tm.blockedMask[di] & (1 << b);
            if (!(m & (1 << b)) && !isBlocked) { g++; run++; if (run > longest) longest = run; } else run = 0;
          }
        }
        perDay.push(g); total += g;
      });
      return { total: total, perDay: perDay, longest: longest, days: masks.filter(Boolean).length };
    }
    const groupGaps = ds.groups.map(function (g) {
      const masks = dayMasks(function (p) { return p.group_id === g.group_id; });
      const r = gapsOf(masks);
      const periods = placements.filter(function (p) { return p.group_id === g.group_id; }).reduce(function (s, p) { return s + p.len; }, 0);
      return Object.assign({ group: g, periods: periods }, r);
    });
    const totalGroupGaps = groupGaps.reduce(function (s, g) { return s + g.total; }, 0);
    const groupsWithGaps = groupGaps.filter(function (g) { return g.total > 0; }).length;

    /* ---------- ภาระสอนรายครู ---------- */
    const teacherLoad = ds.teachers.map(function (t) {
      const mine = placements.filter(function (p) { return p.teacher_ids.indexOf(t.teacher_id) >= 0; });
      const periods = mine.reduce(function (s, p) { return s + p.len; }, 0);
      const masks = dayMasks(function (p) { return p.teacher_ids.indexOf(t.teacher_id) >= 0; });
      const perDay = masks.map(function (m) { return U.popcount(m); });
      const g = gapsOf(masks);
      const subjects = Array.from(new Set(mine.map(function (p) { return p.subject_id; })));
      const groups = Array.from(new Set(mine.map(function (p) { return p.group_id; })));
      let status = 'ok';
      if (t.max_periods && periods > t.max_periods) status = 'over';
      else if (t.max_periods && periods < t.max_periods * 0.5) status = 'low';
      return { teacher: t, periods: periods, perDay: perDay, maxDay: Math.max.apply(null, perDay.concat([0])), days: g.days, gaps: g.total, subjects: subjects, groups: groups, max: t.max_periods || null, status: status, rate: t.max_periods ? periods / t.max_periods : null };
    }).sort(function (a, b) { return b.periods - a.periods; });
    const loads = teacherLoad.map(function (t) { return t.periods; }).filter(function (x) { return x > 0; });
    const avgLoad = loads.length ? loads.reduce(function (s, x) { return s + x; }, 0) / loads.length : 0;
    const sd = loads.length ? Math.sqrt(loads.reduce(function (s, x) { return s + (x - avgLoad) * (x - avgLoad); }, 0) / loads.length) : 0;

    const conflictTotal = clashes.teacher.length + clashes.room.length + clashes.group.length + violations.length;
    return {
      required: required, scheduled: scheduled, unscheduledPeriods: unscheduledPeriods, completeness: required ? scheduled / required : 1,
      shortAssign: shortAssign, sessions: placements.length,
      clashes: clashes, violations: violations, conflictTotal: conflictTotal,
      roomUse: roomUse, roomRate: roomRate, roomRateUsed: roomRateUsed, roomsUsed: roomsUsed.length, availPerRoom: avail,
      groupGaps: groupGaps, totalGroupGaps: totalGroupGaps, groupsWithGaps: groupsWithGaps,
      avgGapPerGroup: ds.groups.length ? totalGroupGaps / ds.groups.length : 0,
      teacherLoad: teacherLoad, avgLoad: avgLoad, sdLoad: sd,
      overloaded: teacherLoad.filter(function (t) { return t.status === 'over'; }).length,
      maxDayLoad: Math.max.apply(null, teacherLoad.map(function (t) { return t.maxDay; }).concat([0]))
    };
  }

  TT.metrics = { analyze: analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
