// Step 1 of lecture-to-study-kit: sort the inbox into a class folder named per the convention.
//
//   node tools/intake.mjs [<inbox> <course-dir>]          → dry run: prints the plan as JSON
//     (defaults: sources/inbox and sources/nurs419 in this repo — git-ignored)
//   node tools/intake.mjs [<inbox> <course-dir>] --apply [--date YYYY-MM-DD] [--title "..."]
//                                             [--slug x-y] [--instructor "..."]
//
// Files are classified by content: a deck → slides, timestamped speaker text → transcript,
// anything else → supplemental (supp-NN_description). Nothing is overwritten; moves only.
// If a class folder for the same date already exists, files are added to it (add-only mode).
import { readdirSync, statSync, mkdirSync, renameSync, existsSync, writeFileSync, readFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile } from './extract.mjs';
import { pptxSlides } from './lib/office.mjs';
import { cleanTitle, slugFrom, cleanInstructor, findDate, lectureId, folderName } from './lib/naming.mjs';

const args = process.argv.slice(2);
// Defaults: the git-ignored sources/ folder in the repo (course material never leaves this Mac).
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const positional = args.filter(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const [inbox, courseDir] = [positional[0] || join(REPO, 'sources/inbox'), positional[1] || join(REPO, 'sources/nurs419')];
const opt = k => { const i = args.indexOf('--' + k); return i > -1 ? args[i + 1] : undefined; };
if (!existsSync(inbox)) { console.error(`no inbox at ${inbox} — usage: node tools/intake.mjs [<inbox> <course-dir>] [--apply] [--date] [--title] [--slug] [--instructor]`); process.exit(1); }

const TS = /^\s*\[?\(?\d{1,2}:\d{2}(?::\d{2})?/m;
mkdirSync(courseDir, { recursive: true });
const files = readdirSync(inbox).filter(f => !f.startsWith('.') && statSync(join(inbox, f)).isFile()).sort();
const plan = { files: [], warnings: [] };
let slidesMeta = null, transcriptHeader = '';

for (const f of files) {
  const p = join(inbox, f), ext = extname(f).toLowerCase();
  let role = 'supplemental', note = '';
  if (ext === '.pptx') { role = 'slides'; slidesMeta ??= pptxSlides(p)[0]; }
  else if (ext === '.key' || ext === '.ppt' || ext === '.doc') { role = 'unsupported'; note = `export as ${ext === '.doc' ? '.docx' : '.pptx or .pdf'} first`; }
  else if (ext === '.pdf') { role = /slide|lecture|deck|ppt/i.test(f) ? 'slides' : 'supplemental'; note = 'PDF — role guessed from the file name; confirm'; }
  else {
    try {
      const text = extractFile(p) || '';
      const stamps = (text.match(new RegExp(TS.source, 'gm')) || []).length;
      if (stamps >= 10) { role = 'transcript'; transcriptHeader = text.split('\n').filter(l => l.trim() && !l.startsWith('Words per speaker')).slice(0, 3).join(' '); }
    } catch (e) { role = 'unsupported'; note = e.message; }
  }
  plan.files.push({ file: f, role, note });
}

const slidesN = plan.files.filter(x => x.role === 'slides').length, trN = plan.files.filter(x => x.role === 'transcript').length;
if (slidesN > 1) plan.warnings.push('more than one slide deck — keep one as slides, mark the rest supplemental');
if (trN > 1) plan.warnings.push('more than one transcript — merge them or mark extras supplemental');
for (const x of plan.files.filter(x => x.role === 'unsupported')) plan.warnings.push(`${x.file}: ${x.note}`);

const rawTitle = slidesMeta?.title || '';
const title = opt('title') || cleanTitle(rawTitle);
const instructorRaw = slidesMeta?.paragraphs?.find(p => /\b(DNP|PhD|RN|MD|PharmD|APRN|MSN|NP|DrPH|EdD)\b/.test(p)) || '';
const instructor = opt('instructor') || (instructorRaw ? cleanInstructor(instructorRaw) : '');
const found = findDate([transcriptHeader, ...files], new Date().getFullYear());
const date = opt('date') || found;
const dateSource = opt('date') ? '--date' : found ? (findDate([transcriptHeader], new Date().getFullYear()) ? `transcript header: "${transcriptHeader.slice(0, 80).trim()}…"` : 'file names') : null;
const slug = opt('slug') || slugFrom(title);
const existing = date && existsSync(courseDir) ? readdirSync(courseDir).find(d => d.startsWith(date + '_')) : null;
if (!date) plan.warnings.push('no class date found — pass --date YYYY-MM-DD');
if (!existing) {   // a new lecture needs its own metadata; add-only reuses the folder's intake.json
  if (!title) plan.warnings.push('no title found on slide 1 — pass --title');
  if (title.length > 45) plan.warnings.push(`title is ${title.length} characters (max 45) — shorten with --title`);
  if (!instructor) plan.warnings.push('no instructor found on slide 1 — pass --instructor');
}
const folder = date && slug ? join(courseDir, folderName(date, slug)) : null;
const target = existing ? join(courseDir, existing) : folder;
let nextSupp = 1;
if (target && existsSync(target)) for (const f of readdirSync(target)) { const m = f.match(/^supp-(\d{2})_/); if (m) nextSupp = Math.max(nextSupp, +m[1] + 1); }

for (const x of plan.files) {
  const ext = extname(x.file).toLowerCase();
  if (x.role === 'slides') x.to = 'slides' + ext;
  else if (x.role === 'transcript') x.to = 'transcript' + ext;
  else if (x.role === 'supplemental') {
    const desc = basename(x.file, ext).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 5).join('-');
    x.to = `supp-${String(nextSupp++).padStart(2, '0')}_${desc}${ext}`;
  }
  if (x.to && target && existsSync(join(target, x.to))) { plan.warnings.push(`${x.to} already exists in ${basename(target)} — rename or remove before applying`); x.to = null; }
}

Object.assign(plan, {
  mode: existing ? 'add-only (class folder exists)' : 'new lecture',
  id: existing ? existing.replace('_', '-') : (date && slug ? lectureId(date, slug) : null),
  folder: target, date, dateSource, title, rawTitle, instructor, slug,
});

if (!args.includes('--apply')) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

const blocking = plan.warnings.filter(w => /no class date|no title|max 45|already exists|more than one/.test(w));
if (!target || blocking.length) { console.error('Not applying:\n- ' + (blocking.join('\n- ') || 'missing date/slug')); process.exit(1); }
mkdirSync(target, { recursive: true });
for (const x of plan.files) if (x.to) {
  const from = join(inbox, x.file), to = join(target, x.to);
  try { renameSync(from, to); } catch { copyFileSync(from, to); try { unlinkSync(from); } catch { plan.warnings.push(`copied ${x.file} but could not remove it from the inbox`); } }
}
const metaPath = join(target, 'intake.json');
const prev = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
const meta = { ...prev, id: plan.id, date, title: prev.title || title, instructor: prev.instructor || instructor,
  sources: [...new Set([...(prev.sources || []), ...plan.files.filter(x => x.to).map(x => x.to)])].sort() };
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify({ applied: true, folder: target, meta, warnings: plan.warnings }, null, 2));
