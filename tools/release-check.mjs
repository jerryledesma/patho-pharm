// Release check (IMP-04): is anything stranded? Run before saying a change is ready, and in every
// post-deployment review.
//
//   npm run release-check
//
// Fetches origin, then reports (exit 1 if any):
//   - uncommitted changes in the working tree
//   - local branches with commits that are not on origin/main and not pushed to their own remote branch
//   - local branches whose commits are pushed but not yet merged into origin/main (an open or forgotten PR)
//   - branches built on another unmerged branch (stacked), which must merge in a fixed order
// Merged local branches are listed as safe to delete.
import { execFileSync } from 'node:child_process';

// Arguments are split on spaces (no shell), so ref formats like %(refname:short) need no quoting.
const git = c => execFileSync('git', c.split(' '), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ok = c => { try { execFileSync('git', c.split(' '), { stdio: 'ignore' }); return true; } catch { return false; } };

try { git('fetch --prune origin'); } catch (e) { console.warn(`! could not fetch origin (${e.message.split('\n')[0]}) — results use the last fetch`); }

const problems = [], merged = [];
const dirty = git('status --porcelain --untracked-files=no');
if (dirty) problems.push(`uncommitted changes:\n    ${dirty.split('\n').join('\n    ')}`);

const branches = git('for-each-ref --format=%(refname:short) refs/heads').split('\n').filter(Boolean);
const unmerged = branches.filter(b => b !== 'main' && git(`rev-list --count origin/main..${b}`) !== '0');
for (const b of branches) {
  if (b === 'main') {
    const ahead = git('rev-list --count origin/main..main');
    if (ahead !== '0') problems.push(`main has ${ahead} commit(s) not on origin/main — push them through a PR branch instead`);
    continue;
  }
  if (!unmerged.includes(b)) { merged.push(b); continue; }
  const n = git(`rev-list --count origin/main..${b}`);
  const remote = `origin/${b}`;
  const pushed = ok(`rev-parse --verify --quiet ${remote}`) && git(`rev-list --count ${remote}..${b}`) === '0';
  const base = unmerged.filter(o => o !== b && ok(`merge-base --is-ancestor ${o} ${b}`) && git(`rev-list --count origin/main..${o}`) !== '0');
  problems.push(`${b}: ${n} commit(s) not on main — ${pushed ? 'pushed, waiting for its PR to merge' : 'NOT PUSHED'}` +
    (base.length ? `; stacked on ${base.join(', ')} (merge that first)` : ''));
}

if (merged.length) console.log(`merged, safe to delete: ${merged.join(', ')}  →  git branch -d ${merged.join(' ')}`);
if (problems.length) { console.error(`✗ not ready:\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('✓ nothing stranded — every local branch is merged into origin/main');
