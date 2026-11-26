import json, os, sys, time
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(__file__), 'output')
BASE = 'http://localhost:8765/'
errors = []
def shot(page, name, full=True):
    page.screenshot(path=os.path.join(OUT, name + '.png'), full_page=full)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 950}, accept_downloads=True, locale='th-TH')
    ctx.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    ctx.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(('console', m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errors.append(('pageerror', str(e))))
    page.goto(BASE + 'index.html')
    page.wait_for_selector('#sampleButtons button')
    shot(page, '01-import-empty')

    # --- error dataset ---
    page.click('[data-sample="errors"]')
    page.wait_for_selector('.job[data-status="done"]', timeout=10000)
    page.click('#toPreview')
    page.wait_for_selector('#issueList .issue')
    shot(page, '02-preview-errors')
    n_err = page.locator('.issue[data-sev="error"]').count()
    disabled = page.is_disabled('#confirmImport')
    print('errors shown:', n_err, 'confirm disabled:', disabled)
    # go-to-row
    page.locator('.issue[data-sev="error"] [data-issue]').first.click()
    time.sleep(0.5)
    shot(page, '03-preview-goto-row', full=False)

    # --- invalid files ---
    page.goto(BASE + 'index.html#import')
    page.wait_for_selector('#sampleButtons button')
    open('/tmp/bad.json','w').write('{"teachers": [ {"teacher_id":"T1"}, ]}')
    open('/tmp/empty.csv','w').write('')
    open('/tmp/doc.docx','w').write('xx')
    open('/tmp/notxlsx.xlsx','w').write('this is not a zip')
    page.set_input_files('#fileInput', ['/tmp/bad.json', '/tmp/empty.csv', '/tmp/doc.docx', '/tmp/notxlsx.xlsx'])
    time.sleep(1.2)
    shot(page, '04-import-bad-files')
    print('job errors:', page.locator('.job[data-status="error"]').count())
    for t in page.locator('.job .err').all_text_contents(): print('  ', t)
    # retry button exists
    print('retry buttons:', page.locator('[data-act="retry"]').count())
    page.click('#clearJobs')

    # --- real files: xlsx medium + large csv + json ---
    page.set_input_files('#fileInput', ['/tmp/medium.xlsx'])
    page.wait_for_selector('.job[data-status="done"]', timeout=10000)
    page.click('#toPreview')
    page.wait_for_selector('.count-card')
    counts = page.locator('.count-card .n').all_text_contents()
    print('medium xlsx counts:', counts)
    page.goto(BASE + 'index.html#import')
    page.click('#clearJobs')
    page.click('#sampleFormat [data-fmt="csv"]')
    page.click('[data-sample="large"]')
    page.wait_for_selector('.job[data-status="done"]', timeout=15000)
    shot(page, '05-import-large-done')
    page.click('#toPreview')
    page.wait_for_selector('.count-card')
    print('large csv counts:', page.locator('.count-card .n').all_text_contents())
    shot(page, '06-preview-large')
    page.click('#confirmImport')
    page.wait_for_selector('#view-run:not([hidden])')
    shot(page, '07-run-ready')

    # --- run, cancel, restart ---
    page.click('#btnRun')
    time.sleep(0.9)
    shot(page, '08-run-progress', full=False)
    print('progress during run:', page.text_content('#runPct'), page.text_content('#runPhase'))
    page.click('#btnCancel')
    page.wait_for_function("document.querySelector('#runStatusBadge').textContent.includes('ยกเลิก')", timeout=5000)
    print('after cancel:', page.text_content('#runStatusBadge'))
    shot(page, '09-run-cancelled', full=False)
    page.click('#btnRestart')
    page.wait_for_function("document.querySelector('#runStatusBadge').textContent.includes('เสร็จ')", timeout=60000)
    print('after restart:', page.text_content('#runStatusBadge'), page.text_content('#runPhase'))
    shot(page, '10-run-done')

    # --- results ---
    page.click('#runResultBox a[href="#results"]')
    page.wait_for_selector('.tt-card')
    shot(page, '11-results-grid')
    print('metrics:', [t.strip() for t in page.locator('#metricBand .metric-value').all_text_contents()])
    page.fill('#subjQ', 'เว็บไซต์')
    time.sleep(0.3)
    shot(page, '12-results-search', full=False)
    page.click('#viewPick [data-view="teacher"]')
    page.wait_for_selector('.tt-card')
    shot(page, '13-results-teacher', full=False)
    page.locator('.tt-card').first.click()
    page.wait_for_selector('#detailDialog[open]')
    shot(page, '14-detail', full=False)
    page.click('#detailClose')
    for tab in ['list', 'load', 'rooms', 'gaps', 'issues']:
        page.click(f'#resTabs [data-tab="{tab}"]')
        time.sleep(0.25)
        shot(page, '15-tab-' + tab, full=False)
    # exports disabled before confirm
    print('csv disabled before confirm:', page.is_disabled('[data-export="csv"]'))
    page.click('#btnConfirmRun')
    page.wait_for_selector('[data-export="csv"]:not([disabled])')
    dl = {}
    for k in ['csv', 'xlsx', 'json']:
        with page.expect_download() as d:
            page.click(f'[data-export="{k}"]')
        f = d.value
        path = os.path.join(OUT, 'export.' + k)
        f.save_as(path)
        dl[k] = (f.suggested_filename, os.path.getsize(path))
    print('downloads:', dl)
    with ctx.expect_page() as np:
        page.click('[data-export="pdf"]')
    pp = np.value
    pp.on('pageerror', lambda e: errors.append(('print pageerror', str(e))))
    pp.wait_for_selector('.sheet-page')
    print('print info:', pp.text_content('#printInfo'))
    shot(pp, '16-print', full=False)
    pp.emulate_media(media='print')
    pp.pdf(path=os.path.join(OUT, 'print.pdf'), format='A4', landscape=True, print_background=True)
    pp.close()

    # history
    page.goto(BASE + 'index.html#history')
    page.wait_for_selector('#historyBody table')
    shot(page, '17-history')
    # reload restore
    page.goto(BASE + 'index.html#results')
    page.reload()
    page.wait_for_selector('#metricBand')
    print('restored results after reload:', page.evaluate("TT.app.state.run && TT.app.state.run.confirmed"), page.evaluate("Object.keys(localStorage).map(k=>k.slice(0,12)+':'+localStorage.getItem(k).length).join(' ')"))
    page.click('#resTabs [data-tab="grid"]')
    page.wait_for_selector('.tt-card')
    # mobile
    m = ctx.new_page()
    m.set_viewport_size({'width': 390, 'height': 844})
    m.goto(BASE + 'index.html#results')
    m.wait_for_selector('.tt-card')
    shot(m, '18-mobile-results', full=False)
    m.goto(BASE + 'index.html#import')
    shot(m, '19-mobile-import', full=False)
    b.close()
print('ERRORS:', json.dumps(errors, ensure_ascii=False, indent=1))
