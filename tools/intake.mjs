// Step 1 of lecture-to-study-kit: sort the inbox into class folders named per the convention.
//
//   node tools/intake.mjs [<inbox> <course-dir>]          → dry run: prints one plan per lecture as JSON
//     (defaults: sources/inbox and sources/nurs419 in this repo — git-ignored)
//   node tools/intake.mjs [...] --apply [--only <inbox-folder>] [--date YYYY-MM-DD] [--title "..."]
//                                       [--slug x-y] [--instructor "..."]
//
// Each folder in the inbox is one lecture (its name is a date/title hint, e.g. 2026_10_01_Antimicrobial).
// Files sitting loose in the inbox form one more lecture. With several lectures, --apply needs --only.
// Files are classified by content: decks → slides (slides-1, slides-2… if several), timestamped speaker
// text → transcript, recordings → audio-NN, anything else → supplemental (supp-NN_description).
// Nothing is overwritten; files are moved. If a class folder with the same date AND slug exists, files are
// added to it (add-only mode); a different slug on the same date is a separate lecture.
import { readdirSync, statSync, mkdirSync, renameSync, existsSync, writeFileSync, readFileSync, copyFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from './extract.mjs';
import { pptxSlides } from './lib/office.mjs';
import { cleanTitle, slugFrom, cleanInstructor, findDate, lectureId, folderName } from './lib/naming.mjs';

const args = process.argv.slice(2);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const valued = new Set(['--only', '--date', '--title', '--slug', '--instructor']);
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.has(args[i - 1]));
const [inbox, courseDir] = [positional[0] || join(REPO, 'sources/inbox'), positional[1] || join(REPO, 'sources/nurs419')];
const opt = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : undefined; };
if (!existsSync(inbox)) { console.error(`no inbox at ${inbox}`); process.exit(1); }
mkdirSync(courseDir, { recursive: true });

const TS = /^\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?/m;
const AUDIO = new Set(['.m4a', '.mp3', '.wav', '.aac', '.mp4', '.mov', '.webm', '.ogg', '.opus', '.flac']);
const visible = d => readdirSync(d).filter(f => !f.startsWith('.'));
const year = new Date().getFullYear();

// Group the inbox: one group per subfolder, plus one for loose files.
const groups = [];
const loose = visible(inbox).filter(f => statSync(join(inbox, f)).isFile());
if (loose.length) groups.push({ name: '', files: loose.sort() });
for (const d of visible(inbox).filter(f => statSync(join(inbox, f)).isDirectory()).sort())
  groups.push({ name: d, files: visible(join(inbox, d)).filter(f => statSync(join(inbox, d, f)).isFile()).sort().map(f => join(d, f)) });

// A title hint from the folder name: "2026_10_01_Autonomic_Nervous_System" → "Autonomic Nervous System".
const folderTitle = name => name.replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_ ]*/, '').replace(/[_+]+/g, ' ').trim();

function planGroup(g, overrides = {}) {
  const plan = { inboxFolder: g.name || '(loose files)', files: [], warnings: [] };
  const decks = []; let transcriptHeader = '';
  for (const f of g.files) {
    const p = join(inbox, f), ext = extname(f).toLowerCase();
    let role = 'supplemental', note = '';
    if (ext === '.pptx') { role = 'slides'; try { decks.push(pptxSlides(p)[0]); } catch (e) { note = e.message; } }
    else if (['.key', '.ppt', '.doc'].includes(ext)) { role = 'unsupported'; note = `export as ${ext === '.doc' ? '.docx' : '.pptx or .pdf'} first`; }
    else if (AUDIO.has(ext)) role = 'audio';
    else if (ext === '.pdf') { role = /slide|lecture|deck|ppt/i.test(f) ? 'slides' : 'supplemental'; note = 'PDF — role guessed from the file name; confirm'; }
    else {
      try {
        const text = extractFile(p) || '';
        if ((text.match(new RegExp(TS.source, 'gm')) || []).length >= 10) {
          role = 'transcript';
          transcriptHeader = text.split('\n').filter(l => l.trim() && !l.startsWith('Words per speaker')).slice(0, 3).join(' ');
        }
      } catch (e) { role = 'unsupported'; note = e.message; }
    }
    plan.files.push({ file: f, role, note });
  }
  const n = r => plan.files.filter(x => x.role === r).length;
  if (n('transcript') > 1) plan.warnings.push('more than one transcript — merge them or mark extras supplemental');
  for (const x of plan.files.filter(x => x.role === 'unsupported')) plan.warnings.push(`${x.file}: ${x.note}`);
  if (!n('transcript') && n('audio')) plan.warnings.push('no transcript — run tools/transcribe.py after intake (audio is kept in order of file name; rename first if that order is wrong)');
  if (!n('slides')) plan.warnings.push('no slide deck — title comes from the folder name; notes will be built from the transcript and supplements');

  // Title: --title > single deck's slide 1 > folder name (no deck, or several decks).
  const hint = folderTitle(g.name);
  const rawTitle = decks.length === 1 ? decks[0].title || '' : hint;
  const title = overrides.title || cleanTitle(rawTitle || hint);
  const instructorRaw = decks.flatMap(d => d.paragraphs || []).find(p => /\b(DNP|PhD|RN|MD|PharmD|APRN|MSN|NP|DrPH|EdD)\b/.test(p)) || '';
  const instructor = overrides.instructor || (instructorRaw ? cleanInstructor(instructorRaw) : '');
  const found = findDate([g.name, transcriptHeader, ...g.files], year);
  const date = overrides.date || found;
  const dateSource = overrides.date ? '--date' : !found ? null : findDate([g.name], year) ? `folder name "${g.name}"` : findDate([transcriptHeader], year) ? 'transcript header' : 'file names';
  const slug = overrides.slug || slugFrom(title);
  const sameDate = date ? visible(courseDir).filter(d => d.startsWith(date + '_')) : [];
  const existing = sameDate.find(d => d === folderName(date, slug));
  if (!date) plan.warnings.push('no class date found — pass --date YYYY-MM-DD');
  if (!existing) {
    if (!title) plan.warnings.push('no title found — pass --title');
    if (title.length > 45) plan.warnings.push(`title is ${title.length} characters (max 45) — shorten with --title`);
    if (!instructor) plan.warnings.push('no instructor found on the slides — pass --instructor');
    if (sameDate.length) plan.warnings.push(`note: ${sameDate.join(', ')} is on the same date — this will be a separate lecture (use that folder's --slug to add to it instead)`);
  }
  const target = date && slug ? join(courseDir, folderName(date, slug)) : null;
  let nextSupp = 1;
  if (target && existsSync(target)) for (const f of visible(target)) { const m = f.match(/^supp-(\d{2})_/); if (m) nextSupp = Math.max(nextSupp, +m[1] + 1); }
  const audio = plan.files.filter(x => x.role === 'audio'), slides = plan.files.filter(x => x.role === 'slides');
  for (const x of plan.files) {
    const ext = extname(x.file).toLowerCase();
    if (x.role === 'slides') x.to = slides.length > 1 ? `slides-${slides.indexOf(x) + 1}${ext}` : 'slides' + ext;
    else if (x.role === 'transcript') x.to = 'transcript' + ext;
    else if (x.role === 'audio') x.to = `audio-${String(audio.indexOf(x) + 1).padStart(2, '0')}${ext}`;
    else if (x.role === 'supplemental') {
      const desc = basename(x.file, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 6).join('-');
      x.to = `supp-${String(nextSupp++).padStart(2, '0')}_${desc}${ext}`;
    }
    if (x.to && target && existsSync(join(target, x.to))) { plan.warnings.push(`${x.to} already exists in ${basename(target)} — rename or remove before applying`); x.to = null; }
  }
  return Object.assign(plan, {
    mode: existing ? 'add-only (class folder exists)' : 'new lecture',
    id: date && slug ? lectureId(date, slug) : null, folder: target, date, dateSource, title, rawTitle, instructor, slug,
  });
}

if (!args.includes('--apply')) {
  console.log(JSON.stringify(groups.map(g => planGroup(g)), null, 2));
  process.exit(0);
}

const only = opt('only');
const chosen = only !== undefined ? groups.filter(g => g.name === only || (only === '' && !g.name)) : groups;
if (groups.length > 1 && only === undefined) { console.error(`The inbox holds ${groups.length} lectures — apply one at a time with --only "<inbox folder>".`); process.exit(1); }
if (!chosen.length) { console.error(`no inbox folder named "${only}"`); process.exit(1); }
const plan = planGroup(chosen[0], { date: opt('date'), title: opt('title'), slug: opt('slug'), instructor: opt('instructor') });
const blocking = plan.warnings.filter(w => /no class date|no title|max 45|already exists|more than one transcript/.test(w));
if (!plan.folder || blocking.length) { console.error('Not applying:\n- ' + (blocking.join('\n- ') || 'missing date/slug')); process.exit(1); }
mkdirSync(plan.folder, { recursive: true });
for (const x of plan.files) if (x.to) {
  const from = join(inbox, x.file), to = join(plan.folder, x.to);
  try { renameSync(from, to); } catch { copyFileSync(from, to); try { unlinkSync(from); } catch { plan.warnings.push(`copied ${x.file} but could not remove it from the inbox`); } }
}
if (chosen[0].name) try { const d = join(inbox, chosen[0].name); for (const f of readdirSync(d)) if (f === '.DS_Store') unlinkSync(join(d, f)); rmdirSync(d); } catch {}
const metaPath = join(plan.folder, 'intake.json');
const prev = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
const meta = { ...prev, id: plan.id, date: plan.date, title: prev.title || plan.title, instructor: prev.instructor || plan.instructor,
  sources: [...new Set([...(prev.sources || []), ...plan.files.filter(x => x.to).map(x => x.to)])].sort() };
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify({ applied: true, folder: plan.folder, meta, warnings: plan.warnings }, null, 2));
