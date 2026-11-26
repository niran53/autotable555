/* app.js — สถานะกลางของแอป การเปลี่ยนหน้า (ตาม #hash) และการกู้คืนงานล่าสุดเมื่อเปิดหน้าใหม่ */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui;
  const LS_SETTINGS = 'tt.settings';
  const LS_CURRENT = 'tt.current';

  function loadSettings() {
    const def = TT.schema.defaultSettings();
    try {
      const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
      if (s && typeof s === 'object') return Object.assign(def, s);
    } catch (e) { /* ignore */ }
    return def;
  }

  const App = {
    state: {
      settings: loadSettings(),
      importer: null,
      validation: null,
      validationKey: null,
      dataset: null,
      run: null,
      running: false
    },
    views: TT.views || {},
    current: null,

    saveSettings: function () {
      try { localStorage.setItem(LS_SETTINGS, JSON.stringify(App.state.settings)); } catch (e) { /* ignore */ }
      ui.$('#brandSub').textContent = App.state.settings.schoolName || '';
    },

    rememberCurrent: function () {
      try {
        localStorage.setItem(LS_CURRENT, JSON.stringify({
          datasetId: App.state.dataset ? App.state.dataset.id : null,
          runId: App.state.run && App.state.run.status === 'completed' ? App.state.run.id : null
        }));
      } catch (e) { /* ignore */ }
    },

    setDataset: function (ds) {
      App.state.dataset = ds;
      App.rememberCurrent();
      App.refreshStepper();
    },

    setRun: function (run) {
      if (run && run.result && !run.metrics) run.metrics = TT.metrics.analyze(run.dataset, run.settings, run.result.placements, run.result.unscheduled);
      App.state.run = run;
      App.rememberCurrent();
      App.refreshStepper();
    },

    canEnter: function (view) {
      const s = App.state;
      if (view === 'preview') return !!(s.importer && s.importer.sources().length) || !!s.validation;
      if (view === 'run') return !!s.dataset;
      if (view === 'results') return !!(s.run && s.run.result);
      return true;
    },

    go: function (view) {
      if (location.hash !== '#' + view) location.hash = view;
      else App.route();
    },

    route: function () {
      let view = (location.hash || '#import').slice(1).split('?')[0] || 'import';
      if (!App.views[view]) view = 'import';
      if (!App.canEnter(view)) {
        const msg = view === 'preview' ? 'นำเข้าไฟล์อย่างน้อย 1 ไฟล์ก่อนตรวจข้อมูล' : view === 'run' ? 'ยืนยันข้อมูลนำเข้าก่อนจัดตาราง' : 'ยังไม่มีผลการจัดตาราง กด "จัดตาราง" ก่อน';
        ui.toast(msg, 'info');
        view = view === 'results' && App.state.dataset ? 'run' : view === 'results' || view === 'run' ? (App.canEnter('preview') ? 'preview' : 'import') : 'import';
        history.replaceState(null, '', '#' + view);
      }
      ui.$$('.view').forEach(function (v) { v.hidden = v.dataset.view !== view; });
      App.current = view;
      if (App.views[view].show) App.views[view].show();
      App.refreshStepper();
      ui.$$('.topbar-links a').forEach(function (a) { if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      const main = ui.$('#main');
      if (App._routed) { main.focus({ preventScroll: true }); root.scrollTo({ top: 0 }); }
      App._routed = true;
    },

    refreshStepper: function () {
      const s = App.state;
      const jobs = s.importer ? s.importer.jobs : [];
      const doneJobs = jobs.filter(function (j) { return j.status === 'done'; }).length;
      const states = {
        import: doneJobs ? doneJobs + ' ไฟล์พร้อม' : jobs.length ? 'กำลังอ่านไฟล์' : 'เลือกไฟล์',
        preview: s.dataset ? 'ยืนยันแล้ว' : s.validation ? (s.validation.severity.error ? 'มีข้อผิดพลาด ' + s.validation.severity.error : 'รอยืนยัน') : 'รอข้อมูล',
        run: s.running ? 'กำลังคำนวณ' : s.run && s.run.result ? 'คำนวณเสร็จ' : s.dataset ? 'พร้อมจัดตาราง' : 'รอยืนยันข้อมูล',
        results: s.run && s.run.result ? (s.run.confirmed ? 'ยืนยันผลแล้ว' : 'ร่าง รอยืนยัน') : 'ยังไม่มีผล'
      };
      const done = { import: doneJobs > 0 || !!s.dataset, preview: !!s.dataset, run: !!(s.run && s.run.result), results: !!(s.run && s.run.confirmed) };
      ui.$$('#stepper a').forEach(function (a) {
        const k = a.dataset.step;
        const st = ui.$('[data-state-for="' + k + '"]', a);
        if (st) st.textContent = states[k];
        a.classList.toggle('is-done', !!done[k]);
        a.classList.toggle('is-locked', !App.canEnter(k));
        if (App.current === k) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
        if (!App.canEnter(k)) a.setAttribute('aria-disabled', 'true'); else a.removeAttribute('aria-disabled');
      });
    },

    refreshStoreChip: function (state, detail) {
      const chip = ui.$('#storeChip'), txt = ui.$('#storeChipText');
      if (!TT.store.isRemote()) { chip.dataset.state = 'local'; txt.textContent = 'บันทึกในเครื่องนี้'; chip.title = 'ยังไม่ได้ตั้งค่า Supabase — คลิกเพื่อตั้งค่า'; return; }
      if (state === 'error') { chip.dataset.state = 'error'; txt.textContent = 'Supabase มีปัญหา'; chip.title = detail || ''; return; }
      chip.dataset.state = 'remote'; txt.textContent = 'Supabase'; chip.title = 'บันทึกข้อมูลลง Supabase';
    },

    restore: async function () {
      let cur = null;
      try { cur = JSON.parse(localStorage.getItem(LS_CURRENT) || 'null'); } catch (e) { cur = null; }
      if (!cur) return;
      try {
        if (cur.datasetId) {
          const ds = await TT.store.getDataset(cur.datasetId);
          if (ds && ds.payload) App.state.dataset = ds;
        }
        if (cur.runId) {
          const run = await TT.store.getRun(cur.runId);
          if (run && run.result) {
            const ds = App.state.dataset && App.state.dataset.id === run.dataset_id ? App.state.dataset : await TT.store.getDataset(run.dataset_id);
            if (ds && ds.payload) { run.dataset = ds.payload; App.setRun(run); if (!App.state.dataset) App.state.dataset = ds; }
          }
        }
      } catch (e) { /* ข้ามการกู้คืนถ้าข้อมูลเสีย */ }
    }
  };

  TT.app = App;
  TT.views = App.views;

  document.addEventListener('DOMContentLoaded', async function () {
    ui.installRipple();
    ui.$('#detailClose').innerHTML = ui.icon('x');
    App.saveSettings();
    App.refreshStoreChip();
    TT.store.onStatus(App.refreshStoreChip);
    ui.$('#storeChip').addEventListener('click', function () { App.go('settings'); });
    ui.$('#stepper').addEventListener('click', function (e) {
      const a = e.target.closest('a[data-step]');
      if (a && !App.canEnter(a.dataset.step)) { e.preventDefault(); App.go(a.dataset.step); }
    });
    Object.keys(App.views).forEach(function (k) { if (App.views[k].init) App.views[k].init(); });
    await App.restore();
    root.addEventListener('hashchange', App.route);
    App.route();
    // แจ้งก่อนปิดหน้าระหว่างคำนวณ
    root.addEventListener('beforeunload', function (e) { if (App.state.running) { e.preventDefault(); e.returnValue = ''; } });
  });
})(typeof self !== 'undefined' ? self : globalThis);
