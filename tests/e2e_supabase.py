"""ทดสอบการบันทึกลง Supabase ด้วยเซิร์ฟเวอร์จำลอง (ดักคำขอ REST) และการนำเข้าหลายไฟล์"""
import json, os, re, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(__file__), 'output')
db = {'datasets': {}, 'runs': {}}
calls = []
mode = {'fail': False}
def handler(route):
    req = route.request
    u = urlparse(req.url); table = u.path.split('/')[-1]; q = parse_qs(u.query)
    calls.append((req.method, table, req.headers.get('apikey', '')[:6], 'authorization' in req.headers))
    if mode['fail']:
        return route.fulfill(status=404, content_type='application/json', body=json.dumps({'message': 'relation "public.runs" does not exist'}))
    if req.method == 'POST':
        for row in json.loads(req.post_data):
            db[table][row['id']] = {**db[table].get(row['id'], {}), **row}
        return route.fulfill(status=201, body='')
    rows = list(db[table].values())
    if 'id' in q:
        rid = q['id'][0].replace('eq.', ''); rows = [r for r in rows if r['id'] == rid]
    rows.sort(key=lambda r: r.get('started_at', r.get('created_at', '')), reverse=True)
    return route.fulfill(status=200, content_type='application/json', body=json.dumps(rows))

errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 950})
    ctx.route('**/fonts.g*/**', lambda r: r.abort())
    ctx.route('https://demo.supabase.co/rest/v1/**', handler)
    ctx.add_init_script("localStorage.setItem('tt.supabase', JSON.stringify({url:'https://demo.supabase.co', key:'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x'}))")
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/index.html#settings')
    page.click('#dbTest'); page.wait_for_selector('#dbStatus .callout-ok', timeout=5000)
    print('settings test:', page.text_content('#dbStatus').strip()[:60], '| chip:', page.text_content('#storeChipText'))
    # service_role guard
    page.fill('#dbForm [name=url]', 'https://demo.supabase.co'); page.fill('#dbForm [name=key]', 'sb_secret_abc')
    page.click('#dbSave'); print('secret key guard:', page.text_content('#dbStatus').strip()[:50])
    # multi-file import
    page.goto('http://localhost:8765/index.html#import')
    split = 'samples/medium-split'
    page.set_input_files('#fileInput', [os.path.join(split, f) for f in sorted(os.listdir(split))])
    page.wait_for_function("document.querySelectorAll('.job[data-status=done]').length === 5", timeout=10000)
    page.click('#toPreview'); page.wait_for_selector('.count-card')
    print('split csv counts:', page.locator('.count-card .n').all_text_contents())
    page.screenshot(path=os.path.join(OUT, '20-preview-split.png'), full_page=False)
    page.click('#confirmImport'); page.wait_for_selector('#view-run:not([hidden])')
    page.click('#qualityPick [data-q="fast"]'); page.click('#btnRun')
    page.wait_for_function("document.querySelector('#runStatusBadge').textContent.includes('เสร็จ')", timeout=60000)
    time.sleep(0.5)
    print('log tail:', page.locator('#runLog li').all_text_contents()[-2:])
    page.goto('http://localhost:8765/index.html#results'); page.click('#btnConfirmRun')
    page.wait_for_selector('[data-export="csv"]:not([disabled])'); time.sleep(0.5)
    print('db rows:', len(db['datasets']), 'datasets,', len(db['runs']), 'runs; confirmed:', [r.get('confirmed') for r in db['runs'].values()])
    print('calls:', sorted(set(calls))[:8])
    # history from remote
    page.goto('http://localhost:8765/index.html#history'); page.wait_for_selector('#historyBody table')
    print('history line:', page.text_content('#historyLine'))
    # failure fallback
    mode['fail'] = True
    page.click('#reloadHistory'); time.sleep(0.8)
    print('history when failing:', page.text_content('#historyLine'), '| chip:', page.text_content('#storeChipText'))
    # print page loads run from remote in a fresh context (no local copy)
    mode['fail'] = False
    rid = list(db['runs'].keys())[0]
    ctx2 = b.new_context(); ctx2.route('**/fonts.g*/**', lambda r: r.abort()); ctx2.route('https://demo.supabase.co/rest/v1/**', handler)
    ctx2.add_init_script("localStorage.setItem('tt.supabase', JSON.stringify({url:'https://demo.supabase.co', key:'sb_publishable_xyz'}))")
    p2 = ctx2.new_page(); p2.goto('http://localhost:8765/print.html?run=' + rid); p2.wait_for_selector('.sheet-page', timeout=10000)
    print('print from remote on another browser:', p2.text_content('#printInfo'))
    print('publishable key sends Authorization:', [c for c in calls if c[2] == 'sb_pub'][:1])
    b.close()
print('page errors:', errors)
