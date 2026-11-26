/* สร้างไฟล์ชุดทดสอบในโฟลเดอร์ samples/: node tools/make-samples.js */
const fs = require('fs'), path = require('path');
['utils', 'schema', 'timemodel', 'parsers/csv', 'parsers/xlsx', 'samples'].forEach(f => require(path.join(__dirname, '..', 'js', f + '.js')));
const TT = globalThis.TT;
const out = path.join(__dirname, '..', 'samples');
fs.mkdirSync(out, { recursive: true });
const sets = { small: TT.samples.generate('small'), medium: TT.samples.generate('medium'), large: TT.samples.generate('large'), errors: TT.samples.generateWithErrors(), template: TT.samples.template() };
for (const [name, d] of Object.entries(sets)) {
  fs.writeFileSync(path.join(out, name + '.json'), TT.samples.toJson(d));
  fs.writeFileSync(path.join(out, name + '.csv'), TT.samples.toCsv(d));
  fs.writeFileSync(path.join(out, name + '.xlsx'), TT.samples.toXlsx(d));
  const c = TT.schema.ORDER.map(e => e + '=' + d[e].length).join(' ');
  console.log(name.padEnd(9), c);
}
// ไฟล์แยกรายตาราง (ตัวอย่างการนำเข้าหลายไฟล์)
const split = path.join(out, 'medium-split');
fs.mkdirSync(split, { recursive: true });
TT.samples.toTables(sets.medium).forEach(t => fs.writeFileSync(path.join(split, t.entity + '.csv'), TT.samples.toCsvSingle(t.rows)));
// ข้อมูลสำหรับสร้าง PDF
fs.writeFileSync('/tmp/pdf-sources.json', JSON.stringify({ small: TT.samples.toTables(sets.small), errors: TT.samples.toTables(sets.errors) }));
