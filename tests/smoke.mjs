// Smoke test (IMP-05): every lecture × every tab renders without errors, at phone and iPad width.
//
//   npm run smoke                                   → local: serves public/ (no login gate) and checks it
//   SMOKE_URL=https://<site>.netlify.app SMOKE_PASSWORD='…' npm run smoke   → live site, logs in first
//
// One-time setup on a new machine: npx playwright install chromium
// Exits 1 if anything fails. Checks: home lists every lecture newest first; each tab of each lecture shows its
// content; no page errors or console errors (except the progress API locally); no sideways scrolling.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const LIVE = process.env.SMOKE_URL?.replace(/\/$/, '');
const TABS = ['notes', 'practice', 'clinical', 'cards', 'qa', 'map'];
const WIDTHS = [[390, 844], [820, 1180]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

let server, base = LIVE;
if (!LIVE) {
  server = createServer((req, res) => {
    let p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
  }).listen(0);
  base = `http://localhost:${server.address().port}`;
}

const fails = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && (LIVE || !/api\/progress|404/.test(m.text()))) errs.push(m.text()); });

    if (LIVE) {
      if (!process.env.SMOKE_PASSWORD) throw new Error('SMOKE_PASSWORD is required with SMOKE_URL');
      await page.goto(base + '/'); await page.waitForSelector('#password');
      await page.fill('#password', process.env.SMOKE_PASSWORD); await page.click('button[type=submit]');
      await page.waitForSelector('.lecture-card', { timeout: 15000 });
    }
    const index = await (await page.request.get(base + '/lectures/index.json')).json();
    const ids = index.lectures.map(l => l.id);

    await page.goto(base + '/#/'); await page.waitForSelector('.lecture-card');
    const home = await page.locator('.lecture-card .t').allInnerTexts();
    const nums = home.map(t => parseInt(t, 10));
    if (home.length !== ids.length) fails.push(`${w}px home: ${home.length} lectures shown, index has ${ids.length}`);
    if (nums.some((n, i) => i && n > nums[i - 1])) fails.push(`${w}px home: not newest first (${nums.join(', ')})`);

    for (const id of ids) for (const tab of TABS) {
      errs.length = 0;
      await page.goto(`${base}/#/${id}/${tab}`);
      try { await page.waitForFunction(() => (document.querySelector('#page, main')?.innerText || document.body.innerText).trim().length > 40, null, { timeout: 8000 }); }
      catch { fails.push(`${w}px ${id}/${tab}: nothing rendered`); continue; }
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w + 1) fails.push(`${w}px ${id}/${tab}: scrolls sideways (${sw}px wide)`);
      if (errs.length) fails.push(`${w}px ${id}/${tab}: ${errs.slice(0, 2).join(' | ')}`);
    }
    console.log(`${w}px: home + ${ids.length} lectures × ${TABS.length} tabs checked`);
    await ctx.close();
  }
} finally {
  await browser.close(); server?.close();
}
if (fails.length) { console.error(`✗ smoke test failed (${fails.length}):\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log(`✓ smoke test passed${LIVE ? ` on ${LIVE}` : ' (local build)'}`);
