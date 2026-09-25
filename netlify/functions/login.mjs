// POST /api/login  (form: password, next) → sets the session cookie and redirects.
import { env, verifyPassword, makeSession, sessionCookie, safeNext } from '../lib/session.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async req => {
  let form;
  try { form = await req.formData(); } catch { return new Response('bad request', { status: 400 }); }
  const next = safeNext(form.get('next'));
  const ok = await verifyPassword(form.get('password') || '', env('SITE_PASSWORD_HASH'));
  if (!ok) {
    await sleep(1000);
    const back = `/login?error=1&next=${encodeURIComponent(next)}`;
    return new Response(null, { status: 303, headers: { location: back, 'cache-control': 'no-store' } });
  }
  const session = await makeSession(env('SESSION_SECRET'));
  return new Response(null, {
    status: 303,
    headers: { location: next, 'set-cookie': sessionCookie(session), 'cache-control': 'no-store' },
  });
};

export const config = { path: '/api/login', method: ['POST'] };
