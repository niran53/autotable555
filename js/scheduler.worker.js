/* scheduler.worker.js — รันการจัดตารางในเธรดแยก หน้าเว็บจึงไม่ค้างระหว่างคำนวณ */
/* global importScripts, self */
importScripts('utils.js', 'schema.js', 'timemodel.js', 'scheduler-core.js');

let cancelled = false;

self.onmessage = function (ev) {
  const msg = ev.data || {};
  if (msg.type === 'cancel') { cancelled = true; return; }
  if (msg.type !== 'start') return;
  cancelled = false;
  let lastPost = 0;
  try {
    const prob = self.TT.scheduler.prepare(msg.dataset, msg.settings);
    const gen = self.TT.scheduler.solve(prob);
    self.TT.scheduler.runChunked(gen, function (p) {
      const t = Date.now();
      if (t - lastPost > 60 || p.phase === 'attempt-done' || p.phase === 'prepare') {
        lastPost = t;
        self.postMessage(p);
      }
    }, function () { return cancelled; }, 40).then(function (res) {
      self.postMessage(res);
    }, function (err) {
      self.postMessage({ type: 'error', message: String(err && err.message || err), stack: String(err && err.stack || '') });
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err), stack: String(err && err.stack || '') });
  }
};
