/* ทดสอบตรรกะหลักด้วย Node: node tests/core.test.js */
const path = require('path');
const assert = require('assert');
const files = ['utils', 'schema', 'timemodel', 'parsers/csv', 'parsers/xlsx', 'parsers/json', 'parsers/pdf', 'validator', 'scheduler-core', 'metrics', 'samples'];
files.forEach(f => require(path.join(__dirname, '..', 'js', f + '.js')));
const TT = globalThis.TT;
const settings = TT.schema.defaultSettings();
settings.seed = 4242;

function tablesFromDataset(d, fileName) {
  return [{ file: fileName, tables: TT.samples.toTables(d).map(t => ({ name: t.title, sheet: t.title, rows: t.rows.map(r => r.map(String)), lines: t.rows.map((_, i) => i + 1) })) }];
}

async function runSize(size) {
  const d = TT.samples.generate(size);
  const v = TT.validator.validate(tablesFromDataset(d, size + '.xlsx'), settings);
  const errs = v.issues.filter(i => i.severity === 'error');
  if (errs.length) console.log(errs.slice(0, 5));
  assert.strictEqual(errs.length, 0, size + ': sample should have no errors');
  for (const ent of TT.schema.ORDER) assert.strictEqual(v.counts[ent].read, d[ent].length, size + ' ' + ent + ' count');
  const ds = TT.validator.cleanDataset(v.data);
  const prob = TT.scheduler.prepare(ds, settings);
  const gen = TT.scheduler.solve(prob);
  let r, last;
  while (!(r = gen.next()).done) last = r.value;
  const res = r.value;
  const m = TT.metrics.analyze(ds, settings, res.placements, res.unscheduled);
  console.log(size.padEnd(7), 'T', ds.teachers.length, 'R', ds.rooms.length, 'G', ds.groups.length, 'A', ds.assignments.length,
    '| periods', m.required, 'scheduled', m.scheduled, 'unsched', res.unscheduled.length,
    '| clashes', m.clashes.teacher.length, m.clashes.room.length, m.clashes.group.length, 'viol', m.violations.length,
    '| gaps', m.totalGroupGaps, 'roomRate', (m.roomRate * 100).toFixed(1) + '%', 'ms', res.solver.ms, 'attempt', res.solver.attempt);
  assert.strictEqual(m.conflictTotal, 0, size + ': must have zero conflicts');
  if (res.unscheduled.length) console.log(res.unscheduled.slice(0, 3).map(u => u.reason));
  return { m, res };
}

(async () => {
  // utils
  const sp = TT.util.parseSlotSpec('จ1-2; พฤ5, ศ', 8);
  assert.ok(sp.ok, 'slot spec');
  assert.deepStrictEqual(sp.items.map(i => i.day), [0, 3, 4]);
  assert.ok(!TT.util.parseSlotSpec('จันทร์เช้า', 8).ok);
  assert.deepStrictEqual(TT.autoSplit(5, 4), [3, 2]);
  assert.deepStrictEqual(TT.autoSplit(3, 4), [3]);

  // CSV
  const csv = TT.samples.toCsv(TT.samples.generate('small'));
  const pc = TT.parsers.csv.parse(new TextEncoder().encode(csv), 'x.csv');
  assert.strictEqual(pc.tables.length, 5, 'csv sections');
  const vc = TT.validator.validate([{ file: 'x.csv', tables: pc.tables }], settings);
  assert.strictEqual(vc.severity.error, 0, 'csv no errors');

  // XLSX roundtrip (writer -> reader)
  const xbytes = TT.samples.toXlsx(TT.samples.generate('medium'));
  require('fs').writeFileSync('/tmp/medium.xlsx', xbytes);
  const px = await TT.parsers.xlsx.parse(xbytes.buffer.slice(xbytes.byteOffset, xbytes.byteOffset + xbytes.byteLength), 'medium.xlsx');
  assert.strictEqual(px.tables.length, 5, 'xlsx sheets');
  const vx = TT.validator.validate([{ file: 'medium.xlsx', tables: px.tables }], settings);
  assert.strictEqual(vx.severity.error, 0, 'xlsx no errors');
  assert.strictEqual(vx.counts.assignments.read, TT.samples.generate('medium').assignments.length);

  // JSON
  const pj = TT.parsers.json.parse(new TextEncoder().encode(TT.samples.toJson(TT.samples.generate('small'))), 's.json');
  const vj = TT.validator.validate([{ file: 's.json', tables: pj.tables }], settings);
  assert.strictEqual(vj.severity.error, 0, 'json no errors');
  try { TT.parsers.json.parse(new TextEncoder().encode('{"teachers": [ {"a":1}, ]}'), 'bad.json'); assert.fail('should throw'); }
  catch (e) { assert.ok(/JSON/.test(e.message)); console.log('JSON error ->', e.message); }

  // Errors dataset
  const ve = TT.validator.validate(tablesFromDataset(TT.samples.generateWithErrors(), 'errors.xlsx'), settings);
  const codes = ve.issues.filter(i => i.severity === 'error').map(i => i.code);
  console.log('error codes:', codes.join(', '));
  ['DUP_ID', 'REF_MISSING', 'NUM_INVALID', 'SLOT_INVALID', 'REQUIRED', 'SPLIT_SUM'].forEach(c => assert.ok(codes.includes(c), 'expect ' + c));
  ve.issues.filter(i => i.severity === 'error').forEach(i => console.log(' -', i.where, '|', i.message, '|', i.fix));
  assert.ok(!ve.canConfirm);

  // PDF layout reconstruction (synthetic items)
  const items = [
    { str: 'ครู', x: 40, y: 50, w: 20, h: 12 },
    { str: 'รหัสครู', x: 40, y: 80, w: 40, h: 10 }, { str: 'ชื่อ-สกุล', x: 120, y: 80, w: 50, h: 10 }, { str: 'ตำแหน่ง', x: 300, y: 80, w: 40, h: 10 },
    { str: 'T001', x: 40, y: 100, w: 30, h: 10 }, { str: 'นายสมชาย', x: 120, y: 100, w: 50, h: 10 }, { str: 'ใจดี', x: 175, y: 100, w: 20, h: 10 }, { str: 'ครู', x: 300, y: 100, w: 20, h: 10 },
    { str: 'T002', x: 40, y: 115, w: 30, h: 10 }, { str: 'นางสาวสม', x: 120, y: 115, w: 40, h: 10 }, { str: 'หญิง', x: 160.5, y: 115, w: 20, h: 10 },
    { str: '1', x: 300, y: 800, w: 5, h: 10 }
  ];
  const pt = TT.parsers.pdf.itemsToTables([items], 'a.pdf');
  assert.strictEqual(pt.length, 1);
  assert.deepStrictEqual(pt[0].rows[1], ['T001', 'นายสมชาย ใจดี', 'ครู']);
  assert.deepStrictEqual(pt[0].rows[2], ['T002', 'นางสาวสมหญิง', '']);
  assert.strictEqual(TT.schema.entityFromName(pt[0].name), 'teachers');

  for (const s of ['small', 'medium', 'large']) await runSize(s);
  console.log('ALL CORE TESTS PASSED');
})().catch(e => { console.error(e); process.exit(1); });
