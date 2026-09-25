import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, makeSession, checkSession, safeNext, safeEqual, MAX_AGE_S } from '../netlify/lib/session.mjs';
import { merge, invalid } from '../netlify/lib/merge.mjs';

test('password hash verifies only the right password', async () => {
  const h = await hashPassword('correct horse battery', 1000);
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('session: valid, expired, tampered, wrong secret, malformed', async () => {
  const now = Date.now();
  const s = await makeSession('secret-1', now);
  assert.equal(await checkSession(s, 'secret-1', now), true);
  assert.equal(await checkSession(s, 'secret-1', now + MAX_AGE_S * 1000 + 1), false, 'expired');
  const [exp, sig] = s.split('.');
  assert.equal(await checkSession(`${Number(exp) + 1000}.${sig}`, 'secret-1', now), false, 'extended expiry');
  assert.equal(await checkSession(`${exp}.${sig.slice(0, -1)}A`, 'secret-1', now), false, 'tampered sig');
  assert.equal(await checkSession(s, 'secret-2', now), false, 'rotated secret');
  for (const bad of [null, '', 'abc', '.', '123.abc']) assert.equal(await checkSession(bad, 'secret-1', now), false);
});

test('safeNext only allows same-site paths', () => {
  assert.equal(safeNext('/#/2026-09-10-acid-base/cards'), '/#/2026-09-10-acid-base/cards');
  for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', null, 'x']) assert.equal(safeNext(bad), '/');
});

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('merge keeps the latest entry per key', () => {
  const a = { items: { 'p-001': { last: 0, t: 1 }, 'p-002': { last: 1, t: 5 } }, sessions: { 'cards:deck': { done: 1, t: 9 } } };
  const b = { items: { 'p-001': { last: 1, t: 2 }, 'p-002': { last: 0, t: 3 } }, sessions: { 'cards:deck': { queue: [], t: 4 } } };
  const m = merge(a, b);
  assert.equal(m.items['p-001'].last, 1);
  assert.equal(m.items['p-002'].last, 1);
  assert.equal(m.sessions['cards:deck'].done, 1);
  assert.deepEqual(merge(a, b), merge(b, a));
});

test('invalid rejects bad keys and missing timestamps', () => {
  assert.equal(invalid({ items: { 'p-001': { t: 1 } } }), null);
  assert.match(invalid({ items: { '../x': { t: 1 } } }), /bad items key/);
  assert.match(invalid({ items: { 'p-001': {} } }), /numeric t/);
  assert.match(invalid([]), /object/);
});
