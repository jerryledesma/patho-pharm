// Text from .pptx and .docx (Office Open XML). No dependencies.
import { openZip } from './zip.mjs';
import { posix } from 'node:path';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));

const paras = (xml, pTag, tTag) => [...xml.matchAll(new RegExp(`<${pTag}[\\s>][\\s\\S]*?</${pTag}>`, 'g'))]
  .map(m => [...m[0].matchAll(new RegExp(`<${tTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tTag}>`, 'g'))].map(t => decode(t[1])).join('').replace(/\s+/g, ' ').trim())
  .filter(Boolean);

function rels(zip, path) {
  const rp = posix.join(posix.dirname(path), '_rels', posix.basename(path) + '.rels');
  if (!zip.has(rp)) return {};
  const out = {};
  for (const m of zip.text(rp).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/Id="([^"]+)"/)[1], target = m[0].match(/Target="([^"]+)"/)[1];
    out[id] = posix.normalize(posix.join(posix.dirname(path), target));
  }
  return out;
}

// → [{ n, title, paragraphs: [...], pictures, notes: [...] }]
export function pptxSlides(path) {
  const zip = openZip(path);
  const pres = zip.text('ppt/presentation.xml'), prels = rels(zip, 'ppt/presentation.xml');
  const order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map(m => prels[m[1]]);
  return order.map((slidePath, i) => {
    const xml = zip.text(slidePath);
    let title = '';
    const body = [];
    for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []) {
      const text = paras(sp, 'a:p', 'a:t');
      if (/<p:ph[^>]*type="(title|ctrTitle)"/.test(sp) && !title) title = text.join(' / ');
      else body.push(...text);
    }
    for (const tbl of xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/g) || [])
      for (const row of tbl.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || [])
        body.push('| ' + (row.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || []).map(c => paras(c, 'a:p', 'a:t').join('; ')).join(' | ') + ' |');
    const srels = rels(zip, slidePath);
    // SmartArt keeps its text outside the slide, in ppt/diagrams/dataN.xml.
    const smartArt = Object.values(srels).filter(p => /diagrams\/data\d*\.xml$/.test(p) && zip.has(p))
      .flatMap(p => paras(zip.text(p), 'a:p', 'a:t'));
    if (smartArt.length) body.push(...smartArt.map(t => `[diagram] ${t}`));
    const charts = Object.values(srels).filter(p => /charts\/chart\d*\.xml$/.test(p)).length;
    const images = Object.values(srels).filter(p => /media\//.test(p));
    const notesPath = Object.values(srels).find(p => p.includes('notesSlide'));
    let notes = [];
    if (notesPath && zip.has(notesPath)) {
      notes = (zip.text(notesPath).match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [])
        .filter(sp => /<p:ph[^>]*type="body"/.test(sp)).flatMap(sp => paras(sp, 'a:p', 'a:t'));
    }
    return { n: i + 1, title, paragraphs: body, pictures: (xml.match(/<p:pic>/g) || []).length, images: [...new Set(images)], charts, notes };
  });
}

export function pptxMedia(path, name) { return openZip(path).read(name); }

export function docxParagraphs(path) {
  return paras(openZip(path).text('word/document.xml'), 'w:p', 'w:t');
}
