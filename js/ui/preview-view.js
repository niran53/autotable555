/* ui/preview-view.js — หน้า "ตรวจและยืนยัน": เทียบจำนวนรายการที่อ่านได้, รายการปัญหาพร้อมวิธีแก้, พรีวิวข้อมูลรายตาราง */
(function (root) {
  'use strict';
  const TT = root.TT;
  const U = TT.util, ui = TT.ui, S = TT.schema;
  TT.views = TT.views || {};

  let activeEnt = 'teachers';
  let sevFilter = 'all';
  let table = null;
  let search = '';

  function key() {
    const imp = TT.app.state.importer;
    const ids = imp.jobs.filter(function (j) { return j.status === 'done'; }).map(function (j) { return j.id + ':' + (j.ms || 0); }).join(',');
    const st = TT.app.state.settings;
    return ids + '|' + JSON.stringify([st.days, st.periodsPerDay, st.breaks, st.blocked, st.maxBlock, st.noCrossBreak, st.oneSessionPerDay]);
  }

  function ensureValidation() {
    const App = TT.app;
    const k = key();
    if (!App.state.validation || App.state.validationKey !== k) {
      const sources = App.state.importer.sources();
      if (!sources.length && App.state.validation) return App.state.validation;
      App.state.validation = TT.validator.validate(sources, App.state.settings);
      App.state.validationKey = k;
    }
    return App.state.validation;
  }

  function render() {
    const v = ensureValidation();
    const body = ui.$('#previewBody');
    const sev = v.severity;
    let html = '';

    // ---------- แถบสรุปสถานะ ----------
    if (sev.error) {
      html += '<div class="callout callout-error" role="alert">' + ui.icon('alert') + '<div><p><b>พบข้อผิดพลาด ' + sev.error + ' รายการ</b> ต้องแก้ไขก่อนยืนยันข้อมูล ดูวิธีแก้ในรายการด้านล่าง แก้ไฟล์แล้วนำเข้าใหม่ (กด "ลองใหม่" ที่ไฟล์เดิม หรือเลือกไฟล์ที่แก้แล้ว)</p></div></div>';
    } else {
      html += '<div class="callout callout-ok">' + ui.icon('okc') + '<div><p><b>ข้อมูลพร้อมใช้งาน</b> ไม่พบข้อผิดพลาด' + (sev.warning ? ' มีคำเตือน ' + sev.warning + ' รายการที่ควรตรวจ' : '') + ' ตรวจพรีวิวแล้วกด "ยืนยันข้อมูลนำเข้า"</p></div></div>';
    }

    // ---------- จำนวนรายการรายตาราง ----------
    html += '<div class="panel" style="margin-top:1rem"><div class="panel-head"><div><h2>จำนวนรายการที่อ่านได้</h2><p>คลิกเพื่อดูพรีวิวของตารางนั้น รวมทั้งหมด ' + U.fmtNum(v.totalPeriods) + ' คาบ/สัปดาห์ที่ต้องจัด</p></div></div><div class="count-grid">';
    S.ORDER.forEach(function (ent) {
      const c = v.counts[ent];
      html += '<button type="button" class="count-card' + (c.invalid ? ' has-error' : '') + '" data-ent="' + ent + '" aria-pressed="' + (ent === activeEnt) + '">' +
        '<div class="t">' + S.ENTITIES[ent].label + '</div><div class="n">' + U.fmtNum(c.read) + '</div>' +
        '<div class="s">' + (c.invalid ? '<span style="color:var(--danger);font-weight:600">มีปัญหา ' + c.invalid + ' แถว</span>' : c.read ? 'ถูกต้องทุกแถว' : 'ยังไม่มีข้อมูล') + '</div></button>';
    });
    html += '</div>';

    // ตารางเทียบกับต้นฉบับ
    html += '<h3 style="margin-top:1.1rem">เทียบกับไฟล์ต้นฉบับ</h3><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>ไฟล์</th><th>ตาราง / แผ่นงาน</th><th>ระบบจัดเป็น</th><th class="num">แถวข้อมูลในไฟล์</th><th class="num">อ่านเข้าระบบ</th><th class="num">ถูกต้อง</th><th>ผล</th></tr></thead><tbody>';
    v.tableInfo.forEach(function (t) {
      const same = t.entity && t.rowsInFile === t.rowsRead;
      const allOk = t.rowsRead === t.rowsValid;
      html += '<tr><td>' + ui.esc(t.file) + '</td><td>' + ui.esc(t.table) + '</td><td>' + (t.entity ? ui.esc(S.ENTITIES[t.entity].label) + (t.by === 'headers' ? ' <span class="muted small">(จากหัวคอลัมน์)</span>' : '') : '<span class="badge badge-error">ไม่ทราบชนิด</span>') + '</td>' +
        '<td class="num">' + U.fmtNum(t.rowsInFile) + '</td><td class="num">' + U.fmtNum(t.rowsRead) + '</td><td class="num">' + U.fmtNum(t.rowsValid) + '</td>' +
        '<td>' + (!t.entity ? '<span class="badge badge-error">ข้าม</span>' : same && allOk ? '<span class="badge badge-ok">' + ui.icon('check') + 'ครบ ตรงกัน</span>' : same ? '<span class="badge badge-warning">อ่านครบ มีแถวต้องแก้</span>' : '<span class="badge badge-error">ไม่ครบ</span>') + '</td></tr>';
    });
    if (!v.tableInfo.length) html += '<tr><td colspan="7" class="muted">ไม่มีตารางจากไฟล์</td></tr>';
    html += '</tbody></table></div></div>';

    // ---------- รายการปัญหา + พรีวิว ----------
    html += '<div class="panel" style="margin-top:1.25rem"><div class="panel-head"><div><h2>ปัญหาที่พบ</h2><p>' + (sev.error + sev.warning + sev.info ? 'ทุกข้อบอกตำแหน่งในไฟล์และวิธีแก้ คลิก "ไปที่แถว" เพื่อดูข้อมูลต้นเหตุในพรีวิว' : 'ไม่พบปัญหา') + '</p></div>' +
      '<div class="segmented" id="sevPick" role="group" aria-label="กรองระดับปัญหา">' +
      [['all', 'ทั้งหมด', sev.error + sev.warning + sev.info], ['error', 'ข้อผิดพลาด', sev.error], ['warning', 'คำเตือน', sev.warning], ['info', 'ข้อสังเกต', sev.info]].map(function (x) {
        return '<button type="button" data-sev="' + x[0] + '" aria-pressed="' + (sevFilter === x[0]) + '">' + x[1] + ' (' + x[2] + ')</button>';
      }).join('') + '</div></div><ul class="issues" id="issueList"></ul></div>';
    html += '<div class="panel" style="margin-top:1.25rem"><div class="panel-head"><div><h2 id="pvTitle">พรีวิว</h2><p id="pvSub"></p></div>' +
      '<label class="search" style="min-width:260px"><span class="sr-only">ค้นหาในตาราง</span>' + ui.icon('search') + '<input class="input" id="pvSearch" type="search" placeholder="ค้นหารหัสหรือชื่อ" value="' + ui.esc(search) + '"></label></div>' +
      '<div class="tabs" role="tablist" id="pvTabs">' + S.ORDER.map(function (ent) {
        return '<button type="button" role="tab" data-ent="' + ent + '" aria-selected="' + (ent === activeEnt) + '">' + S.ENTITIES[ent].label + ' <span class="badge">' + v.counts[ent].read + '</span></button>';
      }).join('') + '</div><div id="pvTable" class="nowrap-table"></div></div>';
    body.innerHTML = html;

    renderIssues(v);
    renderTable(v);

    ui.$$('.count-card', body).forEach(function (b) { b.onclick = function () { activeEnt = b.dataset.ent; syncTabs(); renderTable(v); ui.$('#pvTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
    ui.$$('#pvTabs button').forEach(function (b) { b.onclick = function () { activeEnt = b.dataset.ent; syncTabs(); renderTable(v); }; });
    ui.$$('#sevPick button').forEach(function (b) { b.onclick = function () { sevFilter = b.dataset.sev; ui.$$('#sevPick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderIssues(v); }; });
    ui.$('#pvSearch').oninput = function (e) { search = e.target.value; renderTable(v); };

    // ปุ่มยืนยัน
    const btn = ui.$('#confirmImport');
    btn.disabled = !v.canConfirm;
    ui.$('#confirmHint').innerHTML = v.canConfirm
      ? 'อ่านได้ ' + S.ORDER.map(function (e) { return S.ENTITIES[e].label + ' ' + v.counts[e].read; }).join(', ') + (sev.warning ? ' <span class="badge badge-warning">คำเตือน ' + sev.warning + '</span>' : '')
      : '<span style="color:var(--danger);font-weight:600">แก้ข้อผิดพลาด ' + sev.error + ' รายการก่อนยืนยัน</span>';
    if (TT.app.state.dataset && TT.app.state.dataset.validationKey === TT.app.state.validationKey) {
      ui.$('#confirmHint').innerHTML = '<span class="badge badge-ok">' + ui.icon('check') + 'ยืนยันข้อมูลชุดนี้แล้ว</span>';
    }
  }

  function syncTabs() {
    ui.$$('#pvTabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x.dataset.ent === activeEnt)); });
    ui.$$('.count-card').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.ent === activeEnt)); });
  }

  function renderIssues(v) {
    const list = v.issues.filter(function (i) { return sevFilter === 'all' || i.severity === sevFilter; })
      .sort(function (a, b) { const o = { error: 0, warning: 1, info: 2 }; return o[a.severity] - o[b.severity] || a.id - b.id; });
    const el = ui.$('#issueList');
    if (!list.length) { el.innerHTML = '<li class="muted">ไม่มีรายการในหมวดนี้</li>'; return; }
    el.innerHTML = list.slice(0, 400).map(function (i) {
      return '<li class="issue" data-sev="' + i.severity + '">' +
        '<span class="badge badge-' + i.severity + '">' + ui.sevLabel(i.severity) + '</span>' +
        '<div><div class="msg">' + ui.esc(i.message) + '</div>' + (i.where ? '<div class="where">' + ui.esc(i.where) + '</div>' : '') + '</div>' +
        (i.fix ? '<div class="fix"><b>วิธีแก้:</b> ' + ui.esc(i.fix) + '</div>' : '') +
        (i.src && i.src.line && i.entity && S.ENTITIES[i.entity] ? '<button type="button" class="btn btn-sm btn-ghost go" data-issue="' + i.id + '">' + ui.icon('eye') + 'ไปที่แถว</button>' : '') +
        '</li>';
    }).join('') + (list.length > 400 ? '<li class="muted">และอีก ' + (list.length - 400) + ' รายการ</li>' : '');
    ui.$$('[data-issue]', el).forEach(function (b) {
      b.onclick = function () {
        const it = v.issues[+b.dataset.issue];
        activeEnt = it.entity; search = ''; ui.$('#pvSearch').value = '';
        syncTabs(); renderTable(v);
        const ok = table.goToRow(function (r) { return r._src === it.src || (r._src && it.src && r._src.file === it.src.file && r._src.line === it.src.line && r._src.table === it.src.table); });
        if (ok) {
          const tr = ui.$('#pvTable tr[data-line="' + it.src.line + '"][data-file="' + CSS.escape(it.src.file) + '"]');
          if (tr) { tr.classList.add('row-flash'); tr.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }
      };
    });
  }

  function renderTable(v) {
    const def = S.ENTITIES[activeEnt];
    const multiFile = new Set(v.tableInfo.map(function (t) { return t.file; })).size > 1;
    let rows = v.data[activeEnt];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(function (r) { return def.fields.some(function (f) { const x = r[f.key]; return String(Array.isArray(x) ? x.join(' ') : x == null ? '' : x).toLowerCase().indexOf(q) >= 0; }); });
    }
    ui.$('#pvTitle').textContent = 'พรีวิว: ' + def.label;
    ui.$('#pvSub').textContent = 'แสดง ' + U.fmtNum(rows.length) + ' จาก ' + U.fmtNum(v.data[activeEnt].length) + ' รายการ แถวสีแดงคือแถวที่ต้องแก้';
    const badFields = function (r) {
      const set = {};
      r._issues.forEach(function (id) { const it = v.issues[id]; if (it && it.field) set[it.field] = it.message; });
      return set;
    };
    const cols = [{ key: '_line', label: 'แถวที่', num: true, render: function (r) { return '<span class="lineno">' + (r._src ? r._src.line : '') + '</span>'; }, sort: function (r) { return r._src ? r._src.line : 0; } },
      { key: '_file', label: 'ไฟล์', render: function (r) { return '<span class="small muted">' + ui.esc(r._src ? r._src.file : '') + '</span>'; }, sort: function (r) { return r._src ? r._src.file : ''; } }].filter(function (c) { return c.key !== '_file' || multiFile; })
      .concat(def.fields.map(function (f) {
        return {
          key: f.key, label: f.label, num: f.type === 'int',
          render: function (r) {
            let x = r[f.key];
            if (Array.isArray(x)) x = x.join(f.type === 'split' ? '+' : ', ');
            if (activeEnt === 'assignments' && f.key === 'periods' && r.periods && r._blocks) x = r.periods + ' (' + r._blocks.join('+') + ')';
            return ui.esc(x == null ? '' : x);
          },
          cellClass: function (r) { return badFields(r)[f.key] ? 'cell-error' : ''; }
        };
      }))
      .concat([{ key: '_st', label: 'สถานะ', nosort: true, render: function (r) {
        if (!r._issues.length) return '<span class="badge badge-ok">' + ui.icon('check') + 'ถูกต้อง</span>';
        return '<span class="badge badge-error" title="' + ui.esc(r._issues.map(function (id) { return v.issues[id].message; }).join('\n')) + '">ต้องแก้ ' + r._issues.length + '</span>';
      } }]);
    table = ui.dataTable(ui.$('#pvTable'), {
      columns: cols, rows: rows, pageSize: 100, maxHeight: '520px',
      rowClass: function (r) { return r._issues.length ? 'row-error' : ''; },
      rowAttr: function (r) { return r._src ? 'data-line="' + r._src.line + '" data-file="' + ui.esc(r._src.file) + '"' : ''; },
      empty: search ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีข้อมูล' + def.label
    });
  }

  async function confirm() {
    const App = TT.app;
    const v = ensureValidation();
    if (!v.canConfirm) { ui.toast('ยังมีข้อผิดพลาด ' + v.severity.error + ' รายการ', 'error'); return; }
    const btn = ui.$('#confirmImport');
    btn.disabled = true;
    const payload = TT.validator.cleanDataset(v.data);
    const counts = {};
    S.ORDER.forEach(function (e) { counts[e] = payload[e].length; });
    const sources = App.state.importer.jobs.filter(function (j) { return j.status === 'done'; }).map(function (j) { return j.name; });
    const ds = { id: U.uuid(), name: sources.join(', ').slice(0, 200), sources: sources, counts: counts, payload: payload, created_at: new Date().toISOString() };
    const saved = await TT.store.saveDataset(ds);
    ds.validationKey = App.state.validationKey;
    App.setDataset(ds);
    App.state.run = null;
    App.refreshStepper();
    ui.toast('ยืนยันข้อมูลนำเข้าแล้ว ' + S.ORDER.map(function (e) { return S.ENTITIES[e].label + ' ' + counts[e]; }).join(', ') + (saved.where === 'remote' ? ' (บันทึกใน Supabase)' : saved.error ? ' (บันทึกในเครื่อง: ' + saved.error + ')' : ' (บันทึกในเครื่องนี้)'), saved.error ? 'error' : 'ok', 6000);
    btn.disabled = false;
    App.go('run');
  }

  TT.views.preview = {
    init: function () { ui.$('#confirmImport').addEventListener('click', confirm); },
    show: function () { render(); }
  };
})(typeof self !== 'undefined' ? self : globalThis);
