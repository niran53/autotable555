/* ui/settings-view.js — หน้า "ตั้งค่า": การเชื่อมต่อ Supabase และข้อมูลสถานศึกษา */
(function (root) {
  'use strict';
  const TT = root.TT;
  const ui = TT.ui;
  TT.views = TT.views || {};

  function status(kind, text) {
    const cls = kind === 'ok' ? 'callout-ok' : kind === 'error' ? 'callout-error' : 'callout-info';
    ui.$('#dbStatus').innerHTML = '<div class="callout ' + cls + '"' + (kind === 'error' ? ' role="alert"' : '') + '>' + ui.icon(kind === 'ok' ? 'okc' : kind === 'error' ? 'alert' : 'info') + '<div><p>' + ui.esc(text) + '</p></div></div>';
  }

  function isSecretKey(key) {
    if (/service_role|sb_secret_/i.test(key)) return true;
    if (/^eyJ/.test(key)) {
      try { return /service_role/.test(atob((key.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return false; }
    }
    return false;
  }

  async function test() {
    if (!TT.store.isRemote()) { status('info', 'ยังไม่ได้ตั้งค่า Supabase ระบบบันทึกข้อมูลไว้ในเบราว์เซอร์นี้'); return; }
    status('info', 'กำลังทดสอบการเชื่อมต่อ…');
    try {
      await TT.store.test();
      status('ok', 'เชื่อมต่อ Supabase สำเร็จ พบตาราง datasets และ runs พร้อมบันทึกข้อมูล');
    } catch (e) {
      status('error', e.message);
      TT.app.refreshStoreChip('error', e.message);
    }
  }

  function fill() {
    const c = TT.store.config();
    const f = ui.$('#dbForm');
    f.url.value = c.fromSettings ? c.url : '';
    f.key.value = c.fromSettings ? c.key : '';
    f.url.placeholder = !c.fromSettings && c.url ? c.url + ' (จาก js/config.js)' : 'https://xxxx.supabase.co';
    const s = TT.app.state.settings;
    const g = ui.$('#schoolForm');
    g.schoolName.value = s.schoolName || '';
    g.term.value = s.term || '';
    if (!TT.store.isRemote()) status('info', 'ยังไม่ได้ตั้งค่า Supabase ระบบบันทึกข้อมูลไว้ในเบราว์เซอร์นี้ ใส่ค่าใน js/config.js ก่อน deploy หรือกรอกด้านบน');
    else if (!ui.$('#dbStatus').innerHTML) status('info', 'ตั้งค่า Supabase แล้ว' + (c.fromSettings ? ' (จากหน้านี้)' : ' (จาก js/config.js)') + ' กด "ทดสอบการเชื่อมต่อ" เพื่อตรวจ');
  }

  TT.views.settings = {
    init: function () {
      ui.$('#dbSave').addEventListener('click', async function () {
        const f = ui.$('#dbForm');
        const url = f.url.value.trim(), key = f.key.value.trim();
        if (url && !/^https:\/\/[^\s/]+/.test(url)) { status('error', 'URL ต้องขึ้นต้นด้วย https:// เช่น https://abcd1234.supabase.co'); return; }
        if (url && !key) { status('error', 'กรอก anon / publishable key ด้วย'); return; }
        if (isSecretKey(key)) {
          status('error', 'คีย์นี้เป็น service_role / secret key ห้ามใช้ในเว็บ ให้ใช้ anon หรือ publishable key แทน'); return;
        }
        TT.store.setConfig(url, key);
        TT.app.refreshStoreChip();
        await test();
      });
      ui.$('#dbTest').addEventListener('click', test);
      ui.$('#dbClear').addEventListener('click', function () { TT.store.setConfig('', ''); TT.app.refreshStoreChip(); ui.$('#dbStatus').innerHTML = ''; fill(); });
      ui.$('#schoolSave').addEventListener('click', function () {
        const g = ui.$('#schoolForm');
        TT.app.state.settings.schoolName = g.schoolName.value.trim();
        TT.app.state.settings.term = g.term.value.trim();
        TT.app.saveSettings();
        if (TT.app.state.run && !TT.app.state.run.confirmed) {
          TT.app.state.run.settings.schoolName = TT.app.state.settings.schoolName;
          TT.app.state.run.settings.term = TT.app.state.settings.term;
        }
        ui.toast('บันทึกข้อมูลสถานศึกษาแล้ว', 'ok');
      });
      ui.$('#clearLocal').addEventListener('click', async function () {
        await TT.store.deleteLocalAll();
        ui.toast('ล้างประวัติในเครื่องแล้ว', 'ok');
      });
    },
    show: fill
  };
})(typeof self !== 'undefined' ? self : globalThis);
