import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncWithMain } from '../tools/lib/sync-main.mjs';

const who = { name: 'test', email: 'test@example.com', message: 'Merge origin/main\n' };
const ledger = o => JSON.stringify(o, null, 1) + '\n';

// A bare origin with main = { lecture A }, and a clone with a lecture branch cut from it.
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'sync-main-'));
  const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', stdio: 'pipe' });
  const origin = join(dir, 'origin.git'), work = join(dir, 'work'), other = join(dir, 'other');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  writeFileSync(join(work, 'id-ledger.json'), ledger({ a: ['p-001'] }));
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'A'); git(work, 'push', '-q', 'origin', 'main');
  git(work, 'switch', '-q', '-c', 'lecture/c');
  git(dir, 'clone', '-q', origin, other);
  // Meanwhile lecture B merges to main from elsewhere.
  const landB = (extra = {}) => {
    mkdirSync(join(other, 'public/lectures/b'), { recursive: true });
    writeFileSync(join(other, 'public/lectures/b/lecture.json'), '{}\n');
    writeFileSync(join(other, 'id-ledger.json'), ledger({ a: ['p-001'], b: ['p-001'] }));
    for (const [f, t] of Object.entries(extra)) writeFileSync(join(other, f), t);
    git(other, 'add', '.'); git(other, 'commit', '-q', '-m', 'B'); git(other, 'push', '-q', 'origin', 'main');
  };
  return { dir, work, git, landB };
}

test('first ship: fast-forwards and leaves the uncommitted lecture alone', () => {
  const { dir, work, landB } = repo();
  landB();
  mkdirSync(join(work, 'public/lectures/c'), { recursive: true });
  writeFileSync(join(work, 'public/lectures/c/lecture.json'), '{"new":true}\n');
  const r = syncWithMain(work, who);
  assert.equal(r.ok, true, r.error);
  assert.match(r.step, /fast-forward/);
  assert.ok(existsSync(join(work, 'public/lectures/b/lecture.json')));
  assert.equal(readFileSync(join(work, 'public/lectures/c/lecture.json'), 'utf8'), '{"new":true}\n');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(work, 'id-ledger.json'), 'utf8'))), ['a', 'b']);
  rmSync(dir, { recursive: true, force: true });
});

test('already current: does nothing', () => {
  const { dir, work } = repo();
  assert.deepEqual(syncWithMain(work, who), { ok: true, step: null });
  rmSync(dir, { recursive: true, force: true });
});

test('re-ship: a ledger-only conflict takes main\'s ledger and commits the merge', () => {
  const { dir, work, git, landB } = repo();
  mkdirSync(join(work, 'public/lectures/c'), { recursive: true });
  writeFileSync(join(work, 'public/lectures/c/lecture.json'), '{}\n');
  writeFileSync(join(work, 'id-ledger.json'), ledger({ a: ['p-001'], c: ['p-001'] }));
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'C');
  landB();
  const r = syncWithMain(work, who);
  assert.equal(r.ok, true, r.error);
  assert.match(r.step, /took main's copy/);
  assert.deepEqual(JSON.parse(readFileSync(join(work, 'id-ledger.json'), 'utf8')), { a: ['p-001'], b: ['p-001'] });
  assert.equal(git(work, 'status', '--porcelain'), '');
  assert.equal(git(work, 'log', '-1', '--format=%an %s'), 'test Merge origin/main\n');
  rmSync(dir, { recursive: true, force: true });
});

test('any other conflict: aborts the merge and reports it', () => {
  const { dir, work, git, landB } = repo();
  writeFileSync(join(work, 'README.md'), 'branch\n');
  writeFileSync(join(work, 'id-ledger.json'), ledger({ a: ['p-001'], c: ['p-001'] }));
  git(work, 'add', '.'); git(work, 'commit', '-q', '-m', 'C');
  const head = git(work, 'rev-parse', 'HEAD');
  landB({ 'README.md': 'main\n' });
  const r = syncWithMain(work, who);
  assert.equal(r.ok, false);
  assert.match(r.error, /README\.md/);
  assert.equal(git(work, 'rev-parse', 'HEAD'), head);
  assert.equal(git(work, 'status', '--porcelain'), '');
  rmSync(dir, { recursive: true, force: true });
});
