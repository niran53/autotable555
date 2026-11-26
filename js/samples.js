/* samples.js — สร้างชุดข้อมูลทดสอบหลายขนาด (เล็ก/กลาง/ใหญ่) และชุดที่มีข้อผิดพลาดเพื่อสาธิตการตรวจข้อมูล
   ผลลัพธ์คงที่ทุกครั้ง (ใช้ seed) จึงตรวจซ้ำได้ */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  const FIRST = ['สมชาย', 'สมหญิง', 'วิไลวรรณ', 'ประเสริฐ', 'กาญจนา', 'ธนพล', 'ศิริพร', 'อนุชา', 'พรทิพย์', 'วีระพงษ์', 'นภัสสร', 'สุรชัย', 'จันทร์เพ็ญ', 'ชัยวัฒน์', 'รัตนา', 'ปิยะพงษ์', 'อรุณี', 'กิตติศักดิ์', 'มาลัย', 'ณัฐวุฒิ', 'สุภาพร', 'เอกชัย', 'ดวงใจ', 'ภานุวัฒน์', 'ปวีณา', 'ธีรศักดิ์', 'อัญชลี', 'วรวุฒิ', 'เบญจมาศ', 'สุทธิพงษ์', 'ลัดดา', 'ชาญวิทย์', 'นิตยา', 'พงศกร', 'สายสุนีย์', 'อภิชาติ', 'ศุภลักษณ์', 'ไพโรจน์', 'กมลชนก', 'ยุทธนา'];
  const LAST = ['ใจดี', 'ศรีสุข', 'บุญมา', 'แก้วประเสริฐ', 'ทองคำ', 'สุวรรณรัตน์', 'วงศ์ไทย', 'พันธ์ุดี', 'จันทร์หอม', 'มีสุข', 'รักษ์ธรรม', 'เพชรรัตน์', 'สมบูรณ์ชัย', 'อินทร์แก้ว', 'ชัยมงคล', 'ศรีวิชัย', 'นาคสวัสดิ์', 'บุญเรือง', 'ทองดี', 'แสงอรุณ'];
  const POSITIONS = ['ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ครูผู้ช่วย', 'พนักงานราชการ (ครู)', 'ครูอัตราจ้าง'];

  const GENERAL = [
    { id: '20000-1101', name: 'ภาษาไทยพื้นฐาน', t: 1, p: 0, n: 1, type: 'ทั่วไป' },
    { id: '20000-1201', name: 'ภาษาอังกฤษในชีวิตจริง', t: 0, p: 2, n: 1, type: 'ทั่วไป' },
    { id: '20000-1401', name: 'คณิตศาสตร์พื้นฐานอาชีพ', t: 2, p: 0, n: 2, type: 'ทั่วไป' },
    { id: '20000-1301', name: 'วิทยาศาสตร์เพื่อพัฒนาทักษะชีวิต', t: 1, p: 2, n: 2, type: 'ทั่วไป' },
    { id: '20000-1501', name: 'หน้าที่พลเมืองและศีลธรรม', t: 1, p: 0, n: 1, type: 'ทั่วไป' },
    { id: '20000-1601', name: 'พลศึกษาเพื่อพัฒนาสุขภาพ', t: 0, p: 2, n: 1, type: 'สนามกีฬา' }
  ];
  const DEPTS = [
    { code: 'คธ', name: 'คอมพิวเตอร์ธุรกิจ', type: 'คอมพิวเตอร์', subjects: [
      { id: '20204-2001', name: 'คอมพิวเตอร์และสารสนเทศเพื่องานอาชีพ', t: 1, p: 2, n: 2 },
      { id: '20204-2003', name: 'ระบบปฏิบัติการเบื้องต้น', t: 1, p: 2, n: 2 },
      { id: '20204-2004', name: 'เครือข่ายคอมพิวเตอร์เบื้องต้น', t: 1, p: 2, n: 2 },
      { id: '20204-2107', name: 'การเขียนโปรแกรมคอมพิวเตอร์', t: 1, p: 4, n: 3 },
      { id: '20204-2105', name: 'การออกแบบเว็บไซต์', t: 1, p: 4, n: 3 }
    ] },
    { code: 'ทส', name: 'เทคโนโลยีสารสนเทศ', type: 'คอมพิวเตอร์', subjects: [
      { id: '31901-2001', name: 'การเขียนโปรแกรมเชิงวัตถุ', t: 1, p: 4, n: 3 },
      { id: '31901-2013', name: 'การพัฒนาไฮบริดแอพพลิเคชั่น', t: 1, p: 4, n: 3 },
      { id: '31901-2003', name: 'ระบบฐานข้อมูล', t: 2, p: 2, n: 3 },
      { id: '31901-2005', name: 'การวิเคราะห์และออกแบบระบบ', t: 2, p: 2, n: 3 },
      { id: '31901-2007', name: 'ความปลอดภัยระบบเครือข่าย', t: 1, p: 3, n: 2 }
    ] },
    { code: 'ชฟ', name: 'ช่างไฟฟ้ากำลัง', type: 'ปฏิบัติการไฟฟ้า', subjects: [
      { id: '20104-2001', name: 'เขียนแบบไฟฟ้า', t: 1, p: 3, n: 2 },
      { id: '20104-2002', name: 'วงจรไฟฟ้ากระแสตรง', t: 1, p: 3, n: 2 },
      { id: '20104-2005', name: 'การติดตั้งไฟฟ้าในอาคาร', t: 1, p: 4, n: 3 },
      { id: '20104-2008', name: 'เครื่องกลไฟฟ้า', t: 1, p: 3, n: 2 },
      { id: '20104-2010', name: 'เครื่องวัดไฟฟ้า', t: 1, p: 3, n: 2 }
    ] },
    { code: 'ชย', name: 'ช่างยนต์', type: 'โรงฝึกยนต์', subjects: [
      { id: '20101-2001', name: 'งานเครื่องยนต์เล็ก', t: 1, p: 3, n: 2 },
      { id: '20101-2003', name: 'งานเครื่องยนต์แก๊สโซลีน', t: 1, p: 4, n: 3 },
      { id: '20101-2004', name: 'งานเครื่องยนต์ดีเซล', t: 1, p: 4, n: 3 },
      { id: '20101-2005', name: 'งานส่งกำลังรถยนต์', t: 1, p: 3, n: 2 },
      { id: '20101-2006', name: 'งานไฟฟ้ารถยนต์', t: 1, p: 3, n: 2 }
    ] },
    { code: 'บช', name: 'การบัญชี', type: 'ทั่วไป', subjects: [
      { id: '20201-2001', name: 'การบัญชีเบื้องต้น 1', t: 2, p: 2, n: 3 },
      { id: '20201-2002', name: 'การบัญชีเบื้องต้น 2', t: 2, p: 2, n: 3 },
      { id: '20201-2003', name: 'การบัญชีห้างหุ้นส่วน', t: 2, p: 2, n: 3 },
      { id: '20201-2005', name: 'โปรแกรมสำเร็จรูปทางการบัญชี', t: 1, p: 3, n: 2, type: 'คอมพิวเตอร์' },
      { id: '20201-2008', name: 'การบัญชีต้นทุน', t: 2, p: 2, n: 3 }
    ] },
    { code: 'กต', name: 'การตลาด', type: 'ทั่วไป', subjects: [
      { id: '20202-2001', name: 'หลักการตลาด', t: 2, p: 0, n: 2 },
      { id: '20202-2002', name: 'การขายเบื้องต้น', t: 1, p: 2, n: 2 },
      { id: '20202-2004', name: 'การโฆษณาและส่งเสริมการขาย', t: 1, p: 2, n: 2 },
      { id: '20202-2006', name: 'การตลาดดิจิทัล', t: 1, p: 3, n: 2, type: 'คอมพิวเตอร์' },
      { id: '20202-2008', name: 'การบริการลูกค้า', t: 1, p: 2, n: 2 }
    ] }
  ];
  const LEVELS = ['ปวช.1', 'ปวช.2', 'ปวช.3', 'ปวส.1', 'ปวส.2'];

  const SIZES = {
    small: { label: 'ชุดเล็ก', depts: 2, levels: 2, sections: 1 },
    medium: { label: 'ชุดกลาง', depts: 4, levels: 3, sections: 2 },
    large: { label: 'ชุดใหญ่', depts: 6, levels: 5, sections: 2 }
  };

  function generate(size) {
    const cfg = SIZES[size] || SIZES.small;
    const rnd = U.rng(size === 'large' ? 777 : size === 'medium' ? 555 : 333);
    const pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    const depts = DEPTS.slice(0, cfg.depts);
    const subjects = [];
    GENERAL.forEach(function (s) { subjects.push({ subject_id: s.id, name: s.name, theory: s.t, practice: s.p, credit: s.n, room_type: s.type }); });
    depts.forEach(function (d) { d.subjects.forEach(function (s) { subjects.push({ subject_id: s.id, name: s.name, theory: s.t, practice: s.p, credit: s.n, room_type: s.type || d.type }); }); });
    const subjMap = {}; subjects.forEach(function (s) { subjMap[s.subject_id] = s; });

    // กลุ่มเรียน
    const groups = [];
    depts.forEach(function (d) {
      for (let l = 0; l < cfg.levels; l++) {
        for (let sec = 1; sec <= cfg.sections; sec++) {
          const lv = LEVELS[l];
          const code = (lv.indexOf('ปวส') === 0 ? 'S' : 'C') + (l % 3 + 1);
          groups.push({ group_id: d.code + '-' + code + '/' + sec, name: lv + ' ' + d.name + ' กลุ่ม ' + sec, level: lv, students: 28 + Math.floor(rnd() * 13), department: d.name, _dept: d });
        }
      }
    });

    // วิชาที่แต่ละกลุ่มเรียน: วิชาสามัญ 4 วิชา + วิชาชีพของแผนก
    const plan = [];
    groups.forEach(function (g, gi) {
      const shuffled = GENERAL.slice();
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp; }
      const gen = shuffled.slice(0, 4).map(function (s) { return s.id; });
      const prof = g._dept.subjects.map(function (s) { return s.id; });
      gen.concat(prof).forEach(function (sid) { plan.push({ g: g, s: subjMap[sid] }); });
    });

    // ครู: สายสามัญ + สายวิชาชีพแต่ละแผนก จำนวนพอเหมาะกับภาระ
    const teachers = [];
    let tid = 1;
    function newTeacher(dept) {
      const t = {
        teacher_id: 'T' + String(tid++).padStart(3, '0'),
        name: (rnd() < 0.5 ? 'นาย' : rnd() < 0.5 ? 'นางสาว' : 'นาง') + pick(FIRST) + ' ' + pick(LAST),
        position: pick(POSITIONS), department: dept,
        max_periods: 20 + Math.floor(rnd() * 3) * 2,
        unavailable: ''
      };
      const r = rnd();
      if (r < 0.12) t.unavailable = 'พฤ1-4';
      else if (r < 0.2) t.unavailable = 'ศ5-8';
      else if (r < 0.25) t.unavailable = 'จ1-2';
      teachers.push(t);
      return t;
    }
    const load = {};
    function assignTeacher(dept, periods) {
      const pool = teachers.filter(function (t) { return t.department === dept; });
      pool.sort(function (a, b) { return (load[a.teacher_id] || 0) - (load[b.teacher_id] || 0); });
      let t = pool.find(function (x) { return (load[x.teacher_id] || 0) + periods <= x.max_periods - 2; });
      if (!t) t = newTeacher(dept);
      load[t.teacher_id] = (load[t.teacher_id] || 0) + periods;
      return t;
    }
    const assignments = [];
    plan.forEach(function (pl) {
      const dept = GENERAL.some(function (x) { return x.id === pl.s.subject_id; }) ? 'สามัญสัมพันธ์' : pl.g._dept.name;
      const periods = pl.s.theory + pl.s.practice;
      const t = assignTeacher(dept, periods);
      assignments.push({ group_id: pl.g.group_id, subject_id: pl.s.subject_id, teacher_id: t.teacher_id, periods: periods, room_id: '', split: '' });
    });

    // ห้องเรียน: คำนวณจากความต้องการของแต่ละประเภท ให้ใช้ไม่เกินราว 70% ของเวลา
    const demand = {};
    assignments.forEach(function (a) { const s = subjMap[a.subject_id]; demand[s.room_type] = (demand[s.room_type] || 0) + a.periods; });
    const avail = 38;
    const rooms = [];
    const buildings = { 'ทั่วไป': 'อาคาร 1', 'คอมพิวเตอร์': 'อาคาร 3', 'ปฏิบัติการไฟฟ้า': 'อาคารช่างไฟฟ้า', 'โรงฝึกยนต์': 'อาคารช่างยนต์', 'สนามกีฬา': 'อาคารพลศึกษา' };
    const prefix = { 'ทั่วไป': 'R1', 'คอมพิวเตอร์': 'COM', 'ปฏิบัติการไฟฟ้า': 'EL', 'โรงฝึกยนต์': 'AU', 'สนามกีฬา': 'GYM' };
    Object.keys(demand).forEach(function (type) {
      const n = Math.max(1, Math.ceil(demand[type] / (avail * 0.68)));
      for (let i = 1; i <= n; i++) {
        rooms.push({
          room_id: prefix[type] + String(i).padStart(2, '0'),
          name: (type === 'ทั่วไป' ? 'ห้องเรียน ' : type === 'สนามกีฬา' ? 'โรงยิม ' : 'ห้อง' + type + ' ') + i,
          type: type, capacity: type === 'สนามกีฬา' ? 80 : 40 + Math.floor(rnd() * 2) * 5, building: buildings[type]
        });
      }
    });

    // วิชาปฏิบัติมากให้เรียนต่อเนื่อง (ตัวอย่างการกำหนดแบ่งคาบ)
    assignments.forEach(function (a) { if (a.periods === 5 && rnd() < 0.5) a.split = '2+3'; });
    // ตัวอย่างการกำหนดห้องประจำ
    if (assignments.length > 3) {
      const fx = assignments.find(function (a) { return subjMap[a.subject_id].room_type === 'ทั่วไป'; });
      if (fx) fx.room_id = rooms.find(function (r) { return r.type === 'ทั่วไป'; }).room_id;
    }

    groups.forEach(function (g) { delete g._dept; });
    return { teachers: teachers, rooms: rooms, subjects: subjects, groups: groups, assignments: assignments };
  }

  /* ชุดที่มีข้อผิดพลาดตั้งใจ: ใช้สาธิตข้อความแจ้งข้อผิดพลาดและวิธีแก้ */
  function generateWithErrors() {
    const d = generate('small');
    d.teachers.push({ teacher_id: d.teachers[1].teacher_id, name: 'นายทดสอบ รหัสซ้ำ', position: 'ครู', department: 'คอมพิวเตอร์ธุรกิจ', max_periods: 20, unavailable: '' });
    d.teachers.push({ teacher_id: 'T900', name: '', position: 'ครูอัตราจ้าง', department: 'สามัญสัมพันธ์', max_periods: 18, unavailable: 'จันทร์เช้า' });
    d.rooms.push({ room_id: 'R150', name: 'ห้องประชุมเล็ก', type: 'ทั่วไป', capacity: 'สามสิบ', building: 'อาคาร 1' });
    d.rooms.push({ room_id: d.rooms[0].room_id, name: 'ห้องเรียนซ้ำ', type: 'ทั่วไป', capacity: 40, building: 'อาคาร 1' });
    d.assignments[2].room_id = 'R999';
    d.assignments[4].teacher_id = 'T099';
    d.assignments[5].subject_id = '20204-9999';
    d.assignments[6].split = '2+2';
    d.assignments.push({ group_id: 'คธ-C9/9', subject_id: d.subjects[0].subject_id, teacher_id: d.teachers[0].teacher_id, periods: 2, room_id: '', split: '' });
    return d;
  }

  /* ---------- แปลงเป็นไฟล์ ---------- */
  const SHEET_TITLES = { teachers: 'ครู', rooms: 'ห้องเรียน', subjects: 'รายวิชา', groups: 'กลุ่มเรียน', assignments: 'การมอบหมายสอน' };
  function toTables(d) {
    return TT.schema.ORDER.map(function (ent) {
      const fields = TT.schema.ENTITIES[ent].fields;
      const rows = [fields.map(function (f) { return f.label; })];
      (d[ent] || []).forEach(function (r) {
        rows.push(fields.map(function (f) { const v = r[f.key]; return v == null ? '' : Array.isArray(v) ? v.join('|') : v; }));
      });
      return { entity: ent, title: SHEET_TITLES[ent], rows: rows };
    });
  }
  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(d) {
    return '﻿' + toTables(d).map(function (t) {
      return '#' + t.title + '\n' + t.rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n');
    }).join('\n\n') + '\n';
  }
  function toCsvSingle(rows) {
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function toXlsx(d) {
    return TT.parsers.xlsx.writeXlsx(toTables(d).map(function (t) {
      return { name: t.title, rows: t.rows, widths: t.rows[0].map(function (h, i) { return i === 1 ? 34 : Math.max(12, String(h).length + 4); }) };
    }));
  }
  function toJson(d) {
    const out = {};
    TT.schema.ORDER.forEach(function (ent) { out[ent] = d[ent]; });
    return JSON.stringify(out, null, 2);
  }
  /* แม่แบบเปล่าพร้อมตัวอย่างหนึ่งแถว */
  function template() {
    return {
      teachers: [{ teacher_id: 'T001', name: 'นางสาวตัวอย่าง ใจดี', position: 'ครูชำนาญการ', department: 'คอมพิวเตอร์ธุรกิจ', max_periods: 22, unavailable: 'พฤ1-4' }],
      rooms: [{ room_id: 'COM01', name: 'ห้องคอมพิวเตอร์ 1', type: 'คอมพิวเตอร์', capacity: 40, building: 'อาคาร 3' }],
      subjects: [{ subject_id: '20204-2001', name: 'คอมพิวเตอร์และสารสนเทศเพื่องานอาชีพ', theory: 1, practice: 2, credit: 2, room_type: 'คอมพิวเตอร์' }],
      groups: [{ group_id: 'คธ-C1/1', name: 'ปวช.1 คอมพิวเตอร์ธุรกิจ กลุ่ม 1', level: 'ปวช.1', students: 35, department: 'คอมพิวเตอร์ธุรกิจ' }],
      assignments: [{ group_id: 'คธ-C1/1', subject_id: '20204-2001', teacher_id: 'T001', periods: 3, room_id: '', split: '' }]
    };
  }

  TT.samples = { generate: generate, generateWithErrors: generateWithErrors, template: template, toTables: toTables, toCsv: toCsv, toCsvSingle: toCsvSingle, toXlsx: toXlsx, toJson: toJson, SIZES: SIZES, SHEET_TITLES: SHEET_TITLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
