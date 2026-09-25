// Shared by the edge gate (Deno) and Node functions: Web Crypto only, no Node/Deno APIs.
//
// Password:  SITE_PASSWORD_HASH = "pbkdf2$<iterations>$<salt b64url>$<hash b64url>"
//            (generate with: node scripts/hash-password.mjs)
// Session:   cookie pp_session = "<expires ms>.<HMAC-SHA256(SESSION_SECRET, 'v1.'+expires) b64url>"
//            Rotating SESSION_SECRET logs out every device.

export const COOKIE = 'pp_session';
export const MAX_AGE_S = 90 * 24 * 60 * 60;

const enc = new TextEncoder();
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export function env(name) {
  const v = globalThis.Netlify?.env?.get(name) ?? (typeof process !== 'undefined' ? process.env[name] : undefined);
  if (!v) throw new Error(`missing environment variable ${name}`);
  return v;
}

// Constant-time comparison of two strings.
export function safeEqual(a, b) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password, iterations = 310000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${iterations}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, iterations))}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const got = b64url(await pbkdf2(String(password), unb64url(salt), Number(iter)));
  return safeEqual(got, hash);
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

export async function makeSession(secret, now = Date.now()) {
  const exp = now + MAX_AGE_S * 1000;
  return `${exp}.${await hmac(secret, 'v1.' + exp)}`;
}

export async function checkSession(value, secret, now = Date.now()) {
  if (!value || typeof value !== 'string') return false;
  const dot = value.indexOf('.');
  if (dot < 1) return false;
  const exp = value.slice(0, dot), sig = value.slice(dot + 1);
  if (!/^\d{13}$/.test(exp) || Number(exp) <= now) return false;
  return safeEqual(sig, await hmac(secret, 'v1.' + exp));
}

export function readCookie(req, name = COOKIE) {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookie(value, maxAge = MAX_AGE_S) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export async function isAuthed(req) {
  return checkSession(readCookie(req), env('SESSION_SECRET'));
}

// Only same-site relative paths are allowed as post-login destinations.
export function safeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
