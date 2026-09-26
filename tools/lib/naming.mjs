// The naming convention from the design doc (obs_vault/patho-pharm/design, §3), as code.
// Deterministic so every lecture gets the same treatment; the user still confirms at intake.

const GENERIC = new Set(['lecture', 'lectures', 'balance', 'disorders', 'disorder', 'intro', 'introduction',
  'overview', 'nursing', 'and', 'the', 'of', 'in', 'for', 'to', 'a', 'an', 'part', 'basics', 'fundamentals', 'i', 'ii', 'iii']);
const SMALL = new Set(['and', 'or', 'of', 'the', 'in', 'on', 'for', 'to', 'a', 'an', 'vs', 'with', 'at', 'by']);
const COURSE = /\b[A-Z]{3,4}\s?\d{3}\b/g;                          // NURS 419
const TERM = /\b(fall|spring|summer|winter)\s*[-_ ]?\s*(19|20)\d{2}\b/gi;
const CRED = /^(?:[A-Z]{2,6}(?:-[A-Z]{1,3})?|PhD|PharmD|DrPH|EdD|MSc|BSc)$/;

const titleCase = w => w.split(/([–-])/).map((p, i) => /[–-]/.test(p) ? p : (/[A-Z]{2,}/.test(p) || /\d/.test(p)) ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');

/** Slide-1 title → display title. "Acid-Base Balance& Acid-Base Disorders" → "Acid–Base Balance & Disorders" */
export function cleanTitle(raw) {
  let s = String(raw).replace(COURSE, ' ').replace(TERM, ' ').replace(/\blectures?\b/gi, ' ')
    .replace(/\s*&\s*/g, ' & ').replace(/\s+and\s+/gi, ' & ').replace(/[_/|]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^[-–:·\s&]+|[-–:·\s&]+$/g, '');
  const seen = new Set(), out = [];
  for (const w of s.split(' ')) {
    const key = w.toLowerCase().replace(/[–-]/g, '-');
    if (w !== '&' && !SMALL.has(key) && seen.has(key)) continue;   // drop repeated words
    seen.add(key); out.push(w);
  }
  s = out.join(' ').replace(/(?:\s&)+\s*$/, '').replace(/&(\s&)+/g, '&');
  // Paired terms joined by an en dash: Acid-Base → Acid–Base (letters on both sides, not a range of numbers).
  s = s.replace(/\b([A-Za-z]{2,})-([A-Za-z]{2,})\b/g, '$1–$2');
  return s.split(' ').map((w, i) => (i > 0 && SMALL.has(w.toLowerCase())) ? w.toLowerCase() : titleCase(w)).join(' ');
}

/** Display title → 1–3 word slug. "Acid–Base Balance & Disorders" → "acid-base" */
export function slugFrom(title) {
  const words = title.toLowerCase().replace(/[–—]/g, '-').replace(/&/g, ' ').replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const keep = words.filter(w => !GENERIC.has(w));
  const parts = [];
  for (const w of (keep.length ? keep : words)) {
    if (parts.join('-').split('-').length + w.split('-').length > 3) break;
    parts.push(w);
    if (parts.length === 2) break;
  }
  return parts.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** "Nisa Lalani DNP,  RN" → "Nisa Lalani, DNP, RN" */
export function cleanInstructor(raw) {
  const toks = String(raw).replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
  const name = [], creds = [];
  for (const t of toks) { const c = t.replace(/\.$/, ''); if (name.length >= 2 && CRED.test(c)) creds.push(c); else name.push(t); }
  return [name.join(' '), ...creds].join(', ');
}

/** Class date from filenames/transcript header. Returns YYYY-MM-DD or null. */
export function findDate(texts, fallbackYear) {
  const all = texts.join('\n');
  const iso = all.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const year = (all.match(TERM) || [])[0]?.match(/(19|20)\d{2}/)?.[0] || all.match(/\b(20\d{2})\b/)?.[1] || String(fallbackYear);
  for (const t of texts) {
    const m = t.match(/(?:^|[\s/\\#])(\d{1,2})[-_.](\d{1,2})(?=[\s_-])/);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31)
      return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

export const lectureId = (date, slug) => `${date}-${slug}`;
export const folderName = (date, slug) => `${date}_${slug}`;
