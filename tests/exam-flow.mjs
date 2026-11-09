// Full run of every graduate-format exam (format: "graduate"), at phone and iPad width.
//
//   npm run exam-flow
//
// Takes the whole form in order: one wrong answer, one skipped, one flagged, the rest by the key. Checks the review
// screen, pause and resume, the unanswered warning, scoring, the results sections and timer expiry, then confirms the
// NCLEX-style exams are unchanged. Exits 1 if anything fails. Setup: npx playwright install chromium
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const WIDTHS = [[390, 844], [820, 1180]];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const LETTERS = 'ABCDEF';

const server = createServer((req, res) => {
  let p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const exams = JSON.parse(readFileSync(join(ROOT, 'exams/exams.json'))).exams;
const graduate = exams.filter(x => x.format === 'graduate');
const classic = exams.find(x => x.format !== 'graduate');
const fails = [];
const ok = (cond, msg) => { if (!cond) { fails.push(msg); console.error(`✗ ${msg}`); } };
const sideways = pg => pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (const meta of graduate) {
    const X = JSON.parse(readFileSync(join(ROOT, `exams/${meta.id}.json`)));
    const n = X.items.length;
    for (const [w, h] of WIDTHS) {
      const at = `${w}px ${X.id}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const pg = await ctx.newPage();
      const errs = [];
      pg.on('pageerror', e => errs.push(e.message));

      await pg.goto(`${base}/#/exam/${X.id}`);
      await pg.waitForSelector('text=Start exam');
      ok(await pg.locator('table.hand tr').count() === X.sections.length + 1, `${at}: intro should list every section`);
      await pg.locator('text=Start exam').click();

      for (let i = 0; i < n; i++) {
        const q = X.items[i];
        const shown = await pg.locator('.qmeta span').first().innerText();
        ok(shown.startsWith(`${i + 1} /`), `${at}: expected question ${i + 1}, saw "${shown}"`);
        if (q.case) ok(await pg.locator('.xcase').count() === 1, `${at} q${i + 1}: case chart missing`);
        if (i !== 1) {
          const key = q.answer.split(', ').map(l => LETTERS.indexOf(l));
          for (const k of i === 0 ? [(key[0] + 1) % q.options.length] : key) await pg.locator('.qcard .opt').nth(k).click();
        }
        if (i === 2) await pg.locator('button', { hasText: 'Flag' }).click();
        ok(!(await sideways(pg)), `${at} q${i + 1}: sideways scroll`);
        await pg.locator('.qnav button', { hasText: /Next|Review →/ }).last().click();
      }

      await pg.waitForSelector('.xgrid');
      ok(await pg.locator('.xnum').count() === n, `${at}: review should show ${n} questions`);
      ok(await pg.locator('.xnum.done').count() === n - 1, `${at}: review should show ${n - 1} answered`);
      ok(await pg.locator('.xnum.flag').count() === 1, `${at}: review should show 1 flagged`);
      await pg.locator('.xnum').nth(1).click();
      await pg.waitForSelector('.qstem');
      ok((await pg.locator('.qmeta span').first().innerText()).startsWith('2 /'), `${at}: review should jump to question 2`);
      await pg.locator('.qnav button', { hasText: 'Review' }).first().click();
      await pg.waitForSelector('.xgrid');

      await pg.locator('button', { hasText: 'Pause' }).click();
      await pg.waitForSelector('text=Resume exam');
      await pg.locator('text=Resume exam').click();
      await pg.waitForSelector('.xgrid');
      ok(await pg.locator('.xnum.done').count() === n - 1, `${at}: resume should keep answers`);

      await pg.locator('button', { hasText: 'Submit exam' }).click();
      ok(await pg.locator('text=tap again to submit').count() === 1, `${at}: should warn about unanswered questions`);
      await pg.locator('button', { hasText: 'tap again' }).click();
      await pg.waitForSelector('.big-n');
      const score = await pg.locator('.big-n').innerText();
      ok(score.includes(`${n - 2} / ${n}`), `${at}: expected ${n - 2} / ${n}, saw "${score}"`);
      ok(await pg.locator('text=time ran out').count() === 0, `${at}: a manual submit must not say time ran out`);
      if (X.benchmark) ok(await pg.locator('text=study benchmark').count() === 1, `${at}: benchmark line missing`);
      for (const t of ['by section', 'by lecture', 'by kind of question', 'by skill', 'missed questions (2)']) ok(await pg.locator('h3', { hasText: t }).count() === 1, `${at}: results missing "${t}"`);
      ok(!(await sideways(pg)), `${at}: results scroll sideways`);
      ok(!errs.length, `${at}: page errors — ${errs.slice(0, 2).join(' | ')}`);
      await ctx.close();
    }

    // Timer expiry submits, and unanswered questions count as missed.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(`${base}/#/exam/${X.id}`);
    await pg.waitForSelector('text=Start exam');
    await pg.clock.install();
    await pg.locator('text=Start exam').click();
    await pg.waitForSelector('.qstem');
    await pg.clock.fastForward((X.minutes + 1) * 60000);
    try {
      await pg.waitForSelector('.big-n', { timeout: 8000 });
      ok((await pg.locator('.big-n').innerText()).startsWith(`0 / ${n}`), `${X.id}: timer expiry should score 0 / ${n}`);
    } catch { ok(false, `${X.id}: timer expiry didn't submit`); }
    await ctx.close();
    console.log(`${X.id}: ${n} questions checked at ${WIDTHS.map(([w]) => w + 'px').join(' and ')}`);
  }

  // NCLEX-style exams keep their own rules: no sections and no going back.
  if (classic) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.goto(`${base}/#/exam/${classic.id}`);
    await pg.waitForSelector('text=Start exam');
    ok(await pg.locator('text=Like the NCLEX').count() === 1, `${classic.id}: intro changed`);
    await pg.locator('text=Start exam').click();
    await pg.waitForSelector('.qstem');
    ok(await pg.locator('.xsec').count() === 0 && await pg.locator('button', { hasText: '← Back' }).count() === 0, `${classic.id}: gained graduate controls`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (fails.length) { console.error(`✗ exam flow: ${fails.length} failure(s)`); process.exit(1); }
console.log('✓ exam flow passed');
