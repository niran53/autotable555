/* timemodel.js — แปลงการตั้งค่าเวลาเรียนเป็นโครงสร้างช่องเวลา (slot) ที่ทั้งตัวตรวจข้อมูลและตัวจัดตารางใช้ร่วมกัน
   slot = ลำดับวัน (di) * จำนวนคาบต่อวัน (P) + (คาบ - 1) */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  function timeModel(settings) {
    const days = (settings.days || [0, 1, 2, 3, 4]).slice().sort(function (a, b) { return a - b; });
    const D = days.length;
    const P = Math.max(1, Math.min(16, settings.periodsPerDay | 0));
    const dayPos = {};
    days.forEach(function (d, i) { dayPos[d] = i; });

    // ช่วงคาบที่ต่อเนื่องกัน (แบ่งด้วยช่วงพัก)
    const breakAfter = {};
    (settings.breaks || []).forEach(function (b) { if (b && b.after >= 1 && b.after < P) breakAfter[b.after] = b; });
    const segOf = new Int8Array(P + 1);
    const segments = [];
    let seg = [];
    for (let p = 1; p <= P; p++) {
      seg.push(p);
      segOf[p] = segments.length;
      if (settings.noCrossBreak !== false && breakAfter[p]) { segments.push(seg); seg = []; }
    }
    if (seg.length) segments.push(seg);

    const blocked = new Uint8Array(D * P);
    const blockedParse = U.parseSlotSpec(settings.blocked || '', P);
    blockedParse.items.forEach(function (it) {
      const di = dayPos[it.day];
      if (di == null) return;
      for (let p = it.from; p <= Math.min(it.to, P); p++) blocked[di * P + p - 1] = 1;
    });
    const blockedMask = new Array(D).fill(0);
    let availTotal = 0;
    for (let di = 0; di < D; di++) {
      for (let p = 1; p <= P; p++) {
        if (blocked[di * P + p - 1]) blockedMask[di] |= 1 << (p - 1);
        else availTotal++;
      }
    }

    /* ความยาวคาบต่อเนื่องสูงสุดที่วางได้จริง (ไม่ติดช่วงพัก/กิจกรรม) */
    let maxRun = 0;
    for (let di = 0; di < D; di++) {
      let run = 0;
      for (let p = 1; p <= P; p++) {
        const s = di * P + p - 1;
        const cont = p > 1 && segOf[p] === segOf[p - 1];
        if (blocked[s]) run = 0; else run = cont ? run + 1 : 1;
        if (run > maxRun) maxRun = run;
      }
    }

    function unavailMask(spec) {
      const arr = new Uint8Array(D * P);
      const r = U.parseSlotSpec(spec || '', P);
      r.items.forEach(function (it) {
        const di = dayPos[it.day];
        if (di == null) return;
        for (let p = it.from; p <= Math.min(it.to, P); p++) arr[di * P + p - 1] = 1;
      });
      return { mask: arr, ok: r.ok, bad: r.bad };
    }

    function slotLabel(di, p) { return U.DAY_SHORT[days[di]] + ' คาบ ' + p; }

    return {
      days: days, D: D, P: P, dayPos: dayPos, segments: segments, segOf: segOf,
      blocked: blocked, blockedMask: blockedMask, blockedBad: blockedParse.bad,
      availTotal: availTotal, maxRun: maxRun,
      times: U.periodTimes({ startTime: settings.startTime, periodMinutes: settings.periodMinutes, breaks: settings.breaks, periodsPerDay: P }),
      breakAfter: breakAfter, unavailMask: unavailMask, slotLabel: slotLabel
    };
  }

  /* แบ่งจำนวนคาบเป็นช่วงต่อเนื่อง เช่น 5 คาบ, ยาวสุด 4 → [3, 2] */
  function autoSplit(periods, maxBlock) {
    const mb = Math.max(1, maxBlock | 0);
    const n = Math.ceil(periods / mb);
    const base = Math.floor(periods / n), extra = periods % n;
    const out = [];
    for (let i = 0; i < n; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }

  TT.timeModel = timeModel;
  TT.autoSplit = autoSplit;
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
