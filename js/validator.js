/* validator.js — แปลงตารางที่อ่านได้เป็นข้อมูลมาตรฐาน และตรวจข้อผิดพลาดพร้อมวิธีแก้
   ระดับปัญหา: error (ต้องแก้ก่อนยืนยัน), warning (ยืนยันได้แต่ควรตรวจ), info (ข้อสังเกต) */
(function (root) {
  'use strict';
  const TT = (root.TT = root.TT || {});
  const U = TT.util;
  const S = TT.schema;

  const THAI_DIGITS = /[๐-๙]/g;
  function toInt(v) {
    let s = U.str(v).replace(THAI_DIGITS, function (d) { return String(d.charCodeAt(0) - 0x0e50); }).replace(/,/g, '');
    if (s === '') return { empty: true };
    if (!/^-?\d+(\.0+)?$/.test(s)) return { bad: true };
    return { value: parseInt(s, 10) };
  }
  function splitIds(v) {
    return U.str(v).split(/\s*[|;,]\s*|\s+\+\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function parseSplit(v) {
    const s = U.str(v).replace(THAI_DIGITS, function (d) { return String(d.charCodeAt(0) - 0x0e50); });
    if (!s) return { empty: true };
    const parts = s.split(/\s*[+,/\s]\s*/).filter(Boolean);
    if (!parts.length || parts.some(function (p) { return !/^\d+$/.test(p) || +p < 1; })) return { bad: true };
    return { value: parts.map(Number) };
  }

  function locText(src) {
    if (!src) return '';
    const parts = [src.file];
    if (src.table && src.table !== src.file) parts.push(src.table);
    if (src.line) parts.push((src.recordBased ? 'รายการที่ ' : 'แถวที่ ') + src.line);
    return parts.join(' › ');
  }

  function validate(sources, settings) {
    const issues = [];
    const tableInfo = [];
    const data = { teachers: [], rooms: [], subjects: [], groups: [], assignments: [] };
    const tm = TT.timeModel(settings);

    function add(sev, code, message, fix, src, extra) {
      const it = Object.assign({ id: issues.length, severity: sev, code: code, message: message, fix: fix || '', src: src || null, where: locText(src) }, extra || {});
      issues.push(it);
      return it;
    }

    /* ---------- 1) อ่านตารางแต่ละชุด ---------- */
    sources.forEach(function (source) {
      (source.tables || []).forEach(function (t) {
        const tableName = t.sheet || t.name || source.file;
        const baseSrc = { file: source.file, table: t.section || t.sheet ? tableName : (t.name !== source.file ? t.name : null), recordBased: !!t.recordBased };
        // หาแถวหัวตาราง: ข้ามแถวชื่อเรื่องด้านบน (ไม่เกิน 5 แถว)
        let hint = t.name && t.name !== source.file ? t.name : null;
        let headerIdx = -1; let det = null;
        for (let i = 0; i < Math.min(5, t.rows.length); i++) {
          const r = t.rows[i];
          const nonEmpty = r.filter(function (c) { return U.str(c) !== ''; });
          if (nonEmpty.length === 1 && S.entityFromName(String(nonEmpty[0]).replace(/^(ตาราง|ข้อมูล)\s*/, ''))) { hint = hint || nonEmpty[0]; continue; }
          const d = S.detectEntity(r, hint ? String(hint).replace(/^(ตาราง|ข้อมูล)\s*/, '') : null);
          if (d && S.mapHeaders(d.entity, r).matched >= 1) { headerIdx = i; det = d; break; }
        }
        if (!det) {
          const d2 = S.detectEntity(t.rows[0] || [], source.file);
          if (d2) { det = d2; headerIdx = 0; }
        }
        if (!det) {
          add('error', 'TABLE_UNKNOWN', 'ไม่ทราบว่าตาราง "' + tableName + '" เป็นข้อมูลชุดใด',
            'ตั้งชื่อแผ่นงาน/หัวข้อเป็น ครู, ห้องเรียน, รายวิชา, กลุ่มเรียน หรือ การมอบหมายสอน หรือใช้หัวคอลัมน์ตามแม่แบบ (ดาวน์โหลดได้ที่หน้านำเข้า)', baseSrc);
          tableInfo.push({ file: source.file, table: tableName, entity: null, rowsInFile: Math.max(0, t.rows.length - 1), rowsRead: 0, rowsValid: 0 });
          return;
        }
        const ent = det.entity;
        const def = S.ENTITIES[ent];
        const headers = t.rows[headerIdx].map(function (h) { return U.str(h); });
        const hm = S.mapHeaders(ent, headers);
        hm.missingRequired.forEach(function (f) {
          add('error', 'COL_MISSING', 'ตาราง' + def.label + ' ไม่มีคอลัมน์ "' + f.label + '"',
            'เพิ่มหัวคอลัมน์ "' + f.label + '" (หรือ ' + f.key + ') ในแถวหัวตาราง แล้วกรอกข้อมูลให้ครบทุกแถว', Object.assign({}, baseSrc, { line: t.lines ? (t.recordBased ? null : t.lines[headerIdx]) : headerIdx + 1 }), { entity: ent });
        });
        const unknownCols = headers.filter(function (h, i) { return h && !hm.map[i]; });
        if (unknownCols.length) {
          add('info', 'COL_IGNORED', 'ตาราง' + def.label + ' มีคอลัมน์ที่ระบบไม่ได้ใช้: ' + unknownCols.join(', '), 'ไม่ต้องแก้ไข ระบบจะข้ามคอลัมน์เหล่านี้', baseSrc, { entity: ent });
        }
        if (t.bad && t.bad.length) {
          t.bad.forEach(function (n) {
            add('error', 'RECORD_INVALID', 'รายการที่ ' + n + ' ในตาราง' + def.label + ' ไม่ใช่อ็อบเจกต์ { }', 'แก้รายการให้อยู่ในรูป {"' + def.fields[0].key + '": "..."}', Object.assign({}, baseSrc, { line: n }), { entity: ent });
          });
        }
        const info = { file: source.file, table: tableName, entity: ent, by: det.by, rowsInFile: Math.max(0, t.rows.length - headerIdx - 1), rowsRead: 0, rowsValid: 0, headers: headers, mapped: hm.map };
        tableInfo.push(info);
        for (let r = headerIdx + 1; r < t.rows.length; r++) {
          const raw = t.rows[r];
          if (!raw || raw.every(function (c) { return U.str(c) === ''; })) continue;
          info.rowsRead++;
          const line = t.lines ? t.lines[r] : r + 1;
          const src = Object.assign({}, baseSrc, { line: line });
          const rec = { _src: src, _issues: [], _entity: ent };
          let bad = false;
          for (let c = 0; c < hm.map.length; c++) {
            const key = hm.map[c];
            if (!key) continue;
            rec[key] = raw[c] == null ? '' : raw[c];
          }
          def.fields.forEach(function (f) {
            const v = U.str(rec[f.key]);
            if (hm.missingRequired.indexOf(f) >= 0) { rec[f.key] = f.type === 'int' ? null : ''; return; }
            if (f.required && v === '') {
              const it = add('error', 'REQUIRED', def.label + ': ไม่มีค่า "' + f.label + '"', 'กรอก "' + f.label + '" ในแถวนี้ หรือลบแถวที่ไม่ใช้ออก', src, { entity: ent, field: f.key });
              rec._issues.push(it.id); bad = true; rec[f.key] = f.type === 'int' ? null : ''; return;
            }
            if (f.type === 'int') {
              const n = toInt(v);
              if (n.empty) { rec[f.key] = null; return; }
              if (n.bad) {
                const it = add('error', 'NUM_INVALID', def.label + ': "' + f.label + '" ต้องเป็นตัวเลขจำนวนเต็ม แต่พบ "' + v + '"', 'แก้เป็นตัวเลข เช่น ' + (f.key === 'capacity' ? '40' : f.key === 'students' ? '35' : '3'), src, { entity: ent, field: f.key, value: v });
                rec._issues.push(it.id); bad = true; rec[f.key] = null; return;
              }
              if (n.value < f.min || n.value > f.max) {
                const it = add('error', 'NUM_RANGE', def.label + ': "' + f.label + '" = ' + n.value + ' อยู่นอกช่วงที่ยอมรับ (' + f.min + '–' + f.max + ')', 'แก้ค่าให้อยู่ระหว่าง ' + f.min + ' ถึง ' + f.max, src, { entity: ent, field: f.key, value: v });
                rec._issues.push(it.id); bad = true; rec[f.key] = null; return;
              }
              rec[f.key] = n.value; return;
            }
            if (f.type === 'slots') {
              rec[f.key] = v;
              if (!v) return;
              const r2 = U.parseSlotSpec(v, tm.P);
              if (!r2.ok) {
                const it = add('error', 'SLOT_INVALID', def.label + ': รูปแบบ "' + f.label + '" ไม่ถูกต้อง: "' + r2.bad.join('", "') + '"', 'ใช้วันย่อ + คาบ คั่นด้วย ; เช่น "จ1-2; พ5; ศ" (ศ = ทั้งวัน) คาบต้องอยู่ในช่วง 1–' + tm.P, src, { entity: ent, field: f.key, value: v });
                rec._issues.push(it.id); bad = true;
              }
              return;
            }
            if (f.type === 'refs') { rec[f.key] = splitIds(v); return; }
            if (f.type === 'split') {
              const sp = parseSplit(v);
              if (sp.empty) { rec[f.key] = null; return; }
              if (sp.bad) {
                const it = add('error', 'SPLIT_INVALID', def.label + ': รูปแบบ "แบ่งคาบ" ไม่ถูกต้อง: "' + v + '"', 'ใช้ตัวเลขคั่นด้วย + เช่น "2+3" หมายถึงเรียน 2 คาบและ 3 คาบต่อเนื่องคนละวัน หรือเว้นว่างให้ระบบแบ่งเอง', src, { entity: ent, field: f.key, value: v });
                rec._issues.push(it.id); bad = true; rec[f.key] = null; return;
              }
              rec[f.key] = sp.value; return;
            }
            rec[f.key] = v;
          });
          if (!bad) info.rowsValid++;
          data[ent].push(rec);
        }
      });
    });

    /* ---------- 2) รหัสซ้ำ ---------- */
    const index = {};
    ['teachers', 'rooms', 'subjects', 'groups'].forEach(function (ent) {
      const def = S.ENTITIES[ent];
      index[ent] = {};
      data[ent].forEach(function (rec) {
        const id = U.str(rec[def.key]);
        if (!id) return;
        const k = id.toUpperCase();
        if (index[ent][k]) {
          const first = index[ent][k];
          const it = add('error', 'DUP_ID', def.label + ': ' + def.fields[0].label + ' "' + id + '" ซ้ำกับ ' + locText(first._src),
            'เปลี่ยนรหัสของแถวนี้ให้ไม่ซ้ำ หรือลบแถวที่ซ้ำออกถ้าเป็นข้อมูลเดียวกัน', rec._src, { entity: ent, field: def.key, value: id, related: first._src });
          rec._issues.push(it.id); rec._dup = true;
        } else index[ent][k] = rec;
      });
    });

    /* ---------- 3) ข้อมูลไม่ครบชุด ---------- */
    S.ORDER.forEach(function (ent) {
      if (!data[ent].length) {
        add('error', 'NO_DATA', 'ยังไม่มีข้อมูล' + S.ENTITIES[ent].label, 'นำเข้าไฟล์/แผ่นงานข้อมูล' + S.ENTITIES[ent].label + ' (ดูหัวคอลัมน์ได้จากแม่แบบ)', null, { entity: ent });
      }
    });

    /* ---------- 4) การอ้างอิง ---------- */
    function resolve(ent, id, rec, field, label) {
      const k = U.str(id).toUpperCase();
      if (!k) return null;
      const hit = index[ent][k];
      if (hit) return hit;
      const all = Object.keys(index[ent]).map(function (x) { return index[ent][x][S.ENTITIES[ent].key]; });
      const sug = U.closest(id, all, 3);
      const it = add('error', 'REF_MISSING', S.ENTITIES.assignments.label + ': อ้างถึง' + label + ' "' + id + '" ที่ไม่มีในข้อมูล' + S.ENTITIES[ent].label,
        (sug.length ? 'แก้รหัสให้ตรงกับที่มี เช่น ' + sug.join(', ') + ' หรือ' : '') + 'เพิ่ม' + label + ' "' + id + '" ในตาราง' + S.ENTITIES[ent].label,
        rec._src, { entity: 'assignments', field: field, value: id, suggestions: sug });
      rec._issues.push(it.id);
      return null;
    }

    const groupLoad = {}, teacherLoad = {}, typeDemand = {};
    const pairSeen = {};
    data.assignments.forEach(function (a) {
      const g = resolve('groups', a.group_id, a, 'group_id', 'กลุ่มเรียน');
      const s = resolve('subjects', a.subject_id, a, 'subject_id', 'วิชา');
      const ts = (a.teacher_id || []).map(function (t) { return resolve('teachers', t, a, 'teacher_id', 'ครู'); });
      const room = a.room_id ? resolve('rooms', a.room_id, a, 'room_id', 'ห้อง') : null;
      if (g) a.group_id = g.group_id;
      if (s) a.subject_id = s.subject_id;
      a.teacher_id = (a.teacher_id || []).map(function (t, i) { return ts[i] ? ts[i].teacher_id : t; });
      if (room) a.room_id = room.room_id;
      a._ok = !!(g && s && ts.length && ts.every(Boolean) && (!a.room_id || room));

      // จำนวนคาบ
      let periods = a.periods;
      const tp = s ? (s.theory || 0) + (s.practice || 0) : 0;
      if (periods == null) {
        if (s && tp > 0) periods = tp;
        else if (s) {
          const it = add('error', 'PERIODS_MISSING', 'การมอบหมายสอน ' + a.subject_id + ' (' + a.group_id + '): ไม่ทราบจำนวนคาบต่อสัปดาห์',
            'กรอก "คาบ/สัปดาห์" ในแถวนี้ หรือกรอก ทฤษฎี (ท) และ ปฏิบัติ (ป) ของวิชา ' + a.subject_id, a._src, { entity: 'assignments', field: 'periods' });
          a._issues.push(it.id);
        }
      } else if (s && tp > 0 && tp !== periods) {
        add('info', 'PERIODS_DIFF', 'วิชา ' + s.subject_id + ' (' + a.group_id + ') กำหนด ' + periods + ' คาบ/สัปดาห์ ต่างจาก ท+ป = ' + tp, 'ถ้าตั้งใจไว้ไม่ต้องแก้ไข', a._src, { entity: 'assignments', field: 'periods' });
      }
      a.periods = periods || null;

      // การแบ่งคาบ
      if (a.periods) {
        let blocks = a.split;
        if (blocks) {
          const sum = blocks.reduce(function (x, y) { return x + y; }, 0);
          if (sum !== a.periods) {
            const it = add('error', 'SPLIT_SUM', 'การมอบหมายสอน ' + a.subject_id + ' (' + a.group_id + '): แบ่งคาบ ' + blocks.join('+') + ' = ' + sum + ' ไม่เท่ากับ ' + a.periods + ' คาบ/สัปดาห์',
              'แก้ "แบ่งคาบ" ให้รวมได้ ' + a.periods + ' เช่น ' + TT.autoSplit(a.periods, settings.maxBlock).join('+'), a._src, { entity: 'assignments', field: 'split' });
            a._issues.push(it.id); blocks = null;
          }
        } else {
          blocks = TT.autoSplit(a.periods, Math.min(settings.maxBlock || 4, tm.maxRun || 1));
        }
        if (blocks) {
          const tooLong = blocks.filter(function (b) { return b > tm.maxRun; });
          if (tooLong.length) {
            const it = add('error', 'BLOCK_TOO_LONG', 'การมอบหมายสอน ' + a.subject_id + ' (' + a.group_id + '): ต้องการเรียนต่อเนื่อง ' + Math.max.apply(null, tooLong) + ' คาบ แต่ช่วงเวลาต่อเนื่องยาวที่สุดมีเพียง ' + tm.maxRun + ' คาบ',
              'แบ่งคาบให้สั้นลง เช่น ' + TT.autoSplit(a.periods, tm.maxRun).join('+') + ' หรือปิด "ห้ามเรียนคร่อมช่วงพัก" ในหน้าตั้งค่า', a._src, { entity: 'assignments', field: 'split' });
            a._issues.push(it.id);
          }
          if (blocks.length > tm.D && settings.oneSessionPerDay) {
            add('warning', 'BLOCKS_GT_DAYS', 'วิชา ' + a.subject_id + ' (' + a.group_id + ') แบ่งเป็น ' + blocks.length + ' ช่วง มากกว่าจำนวนวันเรียน (' + tm.D + ' วัน) จะต้องเรียนวันเดียวกันมากกว่า 1 ช่วง',
              'ลดจำนวนช่วง โดยเพิ่ม "คาบต่อเนื่องสูงสุด" หรือกำหนดแบ่งคาบเอง', a._src, { entity: 'assignments' });
          }
          a._blocks = blocks;
        }
      }

      // ห้องเรียนที่ใช้ได้
      if (g && s && a.periods) {
        const need = U.normType(s.room_type);
        const students = g.students || 0;
        if (room) {
          if ((room.capacity || 0) < students) {
            const it = add('error', 'CAPACITY_FIXED', 'ห้อง ' + room.room_id + ' จุ ' + room.capacity + ' คน แต่กลุ่ม ' + g.group_id + ' มี ' + students + ' คน (วิชา ' + s.subject_id + ')',
              'เลือกห้องที่จุได้อย่างน้อย ' + students + ' คน หรือเว้นช่องห้องว่างให้ระบบเลือกเอง', a._src, { entity: 'assignments', field: 'room_id' });
            a._issues.push(it.id);
          }
          if (need && U.normType(room.type) !== need) {
            add('warning', 'ROOM_TYPE_FIXED', 'กำหนดห้อง ' + room.room_id + ' (ประเภท "' + (room.type || '-') + '") ให้วิชา ' + s.subject_id + ' ที่ต้องใช้ห้องประเภท "' + s.room_type + '"',
              'ถ้าตั้งใจไว้ไม่ต้องแก้ไข ระบบจะใช้ห้องที่กำหนด', a._src, { entity: 'assignments', field: 'room_id' });
          }
          a._rooms = [room.room_id];
        } else {
          const typed = data.rooms.filter(function (r) { return !r._dup && r.room_id && (!need || U.normType(r.type) === need); });
          const fit = typed.filter(function (r) { return (r.capacity || 0) >= students; });
          if (need && !typed.length) {
            const types = Array.from(new Set(data.rooms.map(function (r) { return r.type; }).filter(Boolean)));
            const it = add('error', 'ROOM_TYPE_NONE', 'วิชา ' + s.subject_id + ' ต้องใช้ห้องประเภท "' + s.room_type + '" แต่ไม่มีห้องประเภทนี้',
              'เพิ่มห้องประเภท "' + s.room_type + '" หรือแก้ประเภทห้องของวิชาให้ตรงกับที่มี' + (types.length ? ' (' + types.slice(0, 6).join(', ') + ')' : ''), a._src, { entity: 'assignments', field: 'subject_id' });
            a._issues.push(it.id);
          } else if (!fit.length) {
            const it = add('error', 'CAPACITY_NONE', 'กลุ่ม ' + g.group_id + ' (' + students + ' คน) ไม่มีห้อง' + (need ? 'ประเภท "' + s.room_type + '" ' : '') + 'ที่จุพอ สำหรับวิชา ' + s.subject_id,
              'เพิ่มห้องที่จุได้อย่างน้อย ' + students + ' คน หรือแบ่งกลุ่มเรียนให้เล็กลง', a._src, { entity: 'assignments' });
            a._issues.push(it.id);
          }
          a._rooms = fit.map(function (r) { return r.room_id; });
          if (fit.length) {
            const key = need || '(ทุกประเภท)';
            typeDemand[key] = typeDemand[key] || { periods: 0, rooms: fit.length, sample: a, label: need ? s.room_type : 'ห้องทั่วไป' };
            typeDemand[key].periods += a.periods;
            typeDemand[key].rooms = Math.max(typeDemand[key].rooms, fit.length);
          }
        }
        // คู่กลุ่ม-วิชาซ้ำ
        const pk = g.group_id.toUpperCase() + '|' + s.subject_id.toUpperCase();
        if (pairSeen[pk]) {
          add('warning', 'DUP_ASSIGN', 'กลุ่ม ' + g.group_id + ' มีวิชา ' + s.subject_id + ' ซ้ำมากกว่า 1 แถว (ซ้ำกับ ' + locText(pairSeen[pk]._src) + ')',
            'ถ้าเป็นการแยกสอนทฤษฎี/ปฏิบัติคนละครู ไม่ต้องแก้ไข ถ้าไม่ใช่ให้ลบแถวที่ซ้ำ', a._src, { entity: 'assignments' });
        } else pairSeen[pk] = a;
        groupLoad[g.group_id] = (groupLoad[g.group_id] || 0) + a.periods;
        (a.teacher_id || []).forEach(function (t) { if (index.teachers[t.toUpperCase()]) teacherLoad[t] = (teacherLoad[t] || 0) + a.periods; });
      }
    });

    /* ---------- 5) ความเป็นไปได้ของภาระงาน ---------- */
    data.teachers.forEach(function (t) {
      if (t._dup || !t.teacher_id) return;
      const load = teacherLoad[t.teacher_id] || 0;
      const un = tm.unavailMask(t.unavailable);
      let free = 0;
      for (let i = 0; i < un.mask.length; i++) if (!un.mask[i] && !tm.blocked[i]) free++;
      t._free = free; t._load = load;
      if (load > free) {
        const it = add('error', 'TEACHER_OVERFULL', 'ครู ' + t.teacher_id + ' ' + t.name + ' ต้องสอน ' + load + ' คาบ/สัปดาห์ แต่มีเวลาว่างเพียง ' + free + ' คาบ',
          'ลดจำนวนวิชาที่มอบหมาย ย้ายบางวิชาให้ครูท่านอื่น หรือลดช่วง "เวลาไม่ว่าง"', t._src, { entity: 'teachers', field: 'teacher_id' });
        t._issues.push(it.id);
      } else if (t.max_periods && load > t.max_periods) {
        add('warning', 'TEACHER_OVERLOAD', 'ครู ' + t.teacher_id + ' ' + t.name + ' ได้รับมอบหมาย ' + load + ' คาบ เกินภาระสูงสุด ' + t.max_periods + ' คาบ/สัปดาห์',
          'ตรวจการมอบหมายสอน หรือปรับ "ภาระสอนสูงสุด" ถ้ายอมรับได้', t._src, { entity: 'teachers', field: 'max_periods' });
      }
      if (!load) add('info', 'TEACHER_IDLE', 'ครู ' + t.teacher_id + ' ' + t.name + ' ยังไม่มีวิชาที่มอบหมาย', 'ไม่ต้องแก้ไขถ้าตั้งใจไว้', t._src, { entity: 'teachers' });
    });
    data.groups.forEach(function (g) {
      if (g._dup || !g.group_id) return;
      const load = groupLoad[g.group_id] || 0;
      g._load = load;
      if (load > tm.availTotal) {
        const it = add('error', 'GROUP_OVERFULL', 'กลุ่ม ' + g.group_id + ' ต้องเรียน ' + load + ' คาบ/สัปดาห์ แต่ตารางมีเพียง ' + tm.availTotal + ' คาบ',
          'ลดวิชา/คาบของกลุ่มนี้ หรือเพิ่มจำนวนคาบต่อวันหรือวันเรียนในหน้าตั้งค่า', g._src, { entity: 'groups' });
        g._issues.push(it.id);
      }
      if (!load) add('info', 'GROUP_IDLE', 'กลุ่ม ' + g.group_id + ' ยังไม่มีวิชาที่ต้องเรียน', 'ไม่ต้องแก้ไขถ้าตั้งใจไว้', g._src, { entity: 'groups' });
    });
    Object.keys(typeDemand).forEach(function (k) {
      const d = typeDemand[k];
      const cap = d.rooms * tm.availTotal;
      if (d.periods > cap) {
        add('error', 'ROOM_DEMAND', 'ต้องใช้' + (k === '(ทุกประเภท)' ? 'ห้องเรียน' : 'ห้องประเภท "' + d.label + '"') + ' รวม ' + d.periods + ' คาบ/สัปดาห์ แต่ห้องที่ใช้ได้รองรับได้สูงสุด ' + cap + ' คาบ',
          'เพิ่มห้องประเภทนี้ หรือลดจำนวนคาบที่ต้องใช้ห้องประเภทนี้', null, { entity: 'rooms' });
      }
    });
    if (tm.blockedBad.length) {
      add('error', 'SETTINGS_BLOCKED', 'รูปแบบช่วงเวลากิจกรรมในหน้าตั้งค่าไม่ถูกต้อง: "' + tm.blockedBad.join('", "') + '"', 'ใช้รูปแบบ "พ7-8" หรือ "ศ" (ทั้งวัน)', null, { entity: 'settings' });
    }

    /* ---------- สรุป ---------- */
    const counts = {};
    S.ORDER.forEach(function (ent) {
      const rows = data[ent];
      counts[ent] = { read: rows.length, valid: rows.filter(function (r) { return !r._issues.length; }).length };
      counts[ent].invalid = counts[ent].read - counts[ent].valid;
    });
    const sev = { error: 0, warning: 0, info: 0 };
    issues.forEach(function (i) { sev[i.severity]++; });
    const totalPeriods = data.assignments.reduce(function (s, a) { return s + (a.periods || 0); }, 0);
    return { data: data, issues: issues, tableInfo: tableInfo, counts: counts, severity: sev, totalPeriods: totalPeriods, canConfirm: sev.error === 0 };
  }

  /* ข้อมูลสะอาด (ไม่มีฟิลด์ภายใน) สำหรับบันทึก/ส่งต่อให้ตัวจัดตาราง */
  function cleanDataset(data) {
    const out = {};
    S.ORDER.forEach(function (ent) {
      out[ent] = data[ent].filter(function (r) { return !r._dup; }).map(function (r) {
        const o = {};
        S.ENTITIES[ent].fields.forEach(function (f) { o[f.key] = r[f.key] == null ? (f.type === 'refs' ? [] : null) : r[f.key]; });
        if (ent === 'assignments') {
          o.blocks = r.split && r.split.length ? r.split.slice() : null; // ผู้ใช้กำหนดเอง ถ้าไม่กำหนดตัวจัดตารางจะแบ่งตามการตั้งค่า
          o.rooms = r._rooms || [];
        }
        return o;
      });
      if (ent === 'assignments') out[ent].forEach(function (a, i) { a.assignment_id = 'A' + String(i + 1).padStart(4, '0'); });
    });
    return out;
  }

  /* ตรวจชุดข้อมูลที่ยืนยันแล้วซ้ำกับการตั้งค่าเวลาใหม่ (เช่น ลดจำนวนคาบต่อวัน) ก่อนเริ่มจัดตาราง */
  function precheck(ds, settings) {
    const tables = S.ORDER.map(function (ent) {
      const fields = S.ENTITIES[ent].fields;
      const rows = [fields.map(function (f) { return f.key; })];
      (ds[ent] || []).forEach(function (r) {
        rows.push(fields.map(function (f) { const v = r[f.key]; return v == null ? '' : Array.isArray(v) ? v.join(f.type === 'split' ? '+' : '|') : String(v); }));
      });
      return { name: ent, sheet: S.ENTITIES[ent].label, rows: rows, lines: rows.map(function (_, i) { return i + 1; }) };
    });
    return validate([{ file: 'ข้อมูลที่ยืนยันแล้ว', tables: tables }], settings);
  }

  TT.validator = { validate: validate, cleanDataset: cleanDataset, precheck: precheck, locText: locText };
  if (typeof module !== 'undefined' && module.exports) module.exports = TT;
})(typeof self !== 'undefined' ? self : globalThis);
