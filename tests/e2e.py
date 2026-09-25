# End-to-end check of login + progress sync (Playwright, Python).
# Start the harness (node tests/harness.mjs) with a fresh store, then:
#   E2E_PASSWORD="..." python3 tests/e2e.py
# Expects a lecture 2026-09-10-acid-base and no prior progress.
import asyncio, json, os, time
from playwright.async_api import async_playwright
B=os.environ.get('E2E_URL','http://localhost:8888'); PW=os.environ['E2E_PASSWORD']; LID='2026-09-10-acid-base'
async def login(pg, path='/'):
    await pg.goto(B+path); await pg.wait_for_selector('#password')
    await pg.fill('#password',PW); await pg.click('button[type=submit]')
async def main():
    r={}
    async with async_playwright() as p:
        b=await p.chromium.launch()
        # device 1 (iPad)
        c1=await b.new_context(viewport={'width':820,'height':1180}); d1=await c1.new_page()
        errs=[]; d1.on('pageerror',lambda e:errs.append(str(e)))
        await d1.goto(B+f'/#/{LID}/cards'); await d1.wait_for_selector('#password')
        r['redirect_url']=d1.url
        await d1.fill('#password','nope'); t=time.time(); await d1.click('button[type=submit]'); await d1.wait_for_selector('#err:not([hidden])')
        r['bad_pw_delay_s']=round(time.time()-t,1); r['bad_pw_url_keeps_hash']=d1.url
        await d1.fill('#password',PW); await d1.click('button[type=submit]'); await d1.wait_for_selector('.chip')
        r['after_login']=d1.url
        ck=[c for c in await c1.cookies() if c['name']=='pp_session'][0]
        r['cookie']={k:ck[k] for k in ('httpOnly','secure','sameSite')}; r['cookie_days']=round((ck['expires']-time.time())/86400)
        # flashcards: again + got
        await d1.get_by_text('Start',exact=True).click(); await d1.click('.fc'); await d1.get_by_text('Again ↺').click()
        await d1.click('.fc'); await d1.get_by_text('Got it ✓').click()
        # practice: answer 2 (first option each, likely one wrong), then quit
        await d1.click('#tabs button[data-t=practice]'); await d1.wait_for_selector('.lecture-card')
        await d1.get_by_text('Tier 1 · recall').click()
        for _ in range(2):
            await d1.locator('.opt').first.click(); await d1.click('#check'); await d1.get_by_text('Next →').click()
        await d1.get_by_text('← Quit').click(); await d1.wait_for_selector('.lecture-card')
        r['d1_practice_cards']=await d1.locator('.lecture-card .t').all_inner_texts()
        await d1.wait_for_timeout(3500)  # debounce 2s -> server
        await d1.reload(); await d1.wait_for_selector('.lecture-card')
        r['d1_after_reload_resume']=await d1.locator('.lecture-card .t').first.inner_text()
        # offline answer -> indicator -> online sync
        await d1.get_by_text('Resume · Tier 1 · recall').click(); await d1.wait_for_selector('.qcard')
        r['resume_meta']=await d1.locator('.qmeta span').first.inner_text()
        await c1.set_offline(True)
        await d1.locator('.opt').nth(1).click(); await d1.click('#check'); await d1.wait_for_timeout(3000)
        r['offline_indicator_visible']=await d1.locator('#sync').is_visible()
        await c1.set_offline(False); await d1.evaluate("window.dispatchEvent(new Event('online'))"); await d1.wait_for_timeout(1500)
        r['online_indicator_visible']=await d1.locator('#sync').is_visible()
        # device 2 (laptop), fresh browser
        c2=await b.new_context(viewport={'width':1280,'height':800}); d2=await c2.new_page(); d2.on('pageerror',lambda e:errs.append('d2 '+str(e)))
        await login(d2); await d2.wait_for_selector('.lecture-card')
        r['d2_home']=await d2.locator('.lecture-card').inner_text()
        await d2.locator('.lecture-card').click(); await d2.click('#tabs button[data-t=practice]'); await d2.wait_for_selector('.lecture-card')
        r['d2_practice']=await d2.locator('.lecture-card .t').all_inner_texts()
        await d2.click('#tabs button[data-t=cards]'); await d2.wait_for_selector('.chip')
        r['d2_cards']=await d2.locator('.lecture-card .t').all_inner_texts()
        # tampered cookie
        c3=await b.new_context(); await c3.add_cookies([{'name':'pp_session','value':'9999999999999.AAAA','url':B}]); d3=await c3.new_page()
        await d3.goto(B+'/'); r['tampered_goes_to_login']='/login' in d3.url
        r['errors']=errs
        await b.close()
    print(json.dumps(r,indent=1,ensure_ascii=False))
asyncio.run(main())
