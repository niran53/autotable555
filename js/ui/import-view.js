/* ui/import-view.js — หน้า "นำเข้าข้อมูล": วางไฟล์, สถานะรายไฟล์ (ยกเลิก/ลองใหม่/ลบ), ชุดทดสอบ และแม่แบบ */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui;
  TT.views = TT.views || {};

  let sampleFmt = 'xlsx';

  function makeFile(name, data, type) {
    const blob = data instanceof Uint8Array ? new Blob([data], { type: type }) : new Blob([data], { type: type });
    try { return new File([blob], name, { type: type, lastModified: Date.now() }); }
    catch (e) { blob.name = name; return blob; }
  }

  function sampleFile(kind, fmt) {
    const d = kind === 'errors' ? TT.samples.generateWithErrors() : TT.samples.generate(kind);
    const base = 'ชุดทดสอบ-' + (kind === 'errors' ? 'มีข้อผิดพลาด' : TT.samples.SIZES[kind].label.replace('ชุด', ''));
    if (fmt === 'csv') return makeFile(base + '.csv', TT.samples.toCsv(d), 'text/csv');
    if (fmt === 'json') return makeFile(base + '.json', TT.samples.toJson(d), 'application/json');
    return makeFile(base + '.xlsx', TT.samples.toXlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function renderSampleButtons() {
    const box = ui.$('#sampleButtons');
    const list = ['small', 'medium', 'large'].map(function (k) {
      const d = TT.samples.generate(k);
      const periods = d.assignments.reduce(function (s, a) { return s + a.periods; }, 0);
      return { k: k, label: TT.samples.SIZES[k].label, desc: d.teachers.length + ' ครู · ' + d.rooms.length + ' ห้อง · ' + d.groups.length + ' กลุ่มเรียน · ' + d.assignments.length + ' รายการสอน (' + periods + ' คาบ)' };
    });
    list.push({ k: 'errors', label: 'ชุดที่มีข้อผิดพลาด', desc: 'รหัสซ้ำ, อ้างถึงห้อง/ครู/วิชาที่ไม่มี, ตัวเลขผิด, รูปแบบเวลาผิด — ใช้สาธิตการตรวจข้อมูล' });
    box.innerHTML = list.map(function (x) {
      return '<div class="row between" style="gap:0.6rem;padding:0.6rem 0.75rem;border:1px solid var(--line);border-radius:12px' + (x.k === 'errors' ? ';background:#fffaf9' : '') + '">' +
        '<div style="flex:1 1 180px;min-width:0"><div style="font-weight:600">' + ui.esc(x.label) + '</div><div class="small muted">' + ui.esc(x.desc.replace(/ · /g, ', ')) + '</div></div>' +
        '<div class="row" style="gap:0.35rem"><button type="button" class="btn btn-sm btn-primary" data-sample="' + x.k + '">นำเข้า</button>' +
        '<button type="button" class="btn btn-sm" data-sample-dl="' + x.k + '" aria-label="ดาวน์โหลด' + ui.esc(x.label) + '">' + ui.icon('download') + '</button></div></div>';
    }).join('');
  }

  function renderColumnHelp() {
    const S = TT.schema;
    let html = '<p>หัวคอลัมน์เป็นภาษาไทยหรืออังกฤษก็ได้ ช่องที่มีเครื่องหมาย * ต้องกรอก ตั้งชื่อแผ่นงาน (Excel) หรือบรรทัดหัวข้อ <code>#ครู</code> (CSV) เพื่อแยกตาราง หรือแยกเป็นหลายไฟล์ก็ได้</p>';
    S.ORDER.forEach(function (ent) {
      const e = S.ENTITIES[ent];
      html += '<h4 style="margin-top:0.9rem">' + ui.esc(e.label) + ' <span class="muted small">(ชื่อแผ่นงาน: ' + ui.esc(TT.samples.SHEET_TITLES[ent]) + ' หรือ ' + ent + ')</span></h4>';
      html += '<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>หัวคอลัมน์</th><th>ชื่ออังกฤษ</th><th>ตัวอย่าง / หมายเหตุ</th></tr></thead><tbody>';
      const ex = TT.samples.template()[ent][0];
      e.fields.forEach(function (f) {
        let note = ex[f.key] == null || ex[f.key] === '' ? '' : String(ex[f.key]);
        if (f.key === 'unavailable') note = 'จ1-2; พฤ5-8; ศ (ทั้งวัน)';
        if (f.key === 'split') note = '2+3 (เว้นว่างให้ระบบแบ่งเอง)';
        if (f.key === 'teacher_id' && ent === 'assignments') note = 'T001 หรือ T001|T002 (สอนร่วม)';
        if (f.key === 'periods') note = 'เว้นว่างได้ ระบบใช้ ท+ป ของวิชา';
        if (f.key === 'room_id' && ent === 'assignments') note = 'เว้นว่างให้ระบบเลือกห้อง';
        html += '<tr><td>' + ui.esc(f.label) + (f.required ? ' *' : '') + '</td><td><code>' + f.key + '</code></td><td>' + ui.esc(note) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    });
    ui.$('#columnHelp').innerHTML = html;
  }

  function statusBadge(j) {
    const t = TT.importer.STATUS_TEXT[j.status];
    const cls = j.status === 'done' ? 'badge-ok' : j.status === 'error' ? 'badge-error' : j.status === 'cancelled' ? '' : 'badge-info';
    return '<span class="badge ' + cls + '">' + (j.status === 'done' ? ui.icon('check') : j.status === 'error' ? ui.icon('alert') : '') + ui.esc(t) + '</span>';
  }

  function renderJobs(jobs) {
    const list = ui.$('#jobs');
    ui.$('#jobsEmpty').hidden = jobs.length > 0;
    ui.$('#clearJobs').hidden = jobs.length === 0;
    ui.$('#jobCount').textContent = jobs.length + ' ไฟล์';
    list.innerHTML = jobs.map(function (j) {
      const busy = j.status === 'reading' || j.status === 'parsing' || j.status === 'queued';
      let meta = ui.fmtBytes(j.size) + ' · ' + statusBadge(j);
      if (j.status === 'done') meta += ' <span>' + ui.esc(j.message) + (j.ms != null ? ' ใช้เวลา ' + U.fmtDuration(j.ms) : '') + '</span>';
      if (j.status === 'cancelled') meta += ' <span>' + ui.esc(j.message || '') + '</span>';
      let err = '';
      if (j.status === 'error' && j.error) err = '<div class="err">' + ui.esc(j.error.message) + '</div><div class="small">วิธีแก้: ' + ui.esc(j.error.fix) + '</div>';
      const pct = Math.round((j.progress || 0) * 100);
      return '<li class="job" data-status="' + j.status + '" data-id="' + j.id + '">' +
        '<span class="ftype" data-t="' + ui.esc(j.ext) + '">' + ui.esc((j.ext || '?').toUpperCase()) + '</span>' +
        '<div style="min-width:0"><div class="job-name" title="' + ui.esc(j.name) + '">' + ui.esc(j.name) + '</div>' +
        '<div class="job-meta">' + meta.replace(' · ', ' <span aria-hidden="true">|</span> ') + err + '</div>' +
        (busy ? '<div class="progress' + (j.status === 'queued' ? ' is-indeterminate' : '') + '" role="progressbar" aria-label="ความคืบหน้าอ่านไฟล์ ' + ui.esc(j.name) + '" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div>' : '') +
        '</div>' +
        '<div class="job-actions">' +
        (busy ? '<button type="button" class="btn btn-sm btn-danger" data-act="cancel">' + ui.icon('stop') + 'ยกเลิก</button>' : '') +
        (j.status === 'error' || j.status === 'cancelled' ? '<button type="button" class="btn btn-sm" data-act="retry">' + ui.icon('retry') + 'ลองใหม่</button>' : '') +
        (!busy ? '<button type="button" class="icon-btn" data-act="remove" aria-label="นำไฟล์ ' + ui.esc(j.name) + ' ออก">' + ui.icon('trash') + '</button>' : '') +
        '</div></li>';
    }).join('');
    const done = jobs.filter(function (j) { return j.status === 'done'; });
    const bad = jobs.filter(function (j) { return j.status === 'error'; }).length;
    const busy = jobs.some(function (j) { return j.status === 'reading' || j.status === 'parsing' || j.status === 'queued'; });
    const rows = done.reduce(function (s, j) { return s + j.result.tables.reduce(function (x, t) { return x + Math.max(0, t.rows.length - 1); }, 0); }, 0);
    ui.$('#toPreview').disabled = !done.length || busy;
    ui.$('#importSummary').innerHTML = busy ? 'กำลังอ่านไฟล์…' : done.length
      ? 'พร้อมตรวจ ' + done.length + ' ไฟล์ รวม ' + U.fmtNum(rows) + ' แถวข้อมูล' + (bad ? ' <span class="badge badge-error">อ่านไม่สำเร็จ ' + bad + ' ไฟล์</span>' : '')
      : bad ? '<span style="color:var(--danger)">ยังไม่มีไฟล์ที่อ่านสำเร็จ แก้ไฟล์ตามคำแนะนำแล้วกด "ลองใหม่"</span>' : 'เลือกไฟล์อย่างน้อย 1 ไฟล์เพื่อดำเนินการต่อ';
    TT.app.state.validation = null; // ไฟล์เปลี่ยน ต้องตรวจใหม่
    TT.app.refreshStepper();
  }

  TT.views.import = {
    init: function () {
      const App = TT.app;
      App.state.importer = TT.importer.create(renderJobs);
      const dz = ui.$('#dropzone'), input = ui.$('#fileInput');
      input.addEventListener('change', function () { if (input.files.length) App.state.importer.add(input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); }); });
      dz.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) App.state.importer.add(e.dataTransfer.files); });
      dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      dz.tabIndex = 0;
      // ป้องกันเบราว์เซอร์เปิดไฟล์เมื่อวางนอกพื้นที่
      root.addEventListener('dragover', function (e) { e.preventDefault(); });
      root.addEventListener('drop', function (e) { e.preventDefault(); });

      ui.$('#jobs').addEventListener('click', function (e) {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const id = b.closest('.job').dataset.id;
        const imp = App.state.importer;
        if (b.dataset.act === 'cancel') imp.cancel(id);
        else if (b.dataset.act === 'retry') imp.retry(id);
        else if (b.dataset.act === 'remove') imp.remove(id);
      });
      ui.$('#clearJobs').addEventListener('click', function () { App.state.importer.clear(); });

      renderSampleButtons();
      ui.$('#sampleFormat').addEventListener('click', function (e) {
        const b = e.target.closest('[data-fmt]');
        if (!b) return;
        sampleFmt = b.dataset.fmt;
        ui.$$('#sampleFormat button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      ui.$('#sampleButtons').addEventListener('click', function (e) {
        const b = e.target.closest('[data-sample]');
        const d = e.target.closest('[data-sample-dl]');
        if (b) {
          const f = sampleFile(b.dataset.sample, sampleFmt);
          App.state.importer.add([f]);
          ui.toast('เพิ่ม ' + f.name + ' เข้าคิวนำเข้าแล้ว', 'ok');
        } else if (d) {
          const f = sampleFile(d.dataset.sampleDl, sampleFmt);
          TT.exporter.download(f, f.name, f.type);
        }
      });
      ui.$$('[data-template]').forEach(function (b) {
        b.addEventListener('click', function () {
          const t = TT.samples.template();
          const fmt = b.dataset.template;
          if (fmt === 'csv') TT.exporter.download(TT.samples.toCsv(t), 'แม่แบบ-ตารางสอน.csv', 'text/csv;charset=utf-8');
          else if (fmt === 'json') TT.exporter.download(TT.samples.toJson(t), 'แม่แบบ-ตารางสอน.json', 'application/json');
          else TT.exporter.download(TT.samples.toXlsx(t), 'แม่แบบ-ตารางสอน.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        });
      });
      renderColumnHelp();
      ui.$('#toPreview').addEventListener('click', function () { App.go('preview'); });
      renderJobs([]);
    },
    show: function () {}
  };
})(typeof self !== 'undefined' ? self : globalThis);
