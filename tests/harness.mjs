// Local stand-in for Netlify used by the end-to-end tests: serves public/, runs the edge gate
// in front of everything (same excludedPath rules), routes /api/* to the functions, and backs
// Netlify Blobs with a local BlobsServer. (On a normal dev machine `netlify dev` also works.)
// Usage: node tests/harness.mjs [port]   — needs SITE_PASSWORD_HASH and SESSION_SECRET in env.
import http from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BlobsServer } from '@netlify/blobs/server';
import { setEnvironmentContext } from '@netlify/blobs';
import gate, { config as gateConfig } from '../netlify/edge-functions/gate.js';
import login from '../netlify/functions/login.mjs';
import progress from '../netlify/functions/progress.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.argv[2] || 8888);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

const blobs = new BlobsServer({ directory: await mkdtemp(join(tmpdir(), 'blobs-')), token: 'local', port: 0 });
const { port: bport } = await blobs.start();
setEnvironmentContext({ siteID: 'local', token: 'local', edgeURL: `http://localhost:${bport}`, uncachedEdgeURL: `http://localhost:${bport}` });

const excluded = p => gateConfig.excludedPath.some(x => x.endsWith('*') ? p.startsWith(x.slice(0, -1)) : p === x);

async function origin(req) {
  const url = new URL(req.url);
  if (url.pathname === '/api/login' && req.method === 'POST') return login(req, {});
  const m = url.pathname.match(/^\/api\/progress(?:\/([^/]+))?$/);
  if (m) return progress(req, { params: m[1] ? { lecture: decodeURIComponent(m[1]) } : {} });
  let p = url.pathname === '/' ? '/index.html' : url.pathname === '/login' ? '/login.html' : url.pathname;
  try { return new Response(await readFile(join(ROOT, p)), { headers: { 'content-type': TYPES[extname(p)] || 'application/octet-stream' } }); }
  catch { return new Response('not found', { status: 404 }); }
}

http.createServer(async (nreq, nres) => {
  const chunks = []; for await (const c of nreq) chunks.push(c);
  const req = new Request(`http://localhost:${PORT}${nreq.url}`, { method: nreq.method, headers: nreq.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
  const path = new URL(req.url).pathname;
  const res = excluded(path) ? await origin(req) : await gate(req, { next: () => origin(req) });
  nres.writeHead(res.status, Object.fromEntries(res.headers));
  nres.end(Buffer.from(await res.arrayBuffer()));
}).listen(PORT, () => console.log(`harness on http://localhost:${PORT}`));
