"""สร้างไฟล์ PDF ชุดทดสอบ (samples/small.pdf, samples/errors.pdf) ด้วย Chromium
   ต้องรัน node tools/make-samples.js ก่อน (สร้าง /tmp/pdf-sources.json)"""
import json, html, os
from playwright.sync_api import sync_playwright
src = json.load(open('/tmp/pdf-sources.json'))
out = os.path.join(os.path.dirname(__file__), '..', 'samples')
CSS = """body{font-family:'Loma','Tahoma',sans-serif;font-size:10pt;margin:0}
h1{font-size:15pt;margin:0 0 4mm} h2{font-size:12pt;margin:6mm 0 2mm;break-after:avoid}
table{border-collapse:collapse;width:100%} th,td{border:1px solid #999;padding:1.2mm 2mm;text-align:left;white-space:nowrap}
th{background:#e6eee9} @page{size:A4 landscape;margin:10mm}"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for name, tables in src.items():
        body = '<h1>ข้อมูลนำเข้าสำหรับจัดตารางสอน (' + ('ชุดเล็ก' if name == 'small' else 'ชุดที่มีข้อผิดพลาด') + ')</h1>'
        for t in tables:
            body += '<h2>' + html.escape(t['title']) + '</h2><table><thead><tr>' + ''.join('<th>' + html.escape(str(h)) + '</th>' for h in t['rows'][0]) + '</tr></thead><tbody>'
            for r in t['rows'][1:]:
                body += '<tr>' + ''.join('<td>' + html.escape(str(c)) + '</td>' for c in r) + '</tr>'
            body += '</tbody></table>'
        pg.set_content('<!doctype html><html lang="th"><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + body + '</body></html>')
        pg.pdf(path=os.path.join(out, name + '.pdf'), format='A4', landscape=True, print_background=True)
        print('wrote', name + '.pdf')
    b.close()
