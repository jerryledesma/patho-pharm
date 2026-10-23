// Bring a lecture branch up to date with origin/main before `ship` writes the ledger.
// Two lectures from one batch are cut from the same main, so once the first merges, the second's id-ledger.json
// conflicts (both append an entry at the end). Ids are kept per lecture, so the ledger never needs a real merge:
// take main's copy, and the caller re-adds this lecture with `validate.mjs --update-ledger`.
// Any other conflict is left for a human: the merge is aborted and nothing changes.
import { spawnSync } from 'node:child_process';

export function syncWithMain(cwd, { name, email, message }) {
  const git = (...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  const tail = s => (s || '').trim().split('\n').slice(-3).join('\n');
  const f = git('fetch', 'origin', 'main');
  if (f.status !== 0) return { ok: false, error: `git fetch origin main failed: ${tail(f.stderr)}` };
  if (git('merge-base', '--is-ancestor', 'origin/main', 'HEAD').status === 0) return { ok: true, step: null };
  const as = ['-c', `user.name=${name}`, '-c', `user.email=${email}`];
  const m = git(...as, 'merge', '--no-edit', '-m', message, 'origin/main');
  if (m.status === 0) return { ok: true, step: /Fast-forward/.test(m.stdout) ? 'fast-forwarded to origin/main' : 'merged origin/main' };
  const conflicts = git('diff', '--name-only', '--diff-filter=U').stdout.split('\n').filter(Boolean);
  if (conflicts.length === 1 && conflicts[0] === 'id-ledger.json') {
    git('checkout', '--theirs', '--', 'id-ledger.json');
    git('add', 'id-ledger.json');
    const c = git(...as, 'commit', '--no-edit');
    if (c.status === 0) return { ok: true, step: 'merged origin/main (id-ledger.json conflict: took main\'s copy; this lecture is re-added next)' };
  }
  git('merge', '--abort');
  return { ok: false, error: conflicts.length
    ? `merging origin/main conflicts in ${conflicts.join(', ')} — merge it by hand, then ship again`
    : `merging origin/main failed: ${tail(m.stderr || m.stdout)}` };
}
