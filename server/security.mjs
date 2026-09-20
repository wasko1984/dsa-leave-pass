import { scryptSync, randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function requireThat(condition, status, message) { if (!condition) throw new HttpError(status, message); }
export function clean(value, max = 200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function validatePassword(password) {
  requireThat(typeof password === 'string' && password.length >= 12 && password.length <= 128, 400, 'Use a password between 12 and 128 characters.');
}
export function hashPassword(password) { validatePassword(password); const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, digest] = stored.split(':'); return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(password, salt, 64));
}
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }
const SECRET = process.env.SESSION_SECRET || 'dsa-leave-pass-secret-2026-key';
export function createSignedToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createHmac('sha256', SECRET).update(data).digest('hex');
  return `${data}.${hmac}`;
}
export function verifySignedToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(data).digest('hex');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.expires && payload.expires < Date.now()) return null;
    return payload;
  } catch { return null; }
}
export function publicUser(user) { if (!user) return null; const { password, ...safe } = user; return safe; }
export function validateSignature(signature) {
  requireThat(Array.isArray(signature) && signature.length > 0 && signature.length <= 100, 400, 'Please draw your signature.');
  let count = 0;
  for (const stroke of signature) {
    requireThat(Array.isArray(stroke) && stroke.length >= 2 && stroke.length <= 2000, 400, 'Please draw a complete signature.');
    for (const p of stroke) { requireThat(Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 100), 400, 'Invalid signature coordinates.'); count++; }
  }
  requireThat(count >= 4 && count <= 10000, 400, 'Please draw a complete signature.');
  return signature;
}
