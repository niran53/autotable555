/* scheduler-runner.js — เริ่ม/ยกเลิกการจัดตาราง ใช้ Web Worker เป็นหลัก
   ถ้าเปิดไฟล์แบบ file:// หรือเบราว์เซอร์ไม่อนุญาต Worker จะสลับไปคำนวณในหน้าเว็บแบบแบ่งช่วงอัตโนมัติ */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});

  function start(dataset, settings, hooks) {
    let finished = false, worker = null, cancelled = false;
    const t0 = Date.now();
    function finish(kind, payload) {
      if (finished) return;
      finished = true;
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      if (kind === 'done') hooks.onDone && hooks.onDone(payload);
      else if (kind === 'cancelled') hooks.onCancel && hooks.onCancel({ elapsed: Date.now() - t0 });
      else hooks.onError && hooks.onError(payload);
    }
    function runInline(note) {
      if (hooks.onMode) hooks.onMode('inline', note);
      let prob;
      try { prob = TT.scheduler.prepare(dataset, settings); }
      catch (e) { finish('error', { message: e.message, stack: e.stack }); return; }
      const gen = TT.scheduler.solve(prob);
      let last = 0;
      TT.scheduler.runChunked(gen, function (p) {
        const t = Date.now();
        if (t - last > 60 || p.phase === 'attempt-done') { last = t; hooks.onProgress && hooks.onProgress(p); }
      }, function () { return cancelled; }, 25).then(function (res) {
        if (res.type === 'cancelled') finish('cancelled');
        else finish('done', res);
      }, function (e) { finish('error', { message: e.message, stack: e.stack }); });
    }

    let usedWorker = false;
    try {
      if (typeof Worker !== 'undefined' && location.protocol !== 'file:') {
        worker = new Worker('js/scheduler.worker.js');
        usedWorker = true;
      }
    } catch (e) { worker = null; }

    if (worker) {
      if (hooks.onMode) hooks.onMode('worker');
      let gotMessage = false;
      worker.onmessage = function (ev) {
        gotMessage = true;
        const m = ev.data;
        if (!m) return;
        if (m.type === 'progress') hooks.onProgress && hooks.onProgress(m);
        else if (m.type === 'done') finish('done', m);
        else if (m.type === 'cancelled') finish('cancelled');
        else if (m.type === 'error') finish('error', m);
      };
      worker.onerror = function (ev) {
        ev.preventDefault && ev.preventDefault();
        if (!gotMessage && !finished && !cancelled) {
          // โหลด Worker ไม่สำเร็จ → คำนวณในหน้าเว็บแทน
          try { worker.terminate(); } catch (e) { /* ignore */ }
          worker = null;
          runInline('worker-failed');
        } else finish('error', { message: ev.message || 'เกิดข้อผิดพลาดในตัวคำนวณ' });
      };
      // ส่งข้อมูลแบบ JSON ล้วน
      worker.postMessage({ type: 'start', dataset: JSON.parse(JSON.stringify(dataset)), settings: JSON.parse(JSON.stringify(settings)) });
    } else {
      setTimeout(function () { runInline(usedWorker ? 'worker-failed' : 'no-worker'); }, 0);
    }

    return {
      cancel: function () {
        if (finished) return;
        cancelled = true;
        if (worker) {
          // ขอให้หยุดอย่างนุ่มนวลก่อน ถ้าไม่ตอบภายใน 300 มิลลิวินาทีจึงบังคับหยุด
          try { worker.postMessage({ type: 'cancel' }); } catch (e) { /* ignore */ }
          setTimeout(function () { finish('cancelled'); }, 300);
        }
      },
      get finished() { return finished; }
    };
  }

  TT.runner = { start: start };
})(typeof self !== 'undefined' ? self : globalThis);
