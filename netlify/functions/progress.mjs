// Progress sync.
//   GET /api/progress              → { "<lectureId>": record, ... }
//   GET /api/progress/<lectureId>  → record
//   PUT /api/progress/<lectureId>  (partial record) → merged record
// record = { v:1, items:{ "<itemId>": {…, t} }, sessions:{ "<key>": {…, t} } }
import { getStore } from '@netlify/blobs';
import { isAuthed } from '../lib/session.mjs';
import { merge, invalid, empty } from '../lib/merge.mjs';

const LECTURE = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+){0,2}$/;
const MAX_BODY = 256 * 1024;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default async (req, context) => {
  if (!(await isAuthed(req))) return json({ error: 'login required' }, 401);
  const store = getStore({ name: 'progress', consistency: 'strong' });
  const id = context.params.lecture;

  if (!id) {
    if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    const { blobs } = await store.list();
    const out = {};
    await Promise.all(blobs.map(async b => { out[b.key] = (await store.get(b.key, { type: 'json' })) || empty(); }));
    return json(out);
  }
  if (!LECTURE.test(id)) return json({ error: 'bad lecture id' }, 400);

  if (req.method === 'GET') return json((await store.get(id, { type: 'json' })) || empty());

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
    let rec; try { rec = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
    const bad = invalid(rec); if (bad) return json({ error: bad }, 400);
    const merged = merge((await store.get(id, { type: 'json' })) || empty(), rec);
    await store.setJSON(id, merged);
    return json(merged);
  }
  return json({ error: 'method not allowed' }, 405);
};

export const config = { path: ['/api/progress', '/api/progress/:lecture'], method: ['GET', 'PUT'] };
