import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { shortenTitle } from '../tools/lib/naming.mjs';
import { expandSlides, gate } from '../tools/quality-gate.mjs';

test('shortenTitle drops subtitle, parenthetical, then trailing words — never past 45', () => {
  assert.equal(shortenTitle('Pharmacology of the Autonomic Nervous System: Cholinergic & Adrenergic Drugs'), 'Pharmacology of the Autonomic Nervous System');
  assert.equal(shortenTitle('Cardiovascular Pharmacology (Antihypertensives, Antianginals and Lipids)'), 'Cardiovascular Pharmacology');
  assert.equal(shortenTitle('Fluid, Electrolyte and Acid–Base Balance and Disorders of the Kidney'), 'Fluid, Electrolyte and Acid–Base Balance');
  assert.equal(shortenTitle('Pain Management'), 'Pain Management');
  for (const t of ['A'.repeat(80), 'word '.repeat(30)]) assert.ok(shortenTitle(t).length <= 45);
});

test('expandSlides reads ranges, lists and deck prefixes', () => {
  assert.deepEqual(expandSlides('3'), ['1:3']);
  assert.deepEqual(expandSlides('3-5'), ['1:3', '1:4', '1:5']);
  assert.deepEqual(expandSlides('3–4, 2:1-2'), ['1:3', '1:4', '2:1', '2:2']);
  assert.deepEqual(expandSlides(''), []);
});

// The gate is calibrated on the approved NGN-era lectures: they must keep passing with no errors.
test('quality gate passes every approved NGN-era lecture', () => {
  const ngn = readdirSync('public/lectures').filter(id => id >= '2026-09-24' &&
    JSON.parse(readFileSync(`public/lectures/${id}/lecture.json`, 'utf8')).clinical.some(c => c.questions.some(q => q.step)));
  assert.ok(ngn.length >= 5);
  for (const id of ngn) {
    const errors = gate(id, { folder: null }).filter(f => f.severity === 'error');
    assert.deepEqual(errors, [], `${id}: ${errors.map(e => e.message).join('; ')}`);
  }
});

test('quality gate catches a broken lecture', () => {
  const errs = gate('2026-09-10-acid-base', { folder: null }).filter(f => f.severity === 'error').map(f => f.code);
  for (const code of ['src-missing', 'case-count', 'rapid-rounds']) assert.ok(errs.includes(code), code);
});
