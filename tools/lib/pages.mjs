// Text from Apple Pages (.pages): a zip of snappy-compressed protobuf (.iwa) chunks.
// We decompress Index/Document.iwa and return the longest run of readable text, which is the body.
import { openZip } from './zip.mjs';

function snappy(b) {
  let i = 0, shift = 0;
  while (b[i++] & 0x80) shift += 7;           // skip uncompressed-length varint
  const out = [];
  while (i < b.length) {
    const t = b[i++], k = t & 3;
    if (k === 0) {
      let len = t >> 2;
      if (len >= 60) { const nb = len - 59; len = 0; for (let j = 0; j < nb; j++) len |= b[i + j] << (8 * j); i += nb; }
      len += 1;
      for (let j = 0; j < len; j++) out.push(b[i + j]);
      i += len; continue;
    }
    let len, off;
    if (k === 1) { len = ((t >> 2) & 7) + 4; off = ((t >> 5) << 8) | b[i++]; }
    else if (k === 2) { len = (t >> 2) + 1; off = b[i] | (b[i + 1] << 8); i += 2; }
    else { len = (t >> 2) + 1; off = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); i += 4; }
    const s = out.length - off;
    for (let j = 0; j < len; j++) out.push(out[s + j]);
  }
  return Buffer.from(out);
}

export function pagesText(path) {
  const data = openZip(path).read('Index/Document.iwa');
  const parts = [];
  for (let i = 0; i < data.length;) {
    const len = data[i + 1] | (data[i + 2] << 8) | (data[i + 3] << 16);
    parts.push(snappy(data.subarray(i + 4, i + 4 + len)));
    i += 4 + len;
  }
  const text = Buffer.concat(parts).toString('utf8');
  const runs = text.match(/[^\x00-\x08\x0b-\x1f�]{200,}/g) || [];
  const body = runs.sort((a, b) => b.length - a.length)[0] || '';
  return body.replace(/[\u2028\u2029]/g, '\n').replace(/\*\s*$/, '').trim();
}
