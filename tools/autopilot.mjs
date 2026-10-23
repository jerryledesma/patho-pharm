// Autopilot: runs lecture-to-study-kit end to end without stopping for answers. The skill (SKILL.md, "Autopilot")
// does the reading and writing; this script does everything deterministic around it and keeps the loop honest:
// which stage is next, whether the checks pass, how many attempts are left, and what was decided along the way.
//
//   node tools/autopilot.mjs preflight                    clean tree, fresh origin/main, deps (npm, Chromium, faster-whisper), improvement items
//   node tools/autopilot.mjs intake [--only <folder>]     convert .key/.ppt/.doc, plan with --auto, apply one lecture
//   node tools/autopilot.mjs start <class-folder>         branch from origin/main, extract, transcribe if needed
//   node tools/autopilot.mjs status <id>                  stage reached + the next action (resumable)
//   node tools/autopilot.mjs verify <id> [--smoke]        assign-ids → render map → build → quality gate (→ smoke)
//   node tools/autopilot.mjs note <id> "<decision>"       record a decision made in place of asking (goes in the PR)
//   node tools/autopilot.mjs review <id>                  count one content-review round (capped)
//   node tools/autopilot.mjs report <id>                  write extracted/report.md (the PR body)
//   node tools/autopilot.mjs ship <id> [--draft]          ledger, hygiene, secret scan, commit, push, pull request
//
// Every command prints JSON. State lives in <class folder>/extracted/autopilot.json (git-ignored with sources/).
// Contract and file formats: tools/reference/autopilot.md.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { gate, classFolder, sourcesDir } from './quality-gate.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = sourcesDir(), INBOX = join(SOURCES, 'inbox'), COURSE = join(SOURCES, 'nurs419');
const MAX_VERIFY = 8, MAX_REVIEW = 3;
const [cmd, arg, ...rest] = process.argv.slice(2);
const flag = k => rest.includes('--' + k) || process.argv.includes('--' + k);
const opt = k => { const a = process.argv, i = a.indexOf('--' + k); return i > -1 ? a[i + 1] : undefined; };

const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
// Every external step is time-boxed (default 10 min) so an unattended run can't hang on a network call.
const run = (bin, args, o = {}) => spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 600e3, killSignal: 'SIGKILL', ...o });
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const has = bin => run('/bin/sh', ['-c', `command -v ${bin}`]).status === 0;
// Can Playwright actually start a browser? (A half-finished download leaves files behind, so test by launching.)
const chromiumWorks = () => run('node', ['--input-type=module', '-e',
  `import { chromium } from 'playwright'; const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}); await b.close();`], { timeout: 60e3 }).status === 0;
const tail = (s, n = 40) => String(s || '').trim().split('\n').slice(-n).join('\n');

// ---- state ----
const folderOf = idOrFolder => [resolve(ROOT, idOrFolder), resolve(SOURCES, '..', idOrFolder)].find(d => existsSync(join(d, 'intake.json'))) || classFolder(idOrFolder);
const statePath = f => join(f, 'extracted', 'autopilot.json');
const load = f => existsSync(statePath(f)) ? JSON.parse(readFileSync(statePath(f), 'utf8')) : { attempts: { verify: 0, review: 0 }, decisions: [], log: [] };
const save = (f, s) => { mkdirSync(join(f, 'extracted'), { recursive: true }); writeFileSync(statePath(f), JSON.stringify(s, null, 2) + '\n'); };
// A new run in a folder that already shipped (a supplement) starts clean: the old state and review are archived so
// a stale branch name, "shipped" flag or passing review can't carry over.
function freshRun(f) {
  const old = load(f);
  if (!old.shipped) return old;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const x of ['review.json', 'report.md']) if (existsSync(join(f, 'extracted', x))) renameSync(join(f, 'extracted', x), join(f, 'extracted', `${stamp}_${x}`));
  const { history = [], ...prev } = old;
  return { attempts: { verify: 0, review: 0 }, decisions: [], log: [], history: [...history, prev] };
}
const logTo = (s, event) => s.log.push({ at: new Date().toISOString(), ...event });

// The improvement log lives in the Obsidian vault; its location differs between Macs.
function vaultDir() {
  const c = [process.env.PATHO_VAULT, join(homedir(), '_dev/obs_vault/patho-pharm'), join(homedir(), 'dev/obs_vault/patho-pharm')].filter(Boolean);
  return c.find(d => existsSync(d)) || null;
}

// Clear .git/*.lock files left by a crashed git (only when no git process is running).
function clearStaleLocks() {
  const gd = resolve(ROOT, git('rev-parse', '--git-dir'));
  if (run('pgrep', ['-x', 'git']).status === 0) return [];
  return ['index.lock', 'HEAD.lock'].map(f => join(gd, f)).filter(existsSync).map(f => (unlinkSync(f), basename(f)));
}

// ---- preflight ----
function preflight() {
  const r = { ok: true, blockers: [], fixed: [], notes: [] };
  try { execFileSync('git', ['fetch', '--prune', 'origin'], { cwd: ROOT, stdio: 'ignore', timeout: 120e3 }); } catch (e) { r.blockers.push(`git fetch failed: ${e.message.split('\n')[0]}`); }
  const locks = clearStaleLocks(); if (locks.length) r.fixed.push(`removed stale ${locks.join(', ')}`);
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  if (dirty) r.blockers.push(`uncommitted changes in the working tree:\n${dirty}`);
  const unmerged = git('branch', '--no-merged', 'origin/main', '--format=%(refname:short)').split('\n').filter(Boolean);
  if (unmerged.length) r.notes.push(`unmerged local branches (left alone; the new branch starts from origin/main): ${unmerged.join(', ')}`);
  if (!existsSync(join(ROOT, 'node_modules/@viz-js/viz')) || !existsSync(join(ROOT, 'node_modules/playwright'))) {
    const i = run('npm', ['ci', '--no-audit', '--no-fund']);
    i.status === 0 ? r.fixed.push('installed npm dependencies') : r.blockers.push(`npm ci failed:\n${tail(i.stderr, 10)}`);
  }
  if (!chromiumWorks()) {
    const i = run('npx', ['playwright', 'install', 'chromium'], { timeout: 300e3 });
    i.status === 0 && chromiumWorks() ? r.fixed.push('installed Playwright Chromium') : r.notes.push('Playwright Chromium missing and could not be installed — smoke test will be skipped and reported');
  }
  // Audio-only lectures need faster-whisper (it brings PyAV, so no ffmpeg). Install it here, outside Claude's allowlist.
  if (run('python3', ['tools/transcribe.py', '--check']).status !== 0) {
    const i = run('python3', ['-m', 'pip', 'install', '--user', 'faster-whisper'], { timeout: 600e3 });
    i.status === 0 && run('python3', ['tools/transcribe.py', '--check']).status === 0 ? r.fixed.push('installed faster-whisper for transcription')
      : r.notes.push('faster-whisper missing and could not be installed — a lecture with audio but no transcript will block at start');
  }
  r.ghAuth = run('gh', ['auth', 'status']).status === 0;
  if (!r.ghAuth) r.notes.push('gh is not logged in — ship will push the branch and print the compare URL instead of opening the PR');
  const vault = vaultDir();
  if (!vault) r.notes.push('improvement log not found (set PATHO_VAULT) — improvement gate skipped');
  else {
    const logFile = join(vault, 'improvement-log.md');
    r.improvementLog = logFile;
    r.openBeforeNext = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n')
      .filter(l => /before the next lecture/i.test(l) && !/\b(done|deferred|closed|✓|✅|wontfix)\b/i.test(l)).map(l => l.trim()) : [];
  }
  r.inbox = existsSync(INBOX) ? readdirSync(INBOX).filter(f => !f.startsWith('.')) : [];
  if (!r.inbox.length) r.blockers.push(`nothing in ${INBOX}`);
  r.ok = !r.blockers.length;
  return r;
}

// ---- intake ----
// .key/.ppt/.doc can't be read; convert them with what macOS has (Keynote, textutil) or LibreOffice.
function convertInbox() {
  const done = [], failed = [];
  const walk = d => readdirSync(d).filter(f => !f.startsWith('.')).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
  if (!existsSync(INBOX)) return { done, failed };
  for (const file of walk(INBOX)) {
    const ext = extname(file).toLowerCase();
    if (!['.key', '.ppt', '.doc'].includes(ext)) continue;
    const target = file.slice(0, -ext.length) + (ext === '.doc' ? '.docx' : '.pptx');
    let r;
    if (ext === '.doc') r = run('textutil', ['-convert', 'docx', file, '-output', target]);
    else if (existsSync('/Applications/Keynote.app'))
      r = run('osascript', ['-e', `tell application "Keynote"\nset d to open POSIX file ${JSON.stringify(file)}\nexport d to POSIX file ${JSON.stringify(target)} as Microsoft PowerPoint\nclose d saving no\nend tell`], { timeout: 180000 });
    else if (has('soffice')) r = run('soffice', ['--headless', '--convert-to', 'pptx', '--outdir', dirname(file), file], { timeout: 180000 });
    if (r?.status === 0 && existsSync(target)) {
      const keep = join(SOURCES, 'originals', dirname(file).slice(INBOX.length));
      mkdirSync(keep, { recursive: true }); renameSync(file, join(keep, basename(file)));
      done.push(`${basename(file)} → ${basename(target)} (original kept in sources/originals)`);
    } else failed.push(`${basename(file)}: could not convert (${r ? tail(r.stderr, 2) : 'no converter: needs Keynote or LibreOffice'})`);
  }
  return { done, failed };
}

function intake() {
  const conv = convertInbox();
  const p = run('node', ['tools/intake.mjs', INBOX, COURSE, '--auto']);
  if (p.status !== 0) return { ok: false, blockers: [tail(p.stderr)], conversions: conv };
  const plans = JSON.parse(p.stdout);
  const only = opt('only') ?? (plans.length === 1 ? (plans[0].inboxFolder === '(loose files)' ? '' : plans[0].inboxFolder) : undefined);
  if (only === undefined) return { ok: true, applied: false, conversions: conv, lectures: plans.map(x => ({ inboxFolder: x.inboxFolder, id: x.id, mode: x.mode, warnings: x.warnings, decisions: x.decisions })),
    next: 'several lectures in the inbox — run `intake --only "<inboxFolder>"` for each, one branch per lecture, oldest first' };
  const a = run('node', ['tools/intake.mjs', INBOX, COURSE, '--auto', '--apply', '--only', only]);
  if (a.status !== 0) return { ok: false, blockers: [tail(a.stderr)], conversions: conv, plan: plans.find(x => x.inboxFolder === (only || '(loose files)')) };
  const res = JSON.parse(a.stdout);
  const s = freshRun(res.folder);
  s.id = res.meta.id;
  s.decisions.push(...conv.done.map(d => `converted ${d}`), ...res.decisions);
  if (conv.failed.length) s.decisions.push(...conv.failed.map(f => `skipped ${f}`));
  logTo(s, { stage: 'intake', folder: res.folder }); save(res.folder, s);
  return { ok: true, applied: true, folder: res.folder, id: res.meta.id, meta: res.meta, warnings: res.warnings, decisions: s.decisions, next: `node tools/autopilot.mjs start ${res.folder}` };
}

// ---- start: branch + extract ----
function start(folderArg) {
  const folder = folderOf(folderArg);
  if (!folder) return { ok: false, blockers: [`no class folder ${folderArg}`] };
  const meta = JSON.parse(readFileSync(join(folder, 'intake.json'), 'utf8'));
  const s = load(folder), r = { ok: true, folder, id: meta.id, steps: [], blockers: [] };
  const addOnly = existsSync(join(ROOT, 'public/lectures', meta.id));
  const supp = addOnly ? Math.max(0, ...readdirSync(folder).map(f => +(f.match(/^supp-(\d{2})_/)?.[1] || 0))) : 0;
  const branch = s.branch || (addOnly ? `lecture/${meta.id}-supp-${String(supp).padStart(2, '0')}` : `lecture/${meta.id}`);
  const current = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (current !== branch) {
    const exists = run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
    const sw = exists ? run('git', ['switch', branch]) : run('git', ['switch', '-c', branch, '--no-track', 'origin/main']);
    if (sw.status !== 0) return { ...r, ok: false, blockers: [`could not switch to ${branch}: ${tail(sw.stderr, 3)}`] };
    r.steps.push(exists ? `switched to ${branch}` : `created ${branch} from origin/main`);
  }
  s.branch = branch; s.addOnly = addOnly;
  const files = readdirSync(folder);
  if (!files.some(f => /^transcript\./.test(f)) && files.some(f => /^audio-\d{2}\./.test(f))) {
    const t = run('python3', ['tools/transcribe.py', folder, '--slides'], { timeout: 4 * 3600e3 });
    t.status === 0 ? r.steps.push('transcribed audio → transcript.txt') : r.blockers.push(`transcription failed: ${tail(t.stderr, 5)}`);
  }
  const e = run('node', ['tools/extract.mjs', folder]);
  e.status === 0 ? r.steps.push(tail(e.stdout, 20)) : r.blockers.push(`extract failed: ${tail(e.stderr, 5)}`);
  if (readdirSync(folder).some(f => /^slides(-\d+)?\.pdf$/i.test(f))) {
    const p = run('python3', ['tools/pdf_slides.py', folder], { timeout: 1800e3 });
    p.status === 0 ? r.steps.push('PDF deck → extracted/slides*.md') : r.blockers.push(`pdf_slides failed (needs pymupdf + tesseract): ${tail(p.stderr, 5)}`);
  }
  r.ok = !r.blockers.length;
  logTo(s, { stage: 'start', branch, ok: r.ok }); save(folder, s);
  return { ...r, branch, addOnly, next: r.ok ? 'mine the transcript → extracted/mining.md + mining.json (SKILL.md step 3)' : 'fix the blocker' };
}

// ---- status ----
function status(id) {
  const folder = folderOf(id);
  if (!folder) return { stage: 'intake', next: 'node tools/autopilot.mjs intake' };
  const meta = JSON.parse(readFileSync(join(folder, 'intake.json'), 'utf8'));
  id = meta.id;
  const s = load(folder), ex = f => existsSync(join(folder, 'extracted', f)), lec = f => existsSync(join(ROOT, 'public/lectures', id, f));
  const steps = [
    ['extract', () => readdirSync(join(folder, 'extracted')).some(f => /^(slides|transcript).*\.md$/.test(f)), `node tools/autopilot.mjs start ${folder}`],
    ['mine', () => ex('mining.json'), 'write extracted/mining.md and mining.json (step 3)'],
    ['outline', () => ex('outline.json'), 'write extracted/outline.json and self-check it (step 4)'],
    ['generate', () => lec('lecture.json') && lec('notes.html') && lec('map.dot'), `write public/lectures/${id}/ (step 5)`],
    ['review', () => ex('review.json'), 'run the independent content review → extracted/review.json (step 6b)'],
    ['verify', () => s.verified === true, `node tools/autopilot.mjs verify ${id} --smoke`],
    ['ship', () => !!s.shipped, `node tools/autopilot.mjs ship ${id}`],
  ];
  const done = [];
  for (const [name, test, next] of steps) {
    let ok = false; try { ok = test(); } catch {}
    if (!ok) return { id, folder, branch: s.branch, done, stage: name, next, attempts: s.attempts };
    done.push(name);
  }
  return { id, folder, branch: s.branch, done, stage: 'complete', pr: s.shipped };
}

// ---- verify ----
// track=false (ship's final re-check) leaves the attempt counter and the verified flag alone.
function verify(id, { track = true } = {}) {
  const folder = folderOf(id); const s = folder ? load(folder) : null;
  const r = { id, pass: false, steps: [], findings: [] };
  const lec = join(ROOT, 'public/lectures', id);
  const step = (name, bin, args) => {
    const p = run(bin, args);
    r.steps.push({ name, ok: p.status === 0, output: tail((p.stdout || '') + (p.stderr || ''), 30) });
    return p.status === 0;
  };
  const ok = step('assign-ids', 'node', ['tools/assign-ids.mjs', join(lec, 'lecture.json')])
    && step('render-map', 'node', ['tools/render-map.mjs', join(lec, 'map.dot')])
    && step('build', 'npm', ['run', 'build', '--silent']);
  if (ok) {
    r.findings = gate(id, { folder, newOnly: !!s?.addOnly });
    // Validator warnings follow their lecture's ✓/✗ line; keep this lecture's.
    let mine = false;
    for (const l of run('/bin/sh', ['-c', 'node scripts/validate.mjs 2>&1']).stdout.split('\n')) {
      if (/^[✓✗] /.test(l)) mine = l.includes(id);
      else if (mine && /^\s+! /.test(l)) r.findings.push({ severity: 'warn', code: 'validator', message: l.trim().slice(2) });
    }
    if (!r.findings.some(f => f.severity === 'error') && flag('smoke')) {
      if (chromiumWorks()) step('smoke', 'npm', ['run', 'smoke', '--silent']);
      else r.findings.push({ severity: 'warn', code: 'smoke-skipped', message: 'Playwright Chromium not installed — smoke test not run' });
    }
  }
  r.pass = r.steps.every(x => x.ok) && !r.findings.some(f => f.severity === 'error');
  if (s && track) {
    s.attempts.verify++; s.verified = r.pass && flag('smoke'); s.lastVerify = { at: new Date().toISOString(), pass: r.pass, errors: r.findings.filter(f => f.severity === 'error').length,
      warnings: r.findings.filter(f => f.severity === 'warn' && ['validator', 'smoke-skipped'].includes(f.code)) };
    logTo(s, { stage: 'verify', attempt: s.attempts.verify, pass: r.pass }); save(folder, s);
    r.attempt = s.attempts.verify; r.attemptsLeft = Math.max(0, MAX_VERIFY - s.attempts.verify);
    r.escalate = !r.pass && r.attemptsLeft === 0;
  }
  r.next = r.pass ? (flag('smoke') ? `node tools/autopilot.mjs ship ${id}` : `node tools/autopilot.mjs verify ${id} --smoke`)
    : r.escalate ? `attempts used up — node tools/autopilot.mjs ship ${id} --draft (blockers go in the PR)` : 'fix every error finding (and failed step), then verify again';
  return r;
}

// ---- report (PR body) ----
function report(id) {
  const folder = folderOf(id), s = load(folder);
  const L = JSON.parse(readFileSync(join(ROOT, 'public/lectures', id, 'lecture.json'), 'utf8'));
  const rd = f => { try { return JSON.parse(readFileSync(join(folder, 'extracted', f), 'utf8')); } catch { return {}; } };
  const mining = rd('mining.json'), review = rd('review.json');
  const tiers = t => L.practice.filter(q => q.tier === t).length;
  const findings = [...gate(id, { folder, newOnly: !!s.addOnly }), ...(s.lastVerify?.warnings || [])];
  const li = a => a?.length ? a.map(x => `- ${typeof x === 'string' ? x : Object.values(x).filter(Boolean).join(' — ')}`).join('\n') : '- none';
  const md = `## ${L.title} — ${L.date}

Built unattended by the lecture-to-study-kit **autopilot**. Every check passed${s.lastVerify?.pass ? '' : ' **except the blockers below**'}; merging publishes the lecture.

**Counts:** ${L.practice.length} practice (tier 1 ${tiers('1')} · tier 2 ${tiers('2')} · tier 3 "${L.tiers['3']}" ${tiers('3')}) · ${L.clinical.length} cases / ${L.clinical.reduce((a, c) => a + c.questions.length, 0)} clinical questions · ${L.cards.length} cards · ${L.qa.length} asked in class

### Exam scope (from the transcript)
**Tested:**
${li(mining.scope?.tested)}

**FYI only:**
${li(mining.scope?.fyi)}

### Spot-check list (verify against the source)
${li(review.spotCheck)}

### Decisions the autopilot made instead of asking
${li(s.decisions)}

### For Angelina to confirm
${li([...(mining.missing || []).map(m => `missing material: ${typeof m === 'string' ? m : Object.values(m).join(' — ')}`), ...(mining.kahoot || []).map(k => `Kahoot item reconstructed: ${typeof k === 'string' ? k : Object.values(k).join(' — ')}`)])}

### Source conflicts (spoken version used)
${li(mining.mismatches)}

### Unsure
${li([...(review.uncertain || []), ...(review.findings || []).filter(f => f.status !== 'fixed').map(f => `${f.item}: ${f.issue} (${f.severity}, ${f.status || 'open'})`)])}

### Open checks
${findings.length ? findings.map(f => `- ${f.severity === 'error' ? '**BLOCKER**' : 'warning'} [${f.code}] ${f.message}`).join('\n') : '- none'}

Verify attempts: ${s.attempts.verify} · review rounds: ${s.attempts.review}
`;
  writeFileSync(join(folder, 'extracted', 'report.md'), md);
  return { id, report: join(folder, 'extracted', 'report.md'), blockers: findings.filter(f => f.severity === 'error').length };
}

// ---- ship ----
const SECRET = /(AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}|\bxox[abpr]-[A-Za-z0-9-]{10,}|SESSION_SECRET\s*=|SITE_PASSWORD_HASH\s*=|SMOKE_PASSWORD\s*=|pbkdf2\$|\bpassword\s*[:=]\s*['"][^'"]{6,})/;
function ship(id) {
  const folder = folderOf(id), s = load(folder), draft = flag('draft');
  const r = { id, ok: false, steps: [], blockers: [] };
  const v = verify(id, { track: false });
  if (!v.pass && !draft) return { ...r, blockers: ['verify does not pass — fix it, or ship --draft once attempts are used up'], verify: v };
  clearStaleLocks();
  // Only this lecture and the ledger may change — and never anything from sources/. (Porcelain lines are "XY path";
  // don't trim the output, or the first line loses its status column.)
  const changed = run('git', ['status', '--porcelain', '--untracked-files=all']).stdout.split('\n').filter(Boolean).map(l => l.slice(3));
  const stray = changed.filter(p => !p.startsWith(`public/lectures/${id}/`) && p !== 'id-ledger.json' && p !== 'public/lectures/index.json');
  if (stray.length) return { ...r, blockers: [`unexpected changes outside the lecture (not committed): ${stray.join(', ')}`] };
  if (changed.some(p => p.startsWith('sources/'))) return { ...r, blockers: ['source files would be committed — stop'] };
  if (v.pass) { const l = run('node', ['scripts/validate.mjs', '--update-ledger']); if (l.status !== 0) return { ...r, blockers: [`ledger update failed: ${tail(l.stderr)}`] }; r.steps.push('ledger updated'); }
  run('git', ['add', `public/lectures/${id}`, 'id-ledger.json']);
  const diff = git('diff', '--cached');
  const hit = diff.split('\n').filter(l => l.startsWith('+') && SECRET.test(l));
  if (hit.length) { run('git', ['reset', '-q']); return { ...r, blockers: [`secret scan matched ${hit.length} line(s) in the staged diff — nothing committed:\n${hit.slice(0, 3).map(l => l.slice(0, 120)).join('\n')}`] }; }
  r.steps.push('secret scan clean');
  const meta = JSON.parse(readFileSync(join(ROOT, 'public/lectures', id, 'lecture.json'), 'utf8'));
  const author = (process.env.AUTOPILOT_AUTHOR || 'v-jerryledesma <jerry@vertikals.ai>').match(/^(.*?)\s*<(.+)>$/);
  const session = process.env.CLAUDE_SESSION_URL ? `\nClaude-Session: ${process.env.CLAUDE_SESSION_URL}` : '';
  const msg = `${s.addOnly ? 'Add supplement to' : 'Add'} lecture ${id}: ${meta.title}${draft && !v.pass ? ' (draft — open blockers)' : ''}\n\nBuilt by the lecture-to-study-kit autopilot (${s.attempts.verify} verify attempt(s), ${s.attempts.review} review round(s)).\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>${session}\n`;
  if (git('diff', '--cached', '--name-only')) {
    const c = run('git', ['-c', `user.name=${author[1]}`, '-c', `user.email=${author[2]}`, 'commit', '-q', '-F', '-'], { input: msg });
    if (c.status !== 0) return { ...r, blockers: [`commit failed: ${tail(c.stderr)}`] };
    r.steps.push(`committed on ${s.branch}`);
  }
  const p = run('git', ['push', '-u', 'origin', s.branch]);
  if (p.status !== 0) return { ...r, blockers: [`push failed (commit is safe locally): ${tail(p.stderr, 5)}`], next: `git push -u origin ${s.branch}` };
  r.steps.push(`pushed ${s.branch}`);
  const body = report(id).report;
  let pr = null;
  if (run('gh', ['auth', 'status']).status === 0) {
    const existing = run('gh', ['pr', 'view', s.branch, '--json', 'url', '-q', '.url']);
    if (existing.status === 0 && existing.stdout.trim()) { pr = existing.stdout.trim(); run('gh', ['pr', 'edit', s.branch, '--body-file', body]); }
    else {
      const g = run('gh', ['pr', 'create', '--base', 'main', '--head', s.branch, '--title', msg.split('\n')[0], '--body-file', body, ...(draft && !v.pass ? ['--draft'] : [])]);
      if (g.status === 0) pr = g.stdout.trim().split('\n').at(-1); else r.steps.push(`gh pr create failed: ${tail(g.stderr, 3)}`);
    }
  }
  if (!pr) { const url = git('remote', 'get-url', 'origin').replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/'); pr = `${url}/compare/main...${s.branch}?expand=1`; r.steps.push('open the PR from the compare URL; paste extracted/report.md as the body'); }
  s.shipped = pr; logTo(s, { stage: 'ship', pr, draft: draft && !v.pass }); save(folder, s);
  const rc = run('node', ['tools/release-check.mjs']);
  return { ...r, ok: true, pr, report: body, draft: draft && !v.pass, releaseCheck: tail(rc.stdout + rc.stderr, 10) };
}

const cmds = {
  preflight: () => out(preflight()),
  intake: () => { const r = intake(); out(r, r.ok ? 0 : 1); },
  start: () => { const r = start(arg); out(r, r.ok ? 0 : 1); },
  status: () => out(status(arg)),
  verify: () => { const r = verify(arg); out(r, r.pass ? 0 : 1); },
  note: () => { const f = folderOf(arg), s = load(f); s.decisions.push(rest.filter(x => !x.startsWith('--')).join(' ')); save(f, s); out({ decisions: s.decisions }); },
  review: () => { const f = folderOf(arg), s = load(f); s.attempts.review++; save(f, s); out({ round: s.attempts.review, roundsLeft: Math.max(0, MAX_REVIEW - s.attempts.review) }); },
  report: () => out(report(arg)),
  ship: () => { const r = ship(arg); out(r, r.ok ? 0 : 1); },
};
if (!cmds[cmd] || (!arg && !['preflight', 'intake'].includes(cmd))) { console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 15).join('\n')); process.exit(1); }
cmds[cmd]();
