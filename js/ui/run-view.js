/* ui/run-view.js — หน้า "จัดตาราง": ตั้งค่าช่วงเวลา, เริ่ม/ยกเลิก/เริ่มใหม่ และแสดงความคืบหน้าระหว่างคำนวณ */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui;
  TT.views = TT.views || {};

  const QUALITY = {
    fast: { attempts: 5, timeLimitSec: 8, hint: 'ค้นหา 5 รอบ (ไม่เกิน 8 วินาที) เหมาะกับการทดลองตั้งค่า' },
    normal: { attempts: 20, timeLimitSec: 20, hint: 'ค้นหา 20 รอบ (ไม่เกิน 20 วินาที) แล้วเลือกตารางที่ดีที่สุด' },
    deep: { attempts: 60, timeLimitSec: 60, hint: 'ค้นหา 60 รอบ (ไม่เกิน 60 วินาที) ลดเวลาว่างคั่นได้มากขึ้นสำหรับข้อมูลขนาดใหญ่' }
  };

  let handle = null, run = null, tick = null, lastPhase = '', lastProgress = null, restartPending = false, precheckOk = true;

  function settings() { return TT.app.state.settings; }

  function qualityOf(s) {
    if (s.attempts <= 5) return 'fast';
    if (s.attempts >= 60) return 'deep';
    return 'normal';
  }

  function fillForm() {
    const s = settings();
    const f = ui.$('#settingsForm');
    ui.$('#dayPicks').innerHTML = U.DAY_NAMES.map(function (n, i) {
      return '<label class="day-pick" title="' + n + '"><input type="checkbox" name="day" value="' + i + '"' + (s.days.indexOf(i) >= 0 ? ' checked' : '') + '><span>' + U.DAY_SHORT[i] + '</span></label>';
    }).join('');
    f.periodsPerDay.value = s.periodsPerDay;
    f.startTime.value = s.startTime;
    f.periodMinutes.value = s.periodMinutes;
    const b = (s.breaks || [])[0];
    f.breakAfter.value = b ? b.after : 0;
    f.breakMinutes.value = b ? b.minutes : 0;
    f.maxBlock.value = s.maxBlock;
    f.blocked.value = s.blocked || '';
    f.blockedLabel.value = s.blockedLabel || '';
    f.noCrossBreak.checked = s.noCrossBreak !== false;
    f.oneSessionPerDay.checked = s.oneSessionPerDay !== false;
    const q = qualityOf(s);
    ui.$$('#qualityPick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.q === q)); });
    ui.$('#qualityHint').textContent = QUALITY[q].hint;
  }

  function readForm() {
    const s = settings();
    const f = ui.$('#settingsForm');
    const days = ui.$$('input[name="day"]:checked', f).map(function (x) { return +x.value; });
    const num = function (el, def, min, max) { const n = parseInt(el.value, 10); return isNaN(n) ? def : Math.max(min, Math.min(max, n)); };
    s.days = days;
    s.periodsPerDay = num(f.periodsPerDay, 8, 3, 14);
    s.startTime = U.toMinutes(f.startTime.value) != null ? f.startTime.value : '08:00';
    s.periodMinutes = num(f.periodMinutes, 60, 30, 120);
    const after = num(f.breakAfter, 0, 0, 13), mins = num(f.breakMinutes, 0, 0, 120);
    s.breaks = after > 0 && after < s.periodsPerDay ? [{ after: after, minutes: mins, label: 'พักกลางวัน' }] : [];
    s.maxBlock = num(f.maxBlock, 4, 1, 8);
    s.blocked = f.blocked.value.trim();
    s.blockedLabel = f.blockedLabel.value.trim() || 'กิจกรรม';
    s.noCrossBreak = f.noCrossBreak.checked;
    s.oneSessionPerDay = f.oneSessionPerDay.checked;
    TT.app.saveSettings();
  }

  function renderRuler() {
    const s = settings();
    const tm = TT.timeModel(s);
    let html = '';
    tm.times.forEach(function (t, i) {
      const p = i + 1;
      html += '<div class="rp" title="' + t.label + '"><b>คาบ ' + p + '</b><span>' + U.fmtTime(t.start) + '</span></div>';
      const b = (s.breaks || []).find(function (x) { return x.after === p && p < tm.P; });
      if (b) html += '<div class="rb" title="' + ui.esc(b.label) + ' ' + b.minutes + ' นาที"><span>พัก</span></div>';
    });
    ui.$('#ruler').innerHTML = html;
  }

  function precheck() {
    const App = TT.app;
    const box = ui.$('#settingsError');
    const s = settings();
    const problems = [];
    if (!s.days.length) problems.push({ message: 'ยังไม่ได้เลือกวันเรียน', fix: 'เลือกวันเรียนอย่างน้อย 1 วัน' });
    const tmb = TT.timeModel(s);
    if (tmb.blockedBad.length) problems.push({ message: 'รูปแบบช่วงกิจกรรมไม่ถูกต้อง: ' + tmb.blockedBad.join(', '), fix: 'ใช้รูปแบบ "พ7-8" หรือ "ศ" (ทั้งวัน) คาบต้องไม่เกิน ' + s.periodsPerDay });
    if (!problems.length && App.state.dataset) {
      const v = TT.validator.precheck(App.state.dataset.payload, s);
      v.issues.filter(function (i) { return i.severity === 'error'; }).slice(0, 6).forEach(function (i) { problems.push(i); });
      if (v.severity.error > 6) problems.push({ message: 'และอีก ' + (v.severity.error - 6) + ' รายการ', fix: '' });
    }
    precheckOk = problems.length === 0;
    box.innerHTML = precheckOk ? '' : '<div class="callout callout-error" role="alert">' + ui.icon('alert') + '<div><p><b>การตั้งค่านี้ใช้กับข้อมูลชุดนี้ไม่ได้</b></p><ul style="margin:0.3rem 0 0;padding-left:1.1rem">' +
      problems.map(function (p) { return '<li>' + ui.esc(p.message) + (p.fix ? '<br><span class="small">วิธีแก้: ' + ui.esc(p.fix) + '</span>' : '') + '</li>'; }).join('') + '</ul></div></div>';
    updateButtons();
  }

  function updateButtons() {
    const running = TT.app.state.running;
    ui.$('#btnRun').disabled = running || !precheckOk || !TT.app.state.dataset;
    ui.$('#btnCancel').disabled = !running;
    ui.$('#btnRestart').disabled = !TT.app.state.dataset || !precheckOk || (!running && !run);
    ui.$$('#settingsForm input, #qualityPick button').forEach(function (el) { el.disabled = running; });
  }

  function setStatus(text, cls) {
    const b = ui.$('#runStatusBadge');
    b.className = 'badge ' + (cls || '');
    b.textContent = text;
  }

  function log(text, cls) {
    const ul = ui.$('#runLog');
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const el = run ? Date.now() - new Date(run.started_at).getTime() : 0;
    li.innerHTML = '<time>' + (el / 1000).toFixed(1) + ' วิ</time><span>' + ui.esc(text) + '</span>';
    ul.appendChild(li);
    ul.scrollTop = ul.scrollHeight;
  }

  function setProgress(frac, mode) {
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    const bar = ui.$('#runProgress');
    bar.classList.toggle('is-error', mode === 'error');
    bar.classList.toggle('is-cancel', mode === 'cancel');
    bar.firstElementChild.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', String(pct));
    ui.$('#runPct').textContent = pct + '%';
  }

  function renderStats(p) {
    const el = run ? Date.now() - new Date(run.started_at).getTime() : 0;
    const items = [
      ['รอบค้นหา', p ? (p.attempt || 0) + ' / ' + p.attempts : '-'],
      ['ช่วงสอนที่วางแล้ว', p && p.placed != null ? U.fmtNum(p.placed) + ' / ' + U.fmtNum(p.total) : '-'],
      ['คาบที่ยังวางไม่ได้ (ดีที่สุด)', p && p.bestUnplaced != null ? U.fmtNum(p.bestUnplaced) : '-'],
      ['เวลาที่ใช้', run ? U.fmtDuration(run.duration_ms != null ? run.duration_ms : el) : '-']
    ];
    ui.$('#runStats').innerHTML = items.map(function (x) { return '<div class="metric"><div class="metric-label">' + x[0] + '</div><div class="metric-value" style="font-size:1.25rem">' + x[1] + '</div></div>'; }).join('');
  }

  function start() {
    const App = TT.app;
    if (App.state.running || !App.state.dataset) return;
    readForm(); precheck();
    if (!precheckOk) { ui.toast('แก้การตั้งค่าก่อนจัดตาราง', 'error'); return; }
    const s = U.deepClone(settings());
    s.seed = (Math.random() * 1e9) | 0 || 1;
    const ds = App.state.dataset;
    run = {
      id: U.uuid(), dataset_id: ds.id, status: 'running', confirmed: false, settings: s, dataset: ds.payload,
      started_at: new Date().toISOString(), sources: ds.sources, counts: ds.counts
    };
    lastPhase = ''; lastProgress = null;
    ui.$('#runLog').innerHTML = '';
    ui.$('#runResultBox').innerHTML = '';
    App.state.running = true;
    App.refreshStepper();
    setStatus('กำลังคำนวณ', 'badge-info');
    setProgress(0);
    log('เริ่มจัดตาราง รหัสรอบ ' + run.id.slice(0, 8) + ' (seed ' + s.seed + ')');
    renderStats(null);
    updateButtons();
    TT.store.saveRun(Object.assign({}, run, { dataset: undefined }));
    tick = setInterval(function () { renderStats(lastProgress); }, 250);
    handle = TT.runner.start(ds.payload, s, {
      onMode: function (mode, note) {
        ui.$('#runModeLine').textContent = mode === 'worker' ? 'คำนวณในเธรดแยก หน้าเว็บใช้งานได้ตามปกติระหว่างรอ' : 'คำนวณในหน้าเว็บแบบแบ่งช่วง' + (note === 'worker-failed' ? ' (เปิด Web Worker ไม่ได้)' : '');
      },
      onProgress: function (p) {
        lastProgress = p;
        setProgress(p.pct || 0);
        ui.$('#runPhase').textContent = p.label || '';
        if (p.phase === 'attempt-done' || p.phase === 'early-stop' || p.phase === 'prepare') log(p.label);
        else if (p.phase !== lastPhase && p.phase === 'repair') log(p.label);
        lastPhase = p.phase;
        renderStats(p);
      },
      onDone: function (res) { finish('completed', res); },
      onCancel: function () { finish('cancelled'); },
      onError: function (err) { finish('failed', null, err); }
    });
  }

  function finish(status, res, err) {
    const App = TT.app;
    clearInterval(tick); tick = null;
    App.state.running = false;
    handle = null;
    run.status = status;
    run.finished_at = new Date().toISOString();
    run.duration_ms = new Date(run.finished_at) - new Date(run.started_at);
    if (status === 'completed') {
      run.result = { placements: res.placements, unscheduled: res.unscheduled, solver: res.solver };
      run.metrics = TT.metrics.analyze(run.dataset, run.settings, res.placements, res.unscheduled);
      const m = run.metrics;
      run.stats = {
        required: m.required, scheduled: m.scheduled, unscheduled: m.unscheduledPeriods,
        clashTeacher: m.clashes.teacher.length, clashRoom: m.clashes.room.length, clashGroup: m.clashes.group.length, violations: m.violations.length,
        roomRate: +m.roomRate.toFixed(4), gaps: m.totalGroupGaps, avgLoad: +m.avgLoad.toFixed(2), attempt: res.solver.attempt
      };
      setProgress(1);
      setStatus(m.unscheduledPeriods ? 'เสร็จ มีคาบที่ยังจัดไม่ได้' : 'เสร็จสมบูรณ์', m.unscheduledPeriods ? 'badge-warning' : 'badge-ok');
      ui.$('#runPhase').textContent = 'คำนวณเสร็จใน ' + U.fmtDuration(run.duration_ms);
      log('ตรวจผลจากตารางจริง: จัดได้ ' + m.scheduled + '/' + m.required + ' คาบ, ครูซ้อนคาบ ' + m.clashes.teacher.length + ', ห้องซ้อน ' + m.clashes.room.length + ', กลุ่มเวลาตรงกัน ' + m.clashes.group.length, m.conflictTotal ? 'is-error' : 'is-ok');
      App.setRun(run);
      renderResultBox();
      ui.toast('จัดตารางเสร็จ ' + m.scheduled + '/' + m.required + ' คาบ', 'ok');
    } else if (status === 'cancelled') {
      setProgress(lastProgress ? lastProgress.pct : 0, 'cancel');
      setStatus('ยกเลิกแล้ว', '');
      ui.$('#runPhase').textContent = 'ยกเลิกการคำนวณแล้ว กด "จัดตาราง" หรือ "เริ่มใหม่" เพื่อคำนวณอีกครั้ง';
      log('ผู้ใช้ยกเลิกการคำนวณ', 'is-error');
      ui.$('#runResultBox').innerHTML = '<div class="callout callout-warn">' + ui.icon('info') + '<div><p>ยกเลิกรอบนี้แล้ว ผลเดิม' + (App.state.run && App.state.run.result ? 'ยังเปิดดูได้ที่หน้า "ตารางผลลัพธ์"' : 'ไม่มี') + '</p></div></div>';
    } else {
      setProgress(lastProgress ? lastProgress.pct : 0, 'error');
      setStatus('ผิดพลาด', 'badge-error');
      run.error = err && err.message || 'ไม่ทราบสาเหตุ';
      ui.$('#runPhase').textContent = 'คำนวณไม่สำเร็จ';
      log('เกิดข้อผิดพลาด: ' + run.error, 'is-error');
      ui.$('#runResultBox').innerHTML = '<div class="callout callout-error" role="alert">' + ui.icon('alert') + '<div><p><b>คำนวณไม่สำเร็จ:</b> ' + ui.esc(run.error) + '</p><p class="small">วิธีแก้: กด "เริ่มใหม่" ถ้ายังไม่ได้ ให้ลองโหมด "เร็ว" หรือรีเฟรชหน้าแล้วนำเข้าข้อมูลอีกครั้ง</p></div></div>';
    }
    App.refreshStepper();
    TT.store.saveRun(Object.assign({}, run, { dataset: undefined, metrics: undefined })).then(function (r) {
      if (r.error) log('บันทึกลง Supabase ไม่สำเร็จ เก็บไว้ในเครื่องแทน: ' + r.error, 'is-error');
      else if (r.where === 'remote') log('บันทึกรอบรันลง Supabase แล้ว');
    });
    updateButtons();
    if (restartPending) { restartPending = false; setTimeout(start, 50); }
  }

  function renderResultBox() {
    if (!run || !run.metrics) return;
    const m = run.metrics;
    const clash = m.clashes.teacher.length + m.clashes.room.length + m.clashes.group.length;
    ui.$('#runResultBox').innerHTML = '<div class="panel"><div class="panel-head"><div><h2>ผลการจัดตาราง</h2><p>นับซ้ำจากตารางจริงทุกคาบ</p></div>' +
      '<a class="btn btn-primary" href="#results">' + ui.icon('grid') + 'ดูตารางผลลัพธ์</a></div>' +
      '<div class="metrics">' +
      '<div class="metric ' + (m.unscheduledPeriods ? 'is-bad' : 'is-ok') + '"><div class="metric-label">คาบที่จัดได้</div><div class="metric-value">' + U.fmtNum(m.scheduled) + '<small> / ' + U.fmtNum(m.required) + '</small></div></div>' +
      '<div class="metric ' + (clash ? 'is-bad' : 'is-ok') + '"><div class="metric-label">คาบชน (ครู / ห้อง / กลุ่ม)</div><div class="metric-value">' + m.clashes.teacher.length + ' / ' + m.clashes.room.length + ' / ' + m.clashes.group.length + '</div></div>' +
      '<div class="metric"><div class="metric-label">อัตราการใช้ห้อง</div><div class="metric-value">' + U.fmtPct(m.roomRate) + '</div></div>' +
      '<div class="metric"><div class="metric-label">เวลาว่างคั่นรวม</div><div class="metric-value">' + m.totalGroupGaps + '<small> คาบ</small></div></div>' +
      '</div></div>';
  }

  TT.views.run = {
    init: function () {
      fillForm(); renderRuler();
      const f = ui.$('#settingsForm');
      const onChange = function () { readForm(); renderRuler(); precheck(); };
      f.addEventListener('input', onChange);
      f.addEventListener('change', onChange);
      ui.$('#qualityPick').addEventListener('click', function (e) {
        const b = e.target.closest('[data-q]');
        if (!b || b.disabled) return;
        const q = QUALITY[b.dataset.q];
        settings().attempts = q.attempts; settings().timeLimitSec = q.timeLimitSec;
        TT.app.saveSettings();
        ui.$$('#qualityPick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        ui.$('#qualityHint').textContent = q.hint;
      });
      ui.$('#btnRun').addEventListener('click', start);
      ui.$('#btnCancel').addEventListener('click', function () {
        if (handle) { ui.$('#runPhase').textContent = 'กำลังยกเลิก…'; handle.cancel(); }
      });
      ui.$('#btnRestart').addEventListener('click', function () {
        if (TT.app.state.running && handle) { restartPending = true; log('เริ่มใหม่: หยุดรอบปัจจุบัน'); handle.cancel(); }
        else start();
      });
      renderStats(null);
    },
    show: function () {
      const App = TT.app;
      const ds = App.state.dataset;
      if (ds) {
        const c = ds.counts;
        ui.$('#runDatasetLine').textContent = 'ข้อมูลที่ยืนยันแล้ว: ครู ' + c.teachers + ' คน, ห้อง ' + c.rooms + ' ห้อง, วิชา ' + c.subjects + ' วิชา, กลุ่มเรียน ' + c.groups + ' กลุ่ม, รายการสอน ' + c.assignments + ' รายการ (' + ds.sources.join(', ') + ')';
      }
      if (!App.state.running) {
        if (run && run !== App.state.run && run.status === 'completed') {
          run = null; ui.$('#runResultBox').innerHTML = ''; ui.$('#runLog').innerHTML = ''; setStatus('ยังไม่เริ่ม', ''); setProgress(0); ui.$('#runPhase').textContent = '-'; renderStats(null);
        }
        fillForm(); renderRuler();
        if (!run && App.state.run && App.state.run.result) {
          run = App.state.run; renderResultBox(); setStatus('เสร็จสมบูรณ์', 'badge-ok'); setProgress(1); renderStats(null);
        }
      }
      precheck();
    },
    get running() { return TT.app.state.running; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
