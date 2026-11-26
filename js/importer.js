/* importer.js — คิวอ่านไฟล์: แต่ละไฟล์มีสถานะ (รอ / กำลังอ่าน / กำลังแปลง / สำเร็จ / ผิดพลาด / ยกเลิก)
   ยกเลิกและลองใหม่ได้รายไฟล์ */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  const SUPPORTED = {
    csv: 'csv', tsv: 'csv', txt: 'csv',
    xlsx: 'xlsx', xls: 'xlsx', ods: 'xlsx',
    json: 'json',
    pdf: 'pdf'
  };
  const MAX_SIZE = 25 * 1024 * 1024;

  const STATUS_TEXT = {
    queued: 'รอคิว', reading: 'กำลังอ่านไฟล์', parsing: 'กำลังแปลงข้อมูล', done: 'อ่านสำเร็จ', error: 'อ่านไม่สำเร็จ', cancelled: 'ยกเลิกแล้ว'
  };

  function createImporter(onChange) {
    const jobs = [];
    let running = 0;

    function emit() { onChange && onChange(jobs.slice()); }

    function add(fileList) {
      Array.from(fileList).forEach(function (file) {
        const ext = U.fileExt(file.name);
        const job = { id: U.uid('job'), file: file, name: file.name, size: file.size, ext: ext, kind: SUPPORTED[ext] || null, status: 'queued', progress: 0, message: '', result: null, error: null, startedAt: null, ms: null };
        jobs.push(job);
        process(job);
      });
      emit();
    }

    function readBuffer(job) {
      return new Promise(function (resolve, reject) {
        const fr = new FileReader();
        job._reader = fr;
        fr.onprogress = function (e) {
          if (e.lengthComputable) { job.progress = 0.6 * e.loaded / e.total; emit(); }
        };
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(new Error('เบราว์เซอร์อ่านไฟล์ไม่ได้ (ไฟล์อาจถูกย้ายหรือถูกล็อก) ลองเลือกไฟล์ใหม่อีกครั้ง')); };
        fr.onabort = function () { reject(new DOMException('ยกเลิก', 'AbortError')); };
        fr.readAsArrayBuffer(job.file);
      });
    }

    async function process(job) {
      job.status = 'queued'; job.progress = 0; job.error = null; job.result = null; job.message = '';
      if (!job.kind) {
        job.status = 'error';
        job.error = { code: 'FILE_UNSUPPORTED', message: 'ไม่รองรับไฟล์ชนิด .' + (job.ext || '?'), fix: 'บันทึกไฟล์เป็น .csv, .xlsx, .json หรือ .pdf แล้วนำเข้าใหม่' };
        emit(); return;
      }
      if (job.size === 0) {
        job.status = 'error';
        job.error = { code: 'FILE_EMPTY', message: 'ไฟล์ว่างเปล่า (0 ไบต์)', fix: 'ตรวจว่าบันทึกไฟล์ก่อนปิดโปรแกรม แล้วเลือกไฟล์ใหม่' };
        emit(); return;
      }
      if (job.size > MAX_SIZE) {
        job.status = 'error';
        job.error = { code: 'FILE_TOO_LARGE', message: 'ไฟล์ใหญ่เกิน 25 MB', fix: 'แยกข้อมูลเป็นหลายไฟล์ หรือลบแผ่นงานที่ไม่เกี่ยวข้อง' };
        emit(); return;
      }
      const ctrl = new AbortController();
      job._ctrl = ctrl;
      job.startedAt = Date.now();
      running++;
      try {
        job.status = 'reading'; emit();
        const buf = await readBuffer(job);
        if (ctrl.signal.aborted) throw new DOMException('ยกเลิก', 'AbortError');
        job.status = 'parsing'; job.progress = 0.65; emit();
        // ให้หน้าจออัปเดตสถานะก่อนเริ่มแปลงไฟล์ใหญ่
        await new Promise(function (r) { setTimeout(r, 30); });
        let res;
        if (job.kind === 'csv') res = TT.parsers.csv.parse(buf, job.name);
        else if (job.kind === 'xlsx') res = await TT.parsers.xlsx.parse(buf, job.name);
        else if (job.kind === 'json') res = TT.parsers.json.parse(buf, job.name);
        else if (job.kind === 'pdf') res = await TT.parsers.pdf.parse(buf, job.name, function (f) { job.progress = 0.65 + 0.3 * f; emit(); }, ctrl.signal);
        if (ctrl.signal.aborted) throw new DOMException('ยกเลิก', 'AbortError');
        if (!res.tables.length) {
          throw Object.assign(new Error('ไม่พบตารางข้อมูลในไฟล์'), { fix: 'ตรวจว่าแถวแรกเป็นหัวคอลัมน์ และมีข้อมูลอย่างน้อย 1 แถว (ดูแม่แบบ)' });
        }
        job.result = res;
        job.status = 'done'; job.progress = 1;
        const rows = res.tables.reduce(function (s, t) { return s + Math.max(0, t.rows.length - 1); }, 0);
        job.message = res.tables.length + ' ตาราง, ' + U.fmtNum(rows) + ' แถวข้อมูล' + (res.encoding && res.encoding !== 'UTF-8' ? ' (รหัสอักษร ' + res.encoding + ')' : '');
      } catch (e) {
        if (e && e.name === 'AbortError') { job.status = 'cancelled'; job.progress = 0; job.message = 'ยกเลิกการอ่านไฟล์นี้แล้ว กด "ลองใหม่" เพื่ออ่านอีกครั้ง'; }
        else {
          job.status = 'error';
          job.error = { code: 'FILE_PARSE', message: (e && e.message) || String(e), fix: (e && e.fix) || 'ตรวจรูปแบบไฟล์ให้ตรงกับแม่แบบ แล้วกด "ลองใหม่"' };
        }
      } finally {
        running--;
        job.ms = Date.now() - job.startedAt;
        job._reader = null; job._ctrl = null;
        emit();
      }
    }

    function find(id) { return jobs.find(function (j) { return j.id === id; }); }

    return {
      add: add,
      get jobs() { return jobs.slice(); },
      cancel: function (id) {
        const j = find(id);
        if (!j) return;
        if (j._ctrl) j._ctrl.abort();
        if (j._reader && j._reader.readyState === 1) { try { j._reader.abort(); } catch (e) { /* ignore */ } }
        if (j.status === 'queued') { j.status = 'cancelled'; emit(); }
      },
      retry: function (id) { const j = find(id); if (j && (j.status === 'error' || j.status === 'cancelled' || j.status === 'done')) process(j); },
      remove: function (id) { const i = jobs.findIndex(function (j) { return j.id === id; }); if (i >= 0) { this.cancel(id); jobs.splice(i, 1); emit(); } },
      clear: function () { jobs.slice().forEach(function (j) { if (j._ctrl) j._ctrl.abort(); }); jobs.length = 0; emit(); },
      get busy() { return running > 0 || jobs.some(function (j) { return j.status === 'reading' || j.status === 'parsing'; }); },
      sources: function () {
        return jobs.filter(function (j) { return j.status === 'done'; }).map(function (j) { return { file: j.name, ext: j.ext, tables: j.result.tables, settings: j.result.settings || null }; });
      }
    };
  }

  TT.importer = { create: createImporter, STATUS_TEXT: STATUS_TEXT, SUPPORTED: SUPPORTED };
})(typeof self !== 'undefined' ? self : globalThis);
