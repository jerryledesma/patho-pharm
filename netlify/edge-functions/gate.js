// Password gate in front of every request except the login page and what it needs to render.
import { isAuthed } from '../lib/session.mjs';

export default async (req, context) => {
  let ok = false;
  try { ok = await isAuthed(req); } catch (e) { console.error('gate:', e.message); }
  if (ok) return context.next();

  const url = new URL(req.url);
  const wantsHtml = (req.headers.get('accept') || '').includes('text/html') && !url.pathname.startsWith('/api/');
  if (!wantsHtml) {
    return new Response(JSON.stringify({ error: 'login required' }), {
      status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  // Browsers carry the #fragment across this redirect; login.html folds it back into ?next.
  const login = new URL('/login', url);
  login.searchParams.set('next', url.pathname + url.search);
  return new Response(null, { status: 302, headers: { location: login.pathname + login.search, 'cache-control': 'no-store' } });
};

export const config = {
  path: '/*',
  excludedPath: ['/login', '/login.html', '/api/login', '/robots.txt', '/assets/css/*', '/assets/fonts/*'],
};
