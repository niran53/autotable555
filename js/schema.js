/* schema.js — โครงสร้างข้อมูลที่นำเข้า, ชื่อหัวคอลัมน์ที่ยอมรับ และค่าตั้งต้นของการจัดตาราง */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;

  const ENTITIES = {
    teachers: {
      label: 'ครู', key: 'teacher_id',
      names: ['teachers', 'teacher', 'ครู', 'ข้อมูลครู', 'อาจารย์', 'ผู้สอน'],
      fields: [
        { key: 'teacher_id', label: 'รหัสครู', required: true, type: 'id', aliases: ['รหัสครู', 'รหัสผู้สอน', 'id', 'teacherid', 'teachercode', 'รหัส'] },
        { key: 'name', label: 'ชื่อ-สกุล', required: true, aliases: ['ชื่อสกุล', 'ชื่อนามสกุล', 'ชื่อ', 'ชื่อครู', 'ชื่อผู้สอน', 'name', 'teachername', 'fullname'] },
        { key: 'position', label: 'ตำแหน่ง', aliases: ['ตำแหน่ง', 'position', 'title', 'วิทยฐานะ'] },
        { key: 'department', label: 'แผนกวิชา', aliases: ['แผนกวิชา', 'แผนก', 'department', 'dept', 'สาขา'] },
        { key: 'max_periods', label: 'ภาระสอนสูงสุด (คาบ/สัปดาห์)', type: 'int', min: 1, max: 80, aliases: ['ภาระสอนสูงสุด', 'ภาระสอนสูงสุดคาบสัปดาห์', 'คาบสูงสุด', 'maxperiods', 'max', 'maxload'] },
        { key: 'unavailable', label: 'เวลาไม่ว่าง', type: 'slots', aliases: ['เวลาไม่ว่าง', 'ไม่ว่าง', 'unavailable', 'busy', 'notavailable'] }
      ]
    },
    rooms: {
      label: 'ห้องเรียน', key: 'room_id',
      names: ['rooms', 'room', 'ห้อง', 'ห้องเรียน', 'ข้อมูลห้อง'],
      fields: [
        { key: 'room_id', label: 'รหัสห้อง', required: true, type: 'id', aliases: ['รหัสห้อง', 'ห้อง', 'id', 'roomid', 'roomcode', 'เลขห้อง'] },
        { key: 'name', label: 'ชื่อห้อง', aliases: ['ชื่อห้อง', 'name', 'roomname'] },
        { key: 'type', label: 'ประเภทห้อง', aliases: ['ประเภทห้อง', 'ประเภท', 'type', 'roomtype'] },
        { key: 'capacity', label: 'ความจุ (คน)', required: true, type: 'int', min: 1, max: 1000, aliases: ['ความจุ', 'ความจุคน', 'จำนวนที่นั่ง', 'capacity', 'seats'] },
        { key: 'building', label: 'อาคาร', aliases: ['อาคาร', 'ตึก', 'building'] }
      ]
    },
    subjects: {
      label: 'รายวิชา', key: 'subject_id',
      names: ['subjects', 'subject', 'courses', 'วิชา', 'รายวิชา', 'ข้อมูลวิชา'],
      fields: [
        { key: 'subject_id', label: 'รหัสวิชา', required: true, type: 'id', aliases: ['รหัสวิชา', 'id', 'subjectid', 'subjectcode', 'code', 'coursecode'] },
        { key: 'name', label: 'ชื่อวิชา', required: true, aliases: ['ชื่อวิชา', 'วิชา', 'name', 'subjectname', 'coursename'] },
        { key: 'theory', label: 'ทฤษฎี (ท)', type: 'int', min: 0, max: 40, aliases: ['ทฤษฎี', 'ท', 'theory', 't'] },
        { key: 'practice', label: 'ปฏิบัติ (ป)', type: 'int', min: 0, max: 40, aliases: ['ปฏิบัติ', 'ป', 'practice', 'p'] },
        { key: 'credit', label: 'หน่วยกิต (น)', type: 'int', min: 0, max: 20, aliases: ['หน่วยกิต', 'น', 'credit', 'credits', 'n'] },
        { key: 'room_type', label: 'ประเภทห้องที่ใช้', aliases: ['ประเภทห้องที่ใช้', 'ประเภทห้อง', 'roomtype', 'requiredroomtype', 'ห้องที่ใช้'] }
      ]
    },
    groups: {
      label: 'กลุ่มเรียน', key: 'group_id',
      names: ['groups', 'group', 'classes', 'sections', 'กลุ่ม', 'กลุ่มเรียน', 'ชั้นเรียน', 'ห้องเรียนนักเรียน'],
      fields: [
        { key: 'group_id', label: 'รหัสกลุ่ม', required: true, type: 'id', aliases: ['รหัสกลุ่ม', 'รหัสกลุ่มเรียน', 'id', 'groupid', 'classid', 'sectionid'] },
        { key: 'name', label: 'ชื่อกลุ่มเรียน', required: true, aliases: ['ชื่อกลุ่มเรียน', 'ชื่อกลุ่ม', 'กลุ่มเรียน', 'name', 'groupname', 'classname'] },
        { key: 'level', label: 'ระดับชั้น', aliases: ['ระดับชั้น', 'ระดับ', 'ชั้น', 'level', 'grade'] },
        { key: 'students', label: 'จำนวนผู้เรียน', required: true, type: 'int', min: 1, max: 500, aliases: ['จำนวนผู้เรียน', 'จำนวนนักเรียน', 'จำนวนนักศึกษา', 'จำนวน', 'students', 'size'] },
        { key: 'department', label: 'แผนกวิชา', aliases: ['แผนกวิชา', 'แผนก', 'department', 'dept', 'สาขา'] }
      ]
    },
    assignments: {
      label: 'การมอบหมายสอน', key: null,
      names: ['assignments', 'assignment', 'teaching', 'load', 'การสอน', 'การมอบหมายสอน', 'ภาระสอน', 'มอบหมายสอน'],
      fields: [
        { key: 'group_id', label: 'รหัสกลุ่ม', required: true, type: 'ref', ref: 'groups', aliases: ['รหัสกลุ่ม', 'รหัสกลุ่มเรียน', 'กลุ่ม', 'groupid', 'classid', 'group'] },
        { key: 'subject_id', label: 'รหัสวิชา', required: true, type: 'ref', ref: 'subjects', aliases: ['รหัสวิชา', 'วิชา', 'subjectid', 'subject', 'subjectcode'] },
        { key: 'teacher_id', label: 'รหัสครู', required: true, type: 'refs', ref: 'teachers', aliases: ['รหัสครู', 'ครู', 'ผู้สอน', 'teacherid', 'teacher', 'teachers'] },
        { key: 'periods', label: 'คาบ/สัปดาห์', type: 'int', min: 1, max: 40, aliases: ['คาบสัปดาห์', 'คาบ', 'จำนวนคาบ', 'periods', 'periodsperweek', 'hours'] },
        { key: 'room_id', label: 'ห้องที่กำหนด', type: 'ref', ref: 'rooms', aliases: ['ห้องที่กำหนด', 'รหัสห้อง', 'ห้อง', 'roomid', 'room', 'fixedroom'] },
        { key: 'split', label: 'แบ่งคาบ', type: 'split', aliases: ['แบ่งคาบ', 'การแบ่งคาบ', 'split', 'blocks', 'pattern'] }
      ]
    }
  };

  const ORDER = ['teachers', 'rooms', 'subjects', 'groups', 'assignments'];

  /* ตาราง alias → field ของแต่ละ entity */
  const aliasMap = {};
  for (const ent of ORDER) {
    aliasMap[ent] = {};
    for (const f of ENTITIES[ent].fields) {
      aliasMap[ent][U.normKey(f.key)] = f.key;
      aliasMap[ent][U.normKey(f.label)] = f.key;
      for (const a of f.aliases) aliasMap[ent][U.normKey(a)] = f.key;
    }
  }

  function entityFromName(name) {
    const n = U.normKey(String(name || '').replace(/\.[a-z0-9]+$/i, ''));
    if (!n) return null;
    for (const ent of ORDER) {
      for (const nm of ENTITIES[ent].names) {
        const k = U.normKey(nm);
        if (n === k) return ent;
      }
    }
    // ชื่อไฟล์ที่มีคำนำหน้า/ต่อท้าย เช่น "sample-small-teachers"
    for (const ent of ORDER) {
      for (const nm of ENTITIES[ent].names) {
        const k = U.normKey(nm);
        if (k.length >= 4 && n.indexOf(k) >= 0) return ent;
      }
    }
    return null;
  }

  /* จับคู่หัวคอลัมน์กับ field: คืน {map:[fieldKey|null], matched, missingRequired} */
  function mapHeaders(ent, headers) {
    const map = headers.map(function (h) { return aliasMap[ent][U.normKey(h)] || null; });
    // ไม่ให้ field ซ้ำ: ใช้คอลัมน์แรกที่เจอ
    const seen = {};
    for (let i = 0; i < map.length; i++) {
      if (!map[i]) continue;
      if (seen[map[i]]) map[i] = null; else seen[map[i]] = true;
    }
    const missingRequired = ENTITIES[ent].fields.filter(function (f) { return f.required && !seen[f.key]; });
    return { map: map, matched: Object.keys(seen).length, missingRequired: missingRequired };
  }

  /* เดาว่าตารางนี้เป็นข้อมูลอะไรจากหัวคอลัมน์ */
  function detectEntity(headers, hintName) {
    const byName = entityFromName(hintName);
    if (byName) return { entity: byName, by: 'name' };
    let best = null;
    for (const ent of ORDER) {
      const r = mapHeaders(ent, headers);
      const reqTotal = ENTITIES[ent].fields.filter(function (f) { return f.required; }).length;
      const score = r.matched + (r.missingRequired.length === 0 ? 10 : 0) + (reqTotal - r.missingRequired.length) * 0.5;
      // ให้น้ำหนักคอลัมน์เฉพาะตัว
      const keys = r.map.filter(Boolean);
      let bonus = 0;
      if (ent === 'assignments' && keys.indexOf('group_id') >= 0 && keys.indexOf('subject_id') >= 0) bonus += 5;
      if (ent === 'teachers' && keys.indexOf('teacher_id') >= 0 && keys.indexOf('group_id') < 0) bonus += 2;
      if (ent === 'rooms' && keys.indexOf('capacity') >= 0) bonus += 2;
      if (ent === 'groups' && keys.indexOf('students') >= 0) bonus += 2;
      if (ent === 'subjects' && (keys.indexOf('theory') >= 0 || keys.indexOf('practice') >= 0)) bonus += 2;
      const total = score + bonus;
      if (r.matched > 0 && (!best || total > best.score)) best = { entity: ent, score: total };
    }
    return best ? { entity: best.entity, by: 'headers' } : null;
  }

  function defaultSettings() {
    return {
      schoolName: 'วิทยาลัยตัวอย่าง',
      term: 'ภาคเรียนที่ 2 ปีการศึกษา 2569',
      days: [0, 1, 2, 3, 4],
      periodsPerDay: 8,
      startTime: '08:00',
      periodMinutes: 60,
      breaks: [{ after: 4, minutes: 60, label: 'พักกลางวัน' }],
      blocked: 'พ7-8',
      blockedLabel: 'กิจกรรมชมรม',
      maxBlock: 4,
      noCrossBreak: true,
      oneSessionPerDay: true,
      attempts: 20,
      timeLimitSec: 20,
      seed: 0
    };
  }

  TT.schema = { ENTITIES, ORDER, mapHeaders, detectEntity, entityFromName, defaultSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
