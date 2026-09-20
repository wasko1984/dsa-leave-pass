import { createApp } from '../server/app.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbPath = process.env.DATABASE_PATH || (process.env.VERCEL ? join(tmpdir(), 'dsa.sqlite') : undefined);
const app = createApp({ dbPath, secureCookies: process.env.COOKIE_SECURE === 'true' || process.env.VERCEL === '1' });

export default function handler(req, res) {
  return app.server.emit('request', req, res);
}
