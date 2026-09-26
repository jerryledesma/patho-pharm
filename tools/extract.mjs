// Extracts source text for a lecture, keeping where each piece came from.
//   node tools/extract.mjs <class-folder>     → writes <class-folder>/extracted/*.md
//   node tools/extract.mjs <file>             → prints markdown to stdout
// Slides keep "## Slide N" headings, transcripts keep timestamps, supplements keep page/paragraph order.
// PDFs are not parsed here: open them with Claude's Read tool (it sees the pages, including images).
import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { pptxSlides, pptxMedia, docxParagraphs } from './lib/office.mjs';
import { pagesText } from './lib/pages.mjs';

// Transcript header: words per speaker, so the instructor (who talks most) is easy to spot.
function speakerSummary(text) {
  const words = {}; let who = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+(.{1,40}?)\s*:?\s*$/);
    if (m) { who = m[1]; words[who] ??= 0; continue; }
    if (who) words[who] += line.split(/\s+/).filter(Boolean).length;
  }
  const rows = Object.entries(words).sort((a, b) => b[1] - a[1]);
  return rows.length > 1 ? 'Words per speaker (the instructor usually talks most): ' + rows.map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' · ') + '\n\n' : '';
}

export function extractFile(file, { imagesDir } = {}) {
  const ext = extname(file).toLowerCase(), name = basename(file);
  if (ext === '.pptx') {
    const slides = pptxSlides(file);
    if (imagesDir) {
      mkdirSync(imagesDir, { recursive: true });
      for (const s of slides) s.images.forEach((m, k) => {
        const out = `slide-${String(s.n).padStart(2, '0')}-${k + 1}${extname(m)}`;
        writeFileSync(join(imagesDir, out), pptxMedia(file, m)); (s.saved ||= []).push(out);
      });
    }
    return `# ${name}\n\n${slides.length} slides\n\n` + slides.map(s =>
      `## Slide ${s.n}${s.title ? ` — ${s.title}` : ''}\n` +
      s.paragraphs.map(p => p.startsWith('|') ? p : `- ${p}`).join('\n') +
      (s.pictures ? `\n_[${s.pictures} image${s.pictures > 1 ? 's' : ''} on this slide${s.saved ? ` → extracted/images/${s.saved.join(', ')}` : ''} — look at it if the text above seems incomplete]_` : '') +
      (s.charts ? `\n_[chart on this slide — its data isn't extracted; look at the slide]_` : '') +
      (!s.paragraphs.length && !s.title ? '\n_[no text found — check this slide visually]_' : '') +
      (s.notes.length ? `\n\nSpeaker notes:\n${s.notes.map(p => `> ${p}`).join('\n')}` : '')).join('\n\n') + '\n';
  }
  if (ext === '.docx') return `# ${name}\n\n` + docxParagraphs(file).map((p, i) => `[¶${i + 1}] ${p}`).join('\n\n') + '\n';
  if (ext === '.pages') { const t = pagesText(file); return `# ${name}\n\n` + speakerSummary(t) + t + '\n'; }
  if (ext === '.txt' || ext === '.md' || ext === '.vtt' || ext === '.srt') { const t = readFileSync(file, 'utf8').trim(); return `# ${name}\n\n` + speakerSummary(t) + t + '\n'; }
  if (ext === '.pdf') return null;
  throw new Error(`don't know how to read ${name} — export it as .pptx, .docx, .txt or .pdf`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) { console.error('usage: node tools/extract.mjs <class-folder | file>'); process.exit(1); }
  if (statSync(target).isFile()) {
    const md = extractFile(target);
    console.log(md ?? `${target} is a PDF — read it with the Read tool.`);
  } else {
    const out = join(target, 'extracted'); mkdirSync(out, { recursive: true });
    for (const f of readdirSync(target).sort()) {
      const p = join(target, f);
      if (!statSync(p).isFile() || !/^(slides|transcript|supp-\d{2}_)/.test(f)) continue;
      const md = extractFile(p, { imagesDir: join(out, 'images') });
      const stem = basename(f, extname(f));
      if (md == null) { console.log(`• ${f}: PDF — read it with the Read tool`); continue; }
      writeFileSync(join(out, stem + '.md'), md);
      console.log(`• ${f} → extracted/${stem}.md (${md.length.toLocaleString()} chars)`);
    }
  }
}
