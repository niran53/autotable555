/* storage.js — บันทึกชุดข้อมูลและรอบรันลง Supabase (ผ่าน REST API) หรือในเบราว์เซอร์ถ้ายังไม่ได้ตั้งค่า/เชื่อมต่อไม่ได้ */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const LS_CFG = 'tt.supabase';
  const LS_RUNS = 'tt.runs';
  const LS_RUN = 'tt.run.';
  const LS_DS = 'tt.dataset.';
  const KEEP_LOCAL = 15;

  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

  function config() {
    const saved = lsGet(LS_CFG, null);
    const base = root.TT_CONFIG || {};
    const url = (saved && saved.url) || base.SUPABASE_URL || '';
    const key = (saved && saved.key) || base.SUPABASE_ANON_KEY || '';
    return { url: String(url).replace(/\/+$/, ''), key: String(key).trim(), fromSettings: !!(saved && saved.url) };
  }
  function setConfig(url, key) {
    if (!url && !key) { lsDel(LS_CFG); return; }
    lsSet(LS_CFG, { url: String(url || '').trim(), key: String(key || '').trim() });
  }
  function isRemote() { const c = config(); return !!(c.url && c.key); }

  let lastRemoteError = null;
  const listeners = [];
  function onStatus(fn) { listeners.push(fn); }
  function emit(state, detail) { listeners.forEach(function (fn) { try { fn(state, detail); } catch (e) { /* ignore */ } }); }

  async function api(path, opts) {
    const c = config();
    const headers = { apikey: c.key, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(c.key)) headers.Authorization = 'Bearer ' + c.key;
    Object.assign(headers, (opts && opts.headers) || {});
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    let res;
    try {
      res = await fetch(c.url + '/rest/v1/' + path, { method: (opts && opts.method) || 'GET', headers: headers, body: opts && opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Supabase ไม่ตอบสนองภายใน 15 วินาที' : 'เชื่อมต่อ Supabase ไม่ได้ (ตรวจ URL และอินเทอร์เน็ต)');
    } finally { if (timer) clearTimeout(timer); }
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.message || j.hint || j.error || JSON.stringify(j); } catch (e) { msg = res.statusText; }
      const hint = res.status === 401 ? ' — คีย์ไม่ถูกต้อง' : res.status === 404 || /relation|does not exist|schema cache/i.test(msg) ? ' — ยังไม่ได้สร้างตาราง ให้รัน supabase/schema.sql ใน SQL Editor' : res.status === 403 ? ' — ถูกปฏิเสธโดย Row Level Security ตรวจ policy ใน schema.sql' : '';
      throw new Error('Supabase ตอบกลับ ' + res.status + ': ' + msg + hint);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function withFallback(remoteFn, localFn) {
    if (!isRemote()) return { data: localFn(), where: 'local' };
    try {
      const data = await remoteFn();
      if (lastRemoteError) { lastRemoteError = null; emit('remote'); }
      return { data: data, where: 'remote' };
    } catch (e) {
      lastRemoteError = e.message;
      emit('error', e.message);
      return { data: localFn(), where: 'local', error: e.message };
    }
  }

  function summaryOf(run) {
    return {
      id: run.id, dataset_id: run.dataset_id, status: run.status, confirmed: !!run.confirmed, confirmed_at: run.confirmed_at || null,
      started_at: run.started_at, finished_at: run.finished_at || null, duration_ms: run.duration_ms || null,
      stats: run.stats || null, error: run.error || null, sources: run.sources || [], counts: run.counts || null
    };
  }

  function localSaveRun(run) {
    const idx = lsGet(LS_RUNS, []).filter(function (r) { return r.id !== run.id; });
    idx.unshift(summaryOf(run));
    while (idx.length > KEEP_LOCAL) { const old = idx.pop(); lsDel(LS_RUN + old.id); }
    lsSet(LS_RUNS, idx);
    const full = { id: run.id, settings: run.settings, result: run.result || null, dataset_id: run.dataset_id };
    if (!lsSet(LS_RUN + run.id, full)) {
      // พื้นที่เต็ม: ลบรอบเก่าแล้วลองใหม่
      while (idx.length > 1) { const old = idx.pop(); lsDel(LS_RUN + old.id); }
      lsSet(LS_RUNS, idx);
      lsSet(LS_RUN + run.id, full);
    }
    return run.id;
  }

  const store = {
    config: config, setConfig: setConfig, isRemote: isRemote, onStatus: onStatus,
    get lastError() { return lastRemoteError; },

    async test() {
      if (!isRemote()) throw new Error('ยังไม่ได้ใส่ Supabase URL และคีย์');
      await api('runs?select=id&limit=1');
      await api('datasets?select=id&limit=1');
      lastRemoteError = null; emit('remote');
      return true;
    },

    async saveDataset(ds) {
      // ds: {id, name, sources, counts, payload, created_at}
      lsSet(LS_DS + ds.id, ds);
      return withFallback(function () {
        return api('datasets?on_conflict=id', { method: 'POST', body: [ds], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      }, function () { return ds.id; });
    },

    async getDataset(id) {
      const local = lsGet(LS_DS + id, null);
      if (local) return local;
      if (!isRemote()) return null;
      const rows = await api('datasets?id=eq.' + encodeURIComponent(id) + '&select=*');
      return rows && rows[0] || null;
    },

    async saveRun(run) {
      localSaveRun(run);
      return withFallback(function () {
        const body = Object.assign(summaryOf(run), { settings: run.settings, result: run.result || null });
        return api('runs?on_conflict=id', { method: 'POST', body: [body], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      }, function () { return run.id; });
    },

    async listRuns() {
      const local = lsGet(LS_RUNS, []);
      if (!isRemote()) return { runs: local, where: 'local' };
      try {
        const rows = await api('runs?select=id,dataset_id,status,confirmed,confirmed_at,started_at,finished_at,duration_ms,stats,error,sources,counts&order=started_at.desc&limit=50');
        const seen = {};
        rows.forEach(function (r) { seen[r.id] = true; });
        const merged = rows.concat(local.filter(function (r) { return !seen[r.id]; }).map(function (r) { return Object.assign({ localOnly: true }, r); }));
        merged.sort(function (a, b) { return String(b.started_at).localeCompare(String(a.started_at)); });
        return { runs: merged, where: 'remote' };
      } catch (e) {
        lastRemoteError = e.message; emit('error', e.message);
        return { runs: local, where: 'local', error: e.message };
      }
    },

    async getRun(id) {
      const sum = lsGet(LS_RUNS, []).find(function (r) { return r.id === id; });
      const full = lsGet(LS_RUN + id, null);
      if (sum && full) return Object.assign({}, sum, full);
      if (!isRemote()) return null;
      const rows = await api('runs?id=eq.' + encodeURIComponent(id) + '&select=*');
      return rows && rows[0] || null;
    },

    async deleteLocalAll() {
      lsGet(LS_RUNS, []).forEach(function (r) { lsDel(LS_RUN + r.id); });
      lsDel(LS_RUNS);
    }
  };

  TT.store = store;
})(typeof self !== 'undefined' ? self : globalThis);
