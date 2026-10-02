// Validates every lecture in public/lectures/ against schema/lecture.schema.json plus
// rules JSON Schema can't express (answer keys, uniqueness, companion files, ID ledger).
// Usage: node scripts/validate.mjs [--update-ledger]
// Zero dependencies so Netlify builds need no npm install.
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LECTURES = join(ROOT, 'public/lectures');
const LEDGER = join(ROOT, 'id-ledger.json');
const schema = JSON.parse(readFileSync(join(ROOT, 'schema/lecture.schema.json'), 'utf8'));
const updateLedger = process.argv.includes('--update-ledger');

// ---- minimal JSON Schema subset (the keywords our schema uses) ----
function check(s, v, path, errs) {
  if (s.$ref) s = s.$ref.replace('#/$defs/', '').split('/').reduce((o, k) => o[k], schema.$defs);
  const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  if (s.type && s.type !== t) return errs.push(`${path}: expected ${s.type}, got ${t}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${path}: "${v}" not one of ${s.enum.join(', ')}`);
  if (t === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${path}: "${v}" does not match ${s.pattern}`);
    if (s.minLength != null && v.length < s.minLength) errs.push(`${path}: empty`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength} characters`);
  }
  if (t === 'array') {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${path}: needs at least ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${path}: at most ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => check(s.items, x, `${path}[${i}]`, errs));
  }
  if (t === 'object') {
    for (const k of s.required || []) if (!(k in v)) errs.push(`${path}: missing "${k}"`);
    for (const [k, x] of Object.entries(v)) {
      if (s.propertyNames) check(s.propertyNames, k, `${path} key`, errs);
      if (s.properties?.[k]) check(s.properties[k], x, `${path}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${path}: unexpected field "${k}"`);
      else if (typeof s.additionalProperties === 'object') check(s.additionalProperties, x, `${path}.${k}`, errs);
    }
  }
}

// ---- rules beyond the schema ----
function checkAnswer(q, path, errs) {
  const letters = 'ABCDEF'.slice(0, q.options.length).split('');
  const ans = q.answer.split(',').map(a => a.trim());
  const bad = ans.filter(a => !letters.includes(a));
  if (bad.length) errs.push(`${path}: answer ${bad.join(',')} has no matching option`);
  if (new Set(ans).size !== ans.length) errs.push(`${path}: answer repeats a letter`);
  if (q.type === 'mc' && ans.length !== 1) errs.push(`${path}: multiple-choice needs exactly one answer`);
  if (q.type === 'order' && ans.length !== letters.length) errs.push(`${path}: priority order must rank every option`);
}

// Classes notes.html may use: everything defined in the site CSS, plus a few unstyled wrappers.
const CSS = ['notebook.css', 'app.css'].map(f => readFileSync(join(ROOT, 'public/assets/css', f), 'utf8')).join('\n');
const KNOWN = new Set([...CSS.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]).concat(['cover-title', 'yellow', 'eq-l', 'eq-r', 'eq-k', 'recap', 'doodle']));
const OK_STYLE = /^\s*(background:var\(--pink\);\s*color:var\(--pink-d\)|(top|left|right|bottom|width|height):[^;]+;?)\s*$/;

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
let failed = 0, warned = 0;
const dirs = readdirSync(LECTURES).filter(d => statSync(join(LECTURES, d)).isDirectory()).sort();

for (const dir of dirs) {
  const errs = [], warns = [];
  const base = join(LECTURES, dir);
  let L;
  try { L = JSON.parse(readFileSync(join(base, 'lecture.json'), 'utf8')); }
  catch (e) { console.error(`✗ ${dir}: lecture.json unreadable — ${e.message}`); failed++; continue; }

  check(schema, L, 'lecture', errs);
  if (L.id !== dir) errs.push(`id "${L.id}" must equal folder name "${dir}"`);
  if (L.id && L.date && !L.id.startsWith(L.date + '-')) errs.push(`id must start with the class date ${L.date}`);

  const ids = [];
  (L.practice || []).forEach((q, i) => { ids.push(q.id); if (q.options && q.answer) checkAnswer(q, `practice ${q.id ?? i}`, errs); if (L.tiers && !(q.tier in L.tiers)) errs.push(`practice ${q.id}: tier ${q.tier} has no label in "tiers"`); });
  (L.clinical || []).forEach((s, i) => { ids.push(s.id); (s.questions || []).forEach(q => { ids.push(q.id); if (!q.id?.startsWith(s.id + '-')) errs.push(`clinical ${q.id}: must start with its scenario id ${s.id}`); if (q.options && q.answer) checkAnswer(q, `clinical ${q.id}`, errs); }); });
  (L.cards || []).forEach(c => ids.push(c.id));
  (L.qa || []).forEach(x => ids.push(x.id));
  const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dupes.length) errs.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);

  for (const f of ['notes.html', 'map.svg']) if (!existsSync(join(base, f))) errs.push(`missing ${f}`);
  if (existsSync(join(base, 'notes.html')) && !/<section class="page/.test(readFileSync(join(base, 'notes.html'), 'utf8'))) errs.push('notes.html has no <section class="page"> pages');
  if (existsSync(join(base, 'notes.html'))) {
    const html = readFileSync(join(base, 'notes.html'), 'utf8');
    const unknown = [...new Set([...html.replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c && !KNOWN.has(c)))];
    if (unknown.length) errs.push(`notes.html uses classes not in the stylesheet: ${unknown.join(', ')}`);
    if (/<style|<script|<link/i.test(html)) errs.push('notes.html must not contain <style>, <script> or <link>');
    const styles = [...html.replace(/<svg[\s\S]*?<\/svg>/g, '').matchAll(/style="([^"]*)"/g)].map(m => m[1]).filter(x => !OK_STYLE.test(x));
    if (styles.length) warns.push(`notes.html has ${styles.length} inline style(s) beyond the allowed pink banner/positioning: ${styles.slice(0, 3).join(' | ')}`);
  }
  if (existsSync(join(base, 'map.svg')) && !/<svg[\s>]/.test(readFileSync(join(base, 'map.svg'), 'utf8'))) errs.push('map.svg is not an SVG');

  // Published IDs must never disappear (learner progress is keyed by them).
  const published = ledger[dir] || [];
  const gone = published.filter(x => !ids.includes(x));
  if (gone.length) errs.push(`published ids removed (would erase progress): ${gone.join(', ')}`);
  if (updateLedger && !errs.length) ledger[dir] = [...new Set([...published, ...ids])];

  // Test-wise guessing: the correct option shouldn't usually be the longest (IMP-02).
  const mcs = [...(L.practice || []), ...(L.clinical || []).flatMap(s => s.questions || [])].filter(q => q.type === 'mc' && q.options && q.answer);
  const tell = mcs.filter(q => { const i = 'ABCDEF'.indexOf(q.answer), a = q.options[i]?.length || 0;
    return a > 1.3 * Math.max(...q.options.filter((_, k) => k !== i).map(o => o.length)); }).length;
  if (mcs.length && tell / mcs.length > 0.10) warns.push(`${tell} of ${mcs.length} multiple-choice answers are >1.3× longer than every distractor (keep ≤ 10%)`);
  const items = [...(L.practice || []), ...(L.clinical || []).flatMap(s => s.questions || []), ...(L.cards || []), ...(L.qa || [])];
  const noSrc = items.filter(x => !x.src).length;
  if (noSrc) warns.push(`${noSrc} of ${items.length} items have no "src" (source link for review)`);

  if (errs.length) { failed++; console.error(`✗ ${dir}\n  - ${errs.join('\n  - ')}`); }
  else console.log(`✓ ${dir} — ${L.practice.length} practice, ${L.clinical.length} cases / ${L.clinical.reduce((a, s) => a + s.questions.length, 0)} clinical, ${L.cards.length} cards, ${L.qa.length} in-class`);
  for (const w of warns) { warned++; console.warn(`  ! ${w}`); }
}

// A lecture in the ledger whose folder is gone is also a removal.
for (const id of Object.keys(ledger)) if (!dirs.includes(id)) { failed++; console.error(`✗ ${id}: published lecture folder was removed`); }

if (updateLedger && !failed) { writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n'); console.log('ledger updated'); }
if (failed) { console.error(`\n${failed} lecture(s) failed validation`); process.exit(1); }
console.log(`\nall ${dirs.length} lecture(s) valid${warned ? ` (${warned} warning(s))` : ''}`);
