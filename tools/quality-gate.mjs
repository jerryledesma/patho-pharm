// Quality gate: the skill's review checklist as machine checks, so an unattended run can tell "done" from "not yet".
//
//   node tools/quality-gate.mjs <lecture-id> [--json] [--new-only]
//
// --new-only (supplements): check only items whose ids aren't in id-ledger.json yet, and skip the lecture-wide
// counts, case structure and outline checks — the published part was approved before.
//
// Runs after `npm run build` passes. Checks one lecture against the content rules in
// .claude/skills/lecture-to-study-kit/SKILL.md (counts, item shapes, NGN case structure, answer-key tells, src on every
// item, notes/map shape) and, when the class folder is found under sources/nurs419/, the working files the
// autopilot writes (extracted/mining.json and extracted/outline.json — see tools/reference/autopilot.md).
//
// Every finding has a severity: "error" blocks shipping, "warn" goes into the PR report. Exit 1 if any error.
// Thresholds are calibrated so the approved NGN-era lectures (2026-09-24 onward) pass with no errors.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEPS = ['recognize', 'analyze', 'prioritize', 'generate', 'act', 'evaluate'];
const LETTERS = 'ABCDEF';

// sources/ is git-ignored, so a git worktree doesn't have it: use $PATHO_SOURCES, this checkout's, or the main checkout's.
export function sourcesDir() {
  if (process.env.PATHO_SOURCES) return process.env.PATHO_SOURCES;
  if (existsSync(join(ROOT, 'sources'))) return join(ROOT, 'sources');
  try {
    const main = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).match(/^worktree (.+)$/m)?.[1];
    if (main && existsSync(join(main, 'sources'))) return join(main, 'sources');
  } catch {}
  return join(ROOT, 'sources');
}

export function classFolder(id, courseDir = join(sourcesDir(), 'nurs419')) {
  if (!existsSync(courseDir)) return null;
  for (const d of readdirSync(courseDir)) {
    const meta = join(courseDir, d, 'intake.json');
    if (existsSync(meta)) try { if (JSON.parse(readFileSync(meta, 'utf8')).id === id) return join(courseDir, d); } catch {}
  }
  return null;
}

// "4", "4-9", "4–9", "2:4-9" (deck 2) → ["1:4", "1:5", …]
export function expandSlides(spec) {
  const out = [];
  for (const part of String(spec).split(/[,;]\s*/).filter(Boolean)) {
    const m = part.trim().match(/^(?:(\d+):)?\s*(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) continue;
    const deck = m[1] || '1', a = +m[2], b = m[3] ? +m[3] : a;
    for (let n = a; n <= b; n++) out.push(`${deck}:${n}`);
  }
  return out;
}

function deckSlides(folder) {
  const dir = join(folder, 'extracted');
  if (!existsSync(dir)) return [];
  const decks = readdirSync(dir).filter(f => /^slides(-\d+)?\.md$/.test(f)).sort();
  return decks.flatMap((f, i) => [...readFileSync(join(dir, f), 'utf8').matchAll(/^## Slide (\d+)/gm)].map(m => `${decks.length > 1 ? i + 1 : 1}:${m[1]}`));
}

export function gate(id, { folder = classFolder(id), newOnly = false } = {}) {
  const findings = [];
  const add = (severity, code, message) => findings.push({ severity, code, message });
  const base = join(ROOT, 'public/lectures', id);
  if (!existsSync(join(base, 'lecture.json'))) { add('error', 'missing-lecture', `public/lectures/${id}/lecture.json not found`); return findings; }
  const L = JSON.parse(readFileSync(join(base, 'lecture.json'), 'utf8'));
  const published = new Set(newOnly ? JSON.parse(readFileSync(join(ROOT, 'id-ledger.json'), 'utf8'))[id] || [] : []);
  const fresh = x => !published.has(x.id);
  const practice = (L.practice || []).filter(fresh), cards = (L.cards || []).filter(fresh), qa = (L.qa || []).filter(fresh);
  const cases = newOnly ? [] : L.clinical || [];
  const clinicalQs = (L.clinical || []).flatMap(s => s.questions || []).filter(fresh);

  // ---- every item traceable ----
  const items = [...practice.map(x => ['practice', x]), ...clinicalQs.map(x => ['clinical', x]), ...cards.map(x => ['card', x]), ...qa.map(x => ['qa', x])];
  const noSrc = items.filter(([, x]) => !x.src?.trim()).map(([k, x]) => `${k} ${x.id ?? '(no id)'}`);
  if (noSrc.length) add('error', 'src-missing', `${noSrc.length} item(s) without "src": ${noSrc.slice(0, 8).join(', ')}${noSrc.length > 8 ? ', …' : ''}`);
  const noId = items.filter(([, x]) => !x.id).length;
  if (noId) add('error', 'ids-unassigned', `${noId} item(s) have no id — run node tools/assign-ids.mjs`);

  // ---- question shapes ----
  const shape = (q, where) => {
    const n = q.options?.length || 0, ans = String(q.answer || '').split(',').map(s => s.trim()).filter(Boolean);
    if (q.type === 'mc' && n !== 4) add('error', 'mc-options', `${where}: multiple-choice needs 4 options (has ${n})`);
    if (q.type === 'sata' && (n < 5 || n > 6)) add('error', 'sata-options', `${where}: SATA needs 5–6 options (has ${n})`);
    if (q.type === 'sata' && (ans.length < 2 || ans.length > 4)) add('error', 'sata-answers', `${where}: SATA needs 2–4 correct (has ${ans.length})`);
    if (q.type === 'order' && n !== 4) add('error', 'order-options', `${where}: order item needs 4 options (has ${n})`);
    if (!q.rationale || q.rationale.length < 60) add('warn', 'rationale-short', `${where}: rationale under 60 characters — it should say why the tempting wrong options are wrong`);
    if (/\b(all|none) of the above\b/i.test((q.options || []).join(' '))) add('error', 'aota', `${where}: "all/none of the above" option`);
  };
  practice.forEach(q => shape(q, `practice ${q.id}`));
  clinicalQs.forEach(q => shape(q, `clinical ${q.id}`));

  // Generic NGN stems ("Which findings need follow-up?") repeat across cases by design, so clinical stems only count
  // as duplicates within one case.
  const norm = q => q.stem.replace(/<[^>]+>/g, '').trim().toLowerCase();
  for (const group of [practice, ...cases.map(s => s.questions || [])]) {
    const stems = group.map(norm), dup = stems.filter((s, i) => stems.indexOf(s) !== i);
    if (dup.length) add('error', 'duplicate-stem', `${dup.length} duplicate question stem(s): "${dup[0].slice(0, 60)}…"`);
  }

  if (newOnly) return supplementChecks(findings, add, folder);

  // ---- practice counts and tier mix ----
  const nP = practice.length;
  if (nP < 25 || nP > 55) add('error', 'practice-count', `${nP} practice questions (target 30–45)`);
  else if (nP < 30 || nP > 45) add('warn', 'practice-count', `${nP} practice questions (target 30–45) — explain in the PR`);
  const tier = t => practice.filter(q => q.tier === t).length;
  if (nP && (tier('1') / nP < 0.2 || tier('2') / nP < 0.2 || tier('3') / nP < 0.1)) add('error', 'tier-mix', `tier mix ${tier('1')}/${tier('2')}/${tier('3')} — aim for roughly a third each (tier 3 may be smaller)`);
  if (!L.tiers?.['3'] || ['application', 'recall', 'analysis'].includes(L.tiers['3'].toLowerCase())) add('error', 'tier3-label', `tier 3 needs a topic-specific label (e.g. "ABG interpretation"), got "${L.tiers?.['3'] ?? ''}"`);

  // ---- answer-key tells (IMP-02, IMP-06) ----
  const mcs = [...practice, ...clinicalQs].filter(q => q.type === 'mc' && q.options?.length && q.answer);
  if (mcs.length) {
    const len = q => q.options[LETTERS.indexOf(q.answer)]?.length || 0;
    const others = q => q.options.filter((_, k) => k !== LETTERS.indexOf(q.answer)).map(o => o.length);
    const longest = mcs.filter(q => len(q) > Math.max(...others(q))).length;
    const much = mcs.filter(q => len(q) > 1.3 * Math.max(...others(q))).length;
    if (much / mcs.length > 0.10) add('error', 'length-tell', `${much} of ${mcs.length} correct answers are >1.3× every distractor (keep ≤ 10%)`);
    if (longest / mcs.length > 0.40) add('error', 'longest-answer', `the correct option is the strictly longest in ${longest} of ${mcs.length} items (keep ≤ ~⅓)`);
    else if (longest / mcs.length > 0.34) add('warn', 'longest-answer', `the correct option is the strictly longest in ${longest} of ${mcs.length} items (keep ≤ ~⅓)`);
    const by = {}; mcs.forEach(q => { by[q.answer] = (by[q.answer] || 0) + 1; });
    const [top, n] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (mcs.length >= 10 && n / mcs.length > 0.40) add('error', 'letter-share', `"${top}" is correct in ${n} of ${mcs.length} multiple-choice items (keep ≤ 40%)`);
    const missing = 'ABCD'.split('').filter(l => !by[l]);
    if (mcs.length >= 20 && missing.length) add('warn', 'letter-share', `no multiple-choice answer is ${missing.join('/')}`);
  }

  // ---- clinical cases: NGN shape ----
  const ngn = cases.filter(s => (s.questions || []).some(q => q.step));
  const rapid = cases.filter(s => !(s.questions || []).some(q => q.step));
  if (ngn.length < 4 || ngn.length > 10) add('error', 'case-count', `${ngn.length} NGN cases (target 7–9)`);
  else if (ngn.length < 7 || ngn.length > 9) add('warn', 'case-count', `${ngn.length} NGN cases (target 7–9) — explain in the PR`);
  if (rapid.length !== 1 || cases.at(-1) !== rapid[0]) add('error', 'rapid-rounds', `need exactly one "Rapid rounds" scenario, placed last (found ${rapid.length})`);
  else if (rapid[0].questions.length < 4 || rapid[0].questions.length > 6) add('error', 'rapid-rounds', `Rapid rounds has ${rapid[0].questions.length} items (4–6)`);
  cases.forEach((s, i) => {
    const m = s.title?.match(/^Scenario (\d+) — \S/);
    if (!m || +m[1] !== i + 1) add('error', 'case-title', `clinical ${s.id}: title must be "Scenario ${i + 1} — Setting" (got "${s.title}")`);
    if (!s.setting?.trim()) add('error', 'case-setting', `clinical ${s.id}: empty setting`);
    if (/\bthe patient\b/i.test(s.text + (s.questions || []).map(q => q.stem).join(' '))) add('warn', 'client-wording', `clinical ${s.id}: say "the client", not "the patient"`);
  });
  for (const s of ngn) {
    const qs = s.questions || [];
    if (qs.length !== 6) add('error', 'ngn-length', `clinical ${s.id}: NGN case needs exactly 6 questions (has ${qs.length})`);
    const steps = qs.map(q => q.step);
    if (steps.join() !== STEPS.slice(0, qs.length).join()) add('error', 'ngn-steps', `clinical ${s.id}: steps must run ${STEPS.join(' → ')} (got ${steps.join(', ')})`);
    if (qs.filter(q => q.type === 'sata').length < 2) add('error', 'ngn-sata', `clinical ${s.id}: needs at least 2 SATA items`);
    for (const h of ["Nurses' Notes", 'Vital Signs', 'Laboratory Results', 'Orders'])
      if (!s.text?.includes(h)) add('warn', 'ngn-chart', `clinical ${s.id}: chart has no "${h}" section`);
  }

  // ---- flashcards ----
  const nC = cards.length, tags = new Set(cards.map(c => c.tag));
  if (nC < 40 || nC > 100) add('error', 'card-count', `${nC} flashcards (target 50–80)`);
  else if (nC < 50 || nC > 80) add('warn', 'card-count', `${nC} flashcards (target 50–80) — explain in the PR`);
  if (tags.size < 5 || tags.size > 14) add('error', 'card-tags', `${tags.size} distinct card tags (target 6–12)`);
  else if (tags.size < 6 || tags.size > 12) add('warn', 'card-tags', `${tags.size} distinct card tags (target 6–12)`);
  const longFronts = cards.filter(c => c.front.replace(/<[^>]+>/g, '').split(/\s+/).length > 20);
  if (longFronts.length) add('warn', 'card-front', `${longFronts.length} card front(s) over 20 words: ${longFronts.slice(0, 3).map(c => c.id).join(', ')}`);

  // ---- notes ----
  const notesPath = join(base, 'notes.html');
  const html = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
  const pages = (html.match(/<section class="page/g) || []).length;
  if (pages < 6 || pages > 16) add('error', 'notes-pages', `notes.html has ${pages} pages (target 7–12)`);
  else if (pages < 7 || pages > 13) add('warn', 'notes-pages', `notes.html has ${pages} pages (target 7–12)`);
  const asked = (html.match(/class="asked"/g) || []).length;
  if (!/class="end"/.test(html)) add('warn', 'notes-end', 'notes.html has no end mark (<div class="end">)');
  for (const theme of ['resp', 'met']) {
    const used = new RegExp(`class="(banner|mnem|box) [^"]*\\b${theme}\\b|\\b${theme}-(bg|t)\\b`).test(html);
    const keyed = new RegExp(`class="k ${theme}"`).test(html);
    if (used && !keyed) add('error', 'color-key', `notes use the "${theme}" theme but the cover's color key doesn't list it`);
  }
  if (/<div class="fyi"/.test(html) === false) add('warn', 'notes-fyi', 'no FYI box — fine only if the instructor marked nothing as untested');

  // ---- map ----
  const svgPath = join(base, 'map.svg'), dotPath = join(base, 'map.dot');
  if (existsSync(svgPath)) {
    const nodes = (readFileSync(svgPath, 'utf8').match(/class="node"/g) || []).length;
    if (nodes < 8 || nodes > 14) add('error', 'map-nodes', `concept map has ${nodes} nodes (8–14)`);
  }
  if (existsSync(dotPath) && existsSync(svgPath) && statSync(dotPath).mtimeMs > statSync(svgPath).mtimeMs + 1000)
    add('error', 'map-stale', 'map.dot is newer than map.svg — run node tools/render-map.mjs');

  // ---- working files (autopilot) ----
  if (folder) {
    const ex = join(folder, 'extracted');
    const read = f => { try { return JSON.parse(readFileSync(join(ex, f), 'utf8')); } catch (e) { return existsSync(join(ex, f)) ? { _error: e.message } : null; } };
    const mining = read('mining.json'), outline = read('outline.json');
    if (!mining) add('error', 'mining-missing', 'extracted/mining.json not found');
    else if (mining._error) add('error', 'mining-json', `extracted/mining.json unreadable — ${mining._error}`);
    else {
      const qs = mining.questions || [];
      if (qa.length < qs.length) add('error', 'qa-coverage', `${qs.length} in-class questions mined, ${qa.length} in "qa" — every mined question needs a qa item`);
      if (qs.length && asked < Math.ceil(qs.length / 3)) add('error', 'asked-callouts', `${asked} "asked" callouts in the notes for ${qs.length} mined questions`);
      else if (asked < qs.length) add('warn', 'asked-callouts', `${asked} "asked" callouts for ${qs.length} mined questions — the rest are in qa only`);
      if (!mining.instructors?.length) add('error', 'mining-instructors', 'mining.json names no instructor (who is who)');
    }
    if (!outline) add('error', 'outline-missing', 'extracted/outline.json not found');
    else if (outline._error) add('error', 'outline-json', `extracted/outline.json unreadable — ${outline._error}`);
    else {
      const secs = outline.sections || [];
      if (secs.length < 6 || secs.length > 13) add('error', 'outline-sections', `outline has ${secs.length} sections (7–12)`);
      const all = deckSlides(folder);
      if (all.length) {
        const covered = new Set(secs.flatMap(s => expandSlides(s.slides ?? '')).concat((outline.skippedSlides || []).flatMap(expandSlides)));
        const gap = all.filter(s => !covered.has(s));
        if (gap.length) add('error', 'slide-coverage', `${gap.length} slide(s) not mapped to any section or listed in skippedSlides: ${gap.slice(0, 12).join(', ')}`);
      }
      if (mining?.questions?.length) {
        const placed = new Set(secs.flatMap(s => s.asked || []));
        const loose = mining.questions.map((_, i) => i).filter(i => !placed.has(i));
        if (loose.length) add('error', 'outline-asked', `${loose.length} mined question(s) not placed in an outline section (indexes ${loose.slice(0, 10).join(', ')})`);
      }
    }
    reviewCheck(folder, add);
  } else add('warn', 'no-class-folder', `no class folder with id ${id} under sources/nurs419 — working-file checks skipped`);

  return findings;
}

// Supplements: the item checks above already ran on the new items; still require the independent review.
function supplementChecks(findings, add, folder) {
  if (folder) reviewCheck(folder, add);
  return findings;
}

function reviewCheck(folder, add) {
  const p = join(folder, 'extracted', 'review.json');
  if (!existsSync(p)) return add('error', 'review-missing', 'extracted/review.json not found — run the independent content review');
  let review; try { review = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { return add('error', 'review-json', `extracted/review.json unreadable — ${e.message}`); }
  const open = (review.findings || []).filter(f => f.severity === 'blocking' && f.status !== 'fixed');
  if (open.length) add('error', 'review-open', `${open.length} blocking review finding(s) not fixed: ${open.slice(0, 5).map(f => f.item).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) { console.error('usage: node tools/quality-gate.mjs <lecture-id> [--json]'); process.exit(1); }
  const findings = gate(id, { newOnly: process.argv.includes('--new-only') });
  const errors = findings.filter(f => f.severity === 'error');
  if (process.argv.includes('--json')) console.log(JSON.stringify({ id, pass: !errors.length, findings }, null, 2));
  else {
    for (const f of findings) (f.severity === 'error' ? console.error : console.warn)(`${f.severity === 'error' ? '✗' : '!'} [${f.code}] ${f.message}`);
    console.log(errors.length ? `\n✗ ${id}: ${errors.length} error(s), ${findings.length - errors.length} warning(s)` : `✓ ${id}: quality gate passed${findings.length ? ` (${findings.length} warning(s))` : ''}`);
  }
  process.exit(errors.length ? 1 : 0);
}
