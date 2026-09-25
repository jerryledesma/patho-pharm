// Prints a SITE_PASSWORD_HASH value and a fresh SESSION_SECRET for Netlify.
// Usage: node scripts/hash-password.mjs            (prompts, input hidden)
import { hashPassword } from '../netlify/lib/session.mjs';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';

function ask(q) {
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, a => { rl.close(); process.stdout.write('\n'); res(a); });
  });
}

const pw = process.env.PASSWORD ?? await ask('New site password: ');
if (pw.length < 12) { console.error('Use at least 12 characters (a short passphrase works well).'); process.exit(1); }
console.log('\nSITE_PASSWORD_HASH=' + await hashPassword(pw));
console.log('SESSION_SECRET=' + randomBytes(32).toString('base64url'));
console.log('\nSet both in Netlify → Site configuration → Environment variables (all deploy contexts).');
