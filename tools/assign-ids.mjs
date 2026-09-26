// Gives every item without an id the next unused permanent id. Existing ids are never changed.
//   node tools/assign-ids.mjs public/lectures/<id>/lecture.json
// Unused means: not in this file and not in id-ledger.json (so a deleted id is never reissued).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/assign-ids.mjs <lecture.json>'); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const L = JSON.parse(readFileSync(file, 'utf8'));
const ledgerPath = join(ROOT, 'id-ledger.json');
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8'))[L.id || basename(dirname(file))] || [] : [];

const used = new Set(ledger);
const collect = x => x?.id && used.add(x.id);
(L.practice || []).forEach(collect); (L.cards || []).forEach(collect); (L.qa || []).forEach(collect);
(L.clinical || []).forEach(s => { collect(s); (s.questions || []).forEach(collect); });

const next = (prefix, width, within = '') => {
  for (let n = 1; ; n++) { const id = `${within}${prefix}${String(n).padStart(width, '0')}`; if (!used.has(id)) { used.add(id); return id; } }
};
const withId = (x, id) => ({ id, ...Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'id')) });
let added = 0;
const fill = (arr, make) => arr.map(x => x.id ? x : (added++, withId(x, make())));

L.practice = fill(L.practice || [], () => next('p-', 3));
L.cards = fill(L.cards || [], () => next('fc-', 3));
L.qa = fill(L.qa || [], () => next('qa-', 3));
L.clinical = fill(L.clinical || [], () => next('c', 2)).map(s => ({ ...s, questions: fill(s.questions || [], () => next('q', 2, s.id + '-')) }));

writeFileSync(file, JSON.stringify(L, null, 1) + '\n');
console.log(`${added} id(s) assigned`);
