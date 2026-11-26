/* scheduler-core.js — อัลกอริทึมจัดตารางสอน (ใช้ได้ทั้งใน Web Worker และหน้าเว็บหลัก)
   เงื่อนไขบังคับ (ห้ามละเมิด):
     - ครู 1 คน สอนได้ครั้งละ 1 คาบ (ไม่ซ้อนคาบ)
     - ห้อง 1 ห้อง ใช้ได้ครั้งละ 1 กลุ่ม (ไม่ซ้อนห้อง)
     - กลุ่มเรียน 1 กลุ่ม เรียนได้ครั้งละ 1 วิชา (ช่วงเวลาไม่ตรงกัน)
     - ไม่วางในเวลาไม่ว่างของครู ช่วงกิจกรรม และไม่คร่อมช่วงพัก
     - ห้องต้องตรงประเภทวิชาและจุผู้เรียนได้
   เงื่อนไขเสริม (พยายามให้ดี): ลดเวลาว่างคั่นระหว่างวิชา, กระจายวิชาเดียวกันไม่ให้อยู่วันเดียวกัน,
     ไม่ให้ครูสอนเกินวันละ 6 คาบ, ใช้ห้องขนาดพอดี และใช้ห้องเดิมตลอดวิชา
   วิธีการ: วางแบบโลภเรียงจากคาบที่ยากที่สุด → ซ่อมด้วย Iterative Forward Search (ถอนคาบที่ชนออกแล้ววางใหม่)
     → ปรับปรุงคุณภาพด้วย Hill Climbing ทำหลายรอบด้วย seed ต่างกันแล้วเลือกผลที่ดีที่สุด */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  function prepare(ds, settings) {
    const tm = TT.timeModel(settings);
    const D = tm.D, P = tm.P, N = D * P;
    const tMap = {}, rMap = {}, gMap = {}, sMap = {};
    ds.teachers.forEach(function (t, i) { tMap[t.teacher_id] = i; });
    ds.rooms.forEach(function (r, i) { rMap[r.room_id] = i; });
    ds.groups.forEach(function (g, i) { gMap[g.group_id] = i; });
    ds.subjects.forEach(function (s, i) { sMap[s.subject_id] = i; });
    const tUnavail = ds.teachers.map(function (t) { return tm.unavailMask(t.unavailable).mask; });

    const sessions = [];
    const assignSessions = [];
    ds.assignments.forEach(function (a, ai) {
      const blocks = a.blocks && a.blocks.length ? a.blocks : TT.autoSplit(a.periods || 0, Math.min(settings.maxBlock || 4, tm.maxRun || 1));
      const tIdx = (a.teacher_id || []).map(function (id) { return tMap[id]; }).filter(function (x) { return x != null; });
      const g = gMap[a.group_id];
      const students = g != null ? (ds.groups[g].students || 0) : 0;
      const rooms = (a.rooms || []).map(function (id) { return rMap[id]; }).filter(function (x) { return x != null; })
        .sort(function (x, y) { return (ds.rooms[x].capacity || 0) - (ds.rooms[y].capacity || 0); });
      const list = [];
      blocks.forEach(function (len, k) {
        if (!len) return;
        const s = { id: sessions.length, ai: ai, k: k, len: len, t: tIdx, g: g, rooms: rooms, students: students, starts: [] };
        for (let di = 0; di < D; di++) {
          for (let p = 1; p + len - 1 <= P; p++) {
            let ok = true;
            for (let q = p; q < p + len; q++) {
              const slot = di * P + q - 1;
              if (tm.blocked[slot]) { ok = false; break; }
              if (q > p && tm.segOf[q] !== tm.segOf[q - 1]) { ok = false; break; }
              for (let x = 0; x < tIdx.length; x++) if (tUnavail[tIdx[x]][slot]) { ok = false; break; }
              if (!ok) break;
            }
            if (ok) s.starts.push(di * P + p - 1);
          }
        }
        sessions.push(s); list.push(s.id);
      });
      assignSessions.push(list);
    });
    return { ds: ds, settings: settings, tm: tm, D: D, P: P, N: N, sessions: sessions, assignSessions: assignSessions, tUnavail: tUnavail, tMap: tMap, rMap: rMap, gMap: gMap, sMap: sMap };
  }

  function createState(prob) {
    const T = prob.ds.teachers.length, R = prob.ds.rooms.length, G = prob.ds.groups.length, A = prob.ds.assignments.length;
    const S = prob.sessions.length, N = prob.N, D = prob.D;
    return {
      tOcc: new Int32Array(T * N).fill(-1),
      rOcc: new Int32Array(R * N).fill(-1),
      gOcc: new Int32Array(Math.max(1, G) * N).fill(-1),
      tMask: new Int32Array(T * D), gMask: new Int32Array(Math.max(1, G) * D),
      aDay: new Int8Array(A * D), aRoom: new Int32Array(A * Math.max(1, prob.ds.rooms.length)),
      start: new Int32Array(S).fill(-1), room: new Int32Array(S).fill(-1)
    };
  }

  function makeEngine(prob, seed) {
    const P = prob.P, N = prob.N, D = prob.D;
    const sessions = prob.sessions;
    const R = prob.ds.rooms.length;
    const st = createState(prob);
    const rnd = U.rng(seed);
    const blockedMask = prob.tm.blockedMask;
    const oneDay = prob.settings.oneSessionPerDay !== false;
    const roomCap = prob.ds.rooms.map(function (r) { return r.capacity || 1; });

    function gaps(mask, di) {
      if (!mask) return 0;
      const hi = 31 - Math.clz32(mask);
      const low = mask & -mask;
      const span = ((hi >= 30 ? 0x7fffffff : (1 << (hi + 1)) - 1)) & ~(low - 1);
      return U.popcount(span & ~mask & ~blockedMask[di]);
    }

    function isFree(s, start, room) {
      for (let k = 0; k < s.len; k++) {
        const slot = start + k;
        if (s.g != null && st.gOcc[s.g * N + slot] !== -1) return false;
        if (st.rOcc[room * N + slot] !== -1) return false;
        for (let x = 0; x < s.t.length; x++) if (st.tOcc[s.t[x] * N + slot] !== -1) return false;
      }
      return true;
    }

    function conflicts(s, start, room) {
      const out = [];
      function addc(v) { if (v !== -1 && v !== s.id && out.indexOf(v) < 0) out.push(v); }
      for (let k = 0; k < s.len; k++) {
        const slot = start + k;
        if (s.g != null) addc(st.gOcc[s.g * N + slot]);
        addc(st.rOcc[room * N + slot]);
        for (let x = 0; x < s.t.length; x++) addc(st.tOcc[s.t[x] * N + slot]);
      }
      return out;
    }

    function place(s, start, room) {
      const di = (start / P) | 0, p0 = start % P;
      const m = ((1 << s.len) - 1) << p0;
      for (let k = 0; k < s.len; k++) {
        const slot = start + k;
        if (s.g != null) st.gOcc[s.g * N + slot] = s.id;
        st.rOcc[room * N + slot] = s.id;
        for (let x = 0; x < s.t.length; x++) st.tOcc[s.t[x] * N + slot] = s.id;
      }
      if (s.g != null) st.gMask[s.g * D + di] |= m;
      for (let x = 0; x < s.t.length; x++) st.tMask[s.t[x] * D + di] |= m;
      st.aDay[s.ai * D + di]++;
      st.aRoom[s.ai * R + room]++;
      st.start[s.id] = start; st.room[s.id] = room;
    }

    function unplace(s) {
      const start = st.start[s.id], room = st.room[s.id];
      if (start < 0) return;
      const di = (start / P) | 0, p0 = start % P;
      const m = ((1 << s.len) - 1) << p0;
      for (let k = 0; k < s.len; k++) {
        const slot = start + k;
        if (s.g != null) st.gOcc[s.g * N + slot] = -1;
        st.rOcc[room * N + slot] = -1;
        for (let x = 0; x < s.t.length; x++) st.tOcc[s.t[x] * N + slot] = -1;
      }
      if (s.g != null) st.gMask[s.g * D + di] &= ~m;
      for (let x = 0; x < s.t.length; x++) st.tMask[s.t[x] * D + di] &= ~m;
      st.aDay[s.ai * D + di]--;
      st.aRoom[s.ai * R + room]--;
      st.start[s.id] = -1; st.room[s.id] = -1;
    }

    /* ต้นทุนเงื่อนไขเสริมของการวาง s ที่ (start, room) — คิดตอนที่ s ยังไม่ถูกวาง */
    function cost(s, start, room) {
      const di = (start / P) | 0, p0 = start % P;
      const m = ((1 << s.len) - 1) << p0;
      let c = 0;
      if (s.g != null) {
        const gm = st.gMask[s.g * D + di];
        c += 4 * (gaps(gm | m, di) - gaps(gm, di));
        c += 0.35 * U.popcount(gm);
      }
      for (let x = 0; x < s.t.length; x++) {
        const tmk = st.tMask[s.t[x] * D + di];
        c += 1.5 * (gaps(tmk | m, di) - gaps(tmk, di));
        const before = U.popcount(tmk), after = before + s.len;
        c += 3 * (Math.max(0, after - 6) - Math.max(0, before - 6));
      }
      if (oneDay && st.aDay[s.ai * D + di] > 0) c += 60;
      c += 0.08 * (p0 + s.len);
      c += 0.6 * (roomCap[room] - s.students) / roomCap[room];
      const sameAssign = prob.assignSessions[s.ai].length;
      if (sameAssign > 1) {
        let placedOther = 0;
        for (let i = 0; i < prob.assignSessions[s.ai].length; i++) { const o = prob.assignSessions[s.ai][i]; if (o !== s.id && st.start[o] >= 0) placedOther++; }
        if (placedOther && st.aRoom[s.ai * R + room] === 0) c += 1.5;
      }
      return c;
    }

    function bestFree(s, noise) {
      let best = null, bestC = Infinity;
      for (let i = 0; i < s.starts.length; i++) {
        const start = s.starts[i];
        for (let j = 0; j < s.rooms.length; j++) {
          const room = s.rooms[j];
          if (!isFree(s, start, room)) continue;
          const c = cost(s, start, room) + (noise ? rnd() * noise : 0);
          if (c < bestC) { bestC = c; best = { start: start, room: room, c: c }; }
        }
      }
      return best;
    }

    function totalCost() {
      let c = 0, gapG = 0, gapT = 0, dupDay = 0;
      const G = prob.ds.groups.length, T = prob.ds.teachers.length, A = prob.ds.assignments.length;
      for (let g = 0; g < G; g++) for (let di = 0; di < D; di++) gapG += gaps(st.gMask[g * D + di], di);
      for (let t = 0; t < T; t++) for (let di = 0; di < D; di++) {
        gapT += gaps(st.tMask[t * D + di], di);
        const l = U.popcount(st.tMask[t * D + di]);
        if (l > 6) c += 3 * (l - 6);
      }
      for (let a = 0; a < A; a++) for (let di = 0; di < D; di++) if (st.aDay[a * D + di] > 1) dupDay += st.aDay[a * D + di] - 1;
      c += gapG * 4 + gapT * 1.5 + (oneDay ? dupDay * 60 : 0);
      return { cost: c, gapG: gapG, gapT: gapT, dupDay: dupDay };
    }

    return { st: st, rnd: rnd, isFree: isFree, conflicts: conflicts, place: place, unplace: unplace, cost: cost, bestFree: bestFree, totalCost: totalCost, gaps: gaps };
  }

  /* อธิบายสาเหตุที่วางคาบไม่ได้ */
  function diagnose(prob, eng, s) {
    const ds = prob.ds;
    const a = ds.assignments[s.ai];
    const tNames = s.t.map(function (t) { return ds.teachers[t].teacher_id; }).join(', ');
    if (!s.rooms.length) return { code: 'NO_ROOM', text: 'ไม่มีห้องที่ตรงประเภทและจุผู้เรียนได้', fix: 'เพิ่มห้องที่เหมาะสม หรือแก้ประเภทห้องของวิชา' };
    if (!s.starts.length) return { code: 'NO_TIME', text: 'ไม่มีช่วงเวลาต่อเนื่อง ' + s.len + ' คาบที่ครู ' + tNames + ' ว่าง', fix: 'ลดช่วงเวลาไม่ว่างของครู แบ่งคาบให้สั้นลง หรือลดช่วงกิจกรรม' };
    let tB = 0, gB = 0, rB = 0, total = 0;
    const N = prob.N;
    for (const start of s.starts) {
      total++;
      let tBusy = false, gBusy = false, rAll = true;
      for (let k = 0; k < s.len; k++) {
        const slot = start + k;
        if (s.g != null && eng.st.gOcc[s.g * N + slot] !== -1) gBusy = true;
        for (const t of s.t) if (eng.st.tOcc[t * N + slot] !== -1) tBusy = true;
      }
      for (const r of s.rooms) {
        let free = true;
        for (let k = 0; k < s.len; k++) if (eng.st.rOcc[r * N + start + k] !== -1) { free = false; break; }
        if (free) { rAll = false; break; }
      }
      if (tBusy) tB++; if (gBusy) gB++; if (rAll) rB++;
    }
    const parts = [];
    if (gB) parts.push('กลุ่ม ' + a.group_id + ' มีเรียนวิชาอื่น ' + gB + ' ช่วง');
    if (tB) parts.push('ครู ' + tNames + ' สอนกลุ่มอื่น ' + tB + ' ช่วง');
    if (rB) parts.push('ห้องที่ใช้ได้ (' + s.rooms.length + ' ห้อง) เต็ม ' + rB + ' ช่วง');
    return {
      code: 'CONFLICT',
      text: 'ช่วงเวลาที่เป็นไปได้ทั้ง ' + total + ' ช่วงถูกใช้หมด: ' + (parts.join(', ') || 'ทรัพยากรไม่พอ'),
      fix: rB >= Math.max(tB, gB) ? 'เพิ่มห้องประเภทนี้ หรือกำหนดห้องอื่นให้วิชา' : tB >= gB ? 'ให้ครูท่านอื่นช่วยสอนบางกลุ่ม หรือลดเวลาไม่ว่างของครู' : 'ลดจำนวนคาบของกลุ่มนี้ หรือเพิ่มคาบต่อวัน'
    };
  }

  /* ตัวจัดตารางแบบ generator — yield ความคืบหน้าเป็นระยะ เพื่อให้ยกเลิกได้และแสดงสถานะได้ */
  function* solve(prob, opts) {
    opts = opts || {};
    const settings = prob.settings;
    const attempts = Math.max(1, Math.min(200, settings.attempts || 20));
    const timeLimit = Math.max(2, settings.timeLimitSec || 30) * 1000;
    const baseSeed = (settings.seed | 0) || 12345;
    const sessions = prob.sessions;
    const S = sessions.length;
    const t0 = now();
    let best = null;
    const schedulable = sessions.filter(function (s) { return s.starts.length && s.rooms.length; });
    const totalPeriods = sessions.reduce(function (x, s) { return x + s.len; }, 0);
    let lastYield = now();

    function progress(o) {
      return Object.assign({ type: 'progress', attempts: attempts, total: S, totalPeriods: totalPeriods, elapsed: Math.round(now() - t0), bestUnplaced: best ? best.unplacedPeriods : null }, o);
    }

    yield progress({ phase: 'prepare', label: 'เตรียมข้อมูล ' + S + ' ช่วงสอน (' + totalPeriods + ' คาบ)', attempt: 0, pct: 0.01, placed: 0 });

    for (let att = 0; att < attempts; att++) {
      const attStart = now();
      const remaining = timeLimit - (attStart - t0);
      if (att > 0 && remaining < 500) break;
      const budget = remaining / (attempts - att);
      const eng = makeEngine(prob, baseSeed + att * 7919);
      const order = schedulable.map(function (s) {
        return { s: s, key: s.starts.length * s.rooms.length / (s.len * (1 + s.t.length * 0.5)) + eng.rnd() * 0.5 };
      }).sort(function (x, y) { return x.key - y.key; }).map(function (o) { return o.s; });
      const removed = new Int32Array(S);
      const displacer = new Int32Array(S).fill(-1);
      let pending = [];
      let placedCount = 0;
      const pctOf = function (frac) { return Math.min(0.99, (att + frac) / attempts); };

      // ขั้นที่ 1: วางแบบโลภ
      for (let i = 0; i < order.length; i++) {
        const s = order[i];
        const b = eng.bestFree(s, 0.3);
        if (b) { eng.place(s, b.start, b.room); placedCount++; } else pending.push(s);
        if (now() - lastYield > 40) {
          lastYield = now();
          yield progress({ phase: 'greedy', label: 'รอบที่ ' + (att + 1) + ': วางคาบเรียน', attempt: att + 1, placed: placedCount, pending: pending.length, pct: pctOf(0.4 * i / order.length) });
        }
      }

      // ขั้นที่ 2: ซ่อมคาบที่ยังวางไม่ได้
      let iter = 0;
      const maxIter = 60 * S + 2000;
      let bestPending = pending.length, bestSnapshot = null;
      function snapshot() { return { start: Int32Array.from(eng.st.start), room: Int32Array.from(eng.st.room) }; }
      if (pending.length) bestSnapshot = snapshot();
      while (pending.length && iter < maxIter && now() - attStart < budget * 0.8) {
        iter++;
        let idx = 0;
        if (eng.rnd() < 0.6) {
          let bestK = -Infinity;
          for (let i = 0; i < pending.length; i++) {
            const k = removed[pending[i].id] * 2 - pending[i].starts.length * pending[i].rooms.length * 0.01 + eng.rnd();
            if (k > bestK) { bestK = k; idx = i; }
          }
        } else idx = Math.floor(eng.rnd() * pending.length);
        const s = pending[idx];
        pending[idx] = pending[pending.length - 1]; pending.pop();
        const free = eng.bestFree(s, 0.3);
        if (free) { eng.place(s, free.start, free.room); }
        else {
          let bestC = null, bestScore = Infinity;
          for (let i = 0; i < s.starts.length; i++) {
            const start = s.starts[i];
            for (let j = 0; j < s.rooms.length; j++) {
              const room = s.rooms[j];
              const cs = eng.conflicts(s, start, room);
              if (cs.indexOf(displacer[s.id]) >= 0 && eng.rnd() < 0.9) continue;
              let sc = 0;
              for (let q = 0; q < cs.length; q++) sc += 10 + sessions[cs[q]].len * 3 + removed[cs[q]] * 4;
              sc += eng.cost(s, start, room) * 0.2 + eng.rnd() * 6;
              if (sc < bestScore) { bestScore = sc; bestC = { start: start, room: room, cs: cs }; }
            }
          }
          if (!bestC) { pending.push(s); continue; }
          for (let q = 0; q < bestC.cs.length; q++) {
            const o = sessions[bestC.cs[q]];
            eng.unplace(o);
            removed[o.id]++;
            displacer[o.id] = s.id;
            pending.push(o);
          }
          eng.place(s, bestC.start, bestC.room);
        }
        if (pending.length < bestPending) { bestPending = pending.length; bestSnapshot = pending.length ? snapshot() : null; }
        if (now() - lastYield > 40) {
          lastYield = now();
          yield progress({ phase: 'repair', label: 'รอบที่ ' + (att + 1) + ': แก้คาบที่ชนกัน (เหลือ ' + pending.length + ' ช่วง)', attempt: att + 1, placed: S - pending.length - (S - schedulable.length), pending: pending.length, iter: iter, pct: pctOf(0.4 + 0.3 * Math.min(1, (now() - attStart) / (budget * 0.8))) });
        }
      }
      // ถ้ายังไม่ครบ ย้อนกลับไปสถานะที่ดีที่สุดที่เคยได้
      if (pending.length && bestSnapshot && bestPending < pending.length) {
        for (const s of sessions) eng.unplace(s);
        for (const s of sessions) if (bestSnapshot.start[s.id] >= 0) eng.place(s, bestSnapshot.start[s.id], bestSnapshot.room[s.id]);
      }

      // ขั้นที่ 3: ปรับปรุงคุณภาพ (ลดเวลาว่างคั่น ฯลฯ) โดยย้ายเฉพาะไปช่องที่ว่างจริง
      const placedList = sessions.filter(function (s) { return eng.st.start[s.id] >= 0; });
      const hcEnd = attStart + budget;
      let moves = 0; const hcIter = Math.min(40 * placedList.length, 60000);
      for (let k = 0; k < hcIter && placedList.length; k++) {
        if ((k & 63) === 0 && now() > hcEnd) break;
        const s = placedList[Math.floor(eng.rnd() * placedList.length)];
        const os = eng.st.start[s.id], or = eng.st.room[s.id];
        eng.unplace(s);
        const oc = eng.cost(s, os, or);
        const b = eng.bestFree(s, 0);
        if (b && b.c < oc - 1e-6) { eng.place(s, b.start, b.room); moves++; }
        else eng.place(s, os, or);
        if (now() - lastYield > 40) {
          lastYield = now();
          yield progress({ phase: 'improve', label: 'รอบที่ ' + (att + 1) + ': ปรับปรุงคุณภาพตาราง', attempt: att + 1, placed: placedList.length, pct: pctOf(0.7 + 0.3 * k / hcIter) });
        }
      }

      const tc = eng.totalCost();
      let unplacedPeriods = 0, unplacedCount = 0;
      for (const s of sessions) if (eng.st.start[s.id] < 0) { unplacedPeriods += s.len; unplacedCount++; }
      const cand = { att: att + 1, seed: baseSeed + att * 7919, eng: eng, unplacedPeriods: unplacedPeriods, unplacedCount: unplacedCount, cost: tc, moves: moves, ms: Math.round(now() - attStart) };
      if (!best || unplacedPeriods < best.unplacedPeriods || (unplacedPeriods === best.unplacedPeriods && tc.cost < best.cost.cost)) best = cand;
      // หยุดก่อนได้ถ้าวางครบและไม่มีเวลาว่างคั่น/วิชาซ้ำวัน (ดีที่สุดแล้ว)
      const perfect = best.unplacedPeriods === 0 && best.cost.gapG === 0 && best.cost.dupDay === 0 && best.cost.gapT === 0;
      yield progress({ phase: 'attempt-done', label: 'รอบที่ ' + (att + 1) + ' เสร็จ: ' + (unplacedCount ? 'วางไม่ได้ ' + unplacedCount + ' ช่วง' : 'วางครบทุกคาบ') + ' ค่าปรับคุณภาพ ' + tc.cost.toFixed(1) + ' (ยิ่งน้อยยิ่งดี)', attempt: att + 1, placed: S - unplacedCount, pct: pctOf(1), bestCost: best.cost.cost });
      if (perfect) { yield progress({ phase: 'early-stop', label: 'ได้ตารางที่ไม่มีเวลาว่างคั่นและไม่มีวิชาซ้ำวันแล้ว หยุดค้นหา', attempt: att + 1, pct: 0.99 }); break; }
    }

    yield progress({ phase: 'verify', label: 'ตรวจสอบผลลัพธ์', attempt: attempts, pct: 0.995, placed: S - best.unplacedCount });
    return buildResult(prob, best, now() - t0);
  }

  function buildResult(prob, best, ms) {
    const ds = prob.ds, eng = best.eng, P = prob.P, tm = prob.tm;
    const placements = [], unscheduled = [];
    for (const s of prob.sessions) {
      const a = ds.assignments[s.ai];
      const base = {
        sid: s.id, assignment_id: a.assignment_id, subject_id: a.subject_id, group_id: a.group_id,
        teacher_ids: s.t.map(function (t) { return ds.teachers[t].teacher_id; }), len: s.len, part: s.k + 1, parts: prob.assignSessions[s.ai].length
      };
      const start = eng.st.start[s.id];
      if (start >= 0) {
        const di = (start / P) | 0;
        placements.push(Object.assign(base, { day: tm.days[di], di: di, period: (start % P) + 1, room_id: ds.rooms[eng.st.room[s.id]].room_id }));
      } else {
        unscheduled.push(Object.assign(base, { reason: diagnose(prob, eng, s) }));
      }
    }
    placements.sort(function (x, y) { return x.di - y.di || x.period - y.period || String(x.group_id).localeCompare(String(y.group_id)); });
    return {
      type: 'done',
      placements: placements,
      unscheduled: unscheduled,
      solver: { attempt: best.att, seed: best.seed, cost: best.cost, moves: best.moves, ms: Math.round(ms), sessions: prob.sessions.length }
    };
  }

  /* ขับ generator ทีละช่วงเวลาสั้น ๆ เพื่อไม่ให้หน้าเว็บค้าง และยกเลิกได้ */
  function runChunked(gen, onProgress, isCancelled, sliceMs) {
    return new Promise(function (resolve, reject) {
      function step() {
        if (isCancelled && isCancelled()) { resolve({ type: 'cancelled' }); return; }
        const until = now() + (sliceMs || 30);
        try {
          while (true) {
            const r = gen.next();
            if (r.done) { resolve(r.value); return; }
            if (onProgress) onProgress(r.value);
            if (now() >= until) break;
          }
        } catch (e) { reject(e); return; }
        setTimeout(step, 0);
      }
      step();
    });
  }

  TT.scheduler = { prepare: prepare, solve: solve, runChunked: runChunked, makeEngine: makeEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
