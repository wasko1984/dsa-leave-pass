import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { openDatabase, transaction, audit } from './db.mjs';
import { clean, requireThat, HttpError, hashPassword, verifyPassword, tokenHash, publicUser } from './security.mjs';
import { ROLES, getApplication, canView, present, saveApplication, decide, adminApplication } from './workflow.mjs';
import { generatePDF } from './pdf.mjs';
import { createRecovery, emailAddress } from './recovery.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const dummyHash = hashPassword('Unusable-dummy-password-123!');
const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.JPG': 'image/jpeg' };

export function createApp({ dbPath = fileURLToPath(new URL('../data/dsa.sqlite', import.meta.url)), secureCookies = process.env.COOKIE_SECURE === 'true', recovery = {} } = {}) {
  const db = openDatabase(dbPath), attempts = new Map();
  const passwordRecovery = createRecovery(db, recovery);
  const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  
  function session(req, res, user) {
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)').run(tokenHash(token), user.id, Date.now() + 8 * 3600000);
    const isHttps = secureCookies || req.headers['x-forwarded-proto'] === 'https' || req.socket?.encrypted === true;
    res.setHeader('Set-Cookie', `dsa_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${isHttps ? '; Secure' : ''}`);
    return token;
  }
  
  function cookie(req) {
    return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('dsa_session='))?.slice(12) || '';
  }
  
  function authenticate(req) {
    const token = cookie(req);
    requireThat(token, 401, 'Please sign in to continue.');
    const user = db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(tokenHash(token), Date.now());
    requireThat(user, 401, 'Please sign in to continue.');
    return user;
  }
  
  function throttle(req, identity = 'setup') {
    const now = Date.now();
    for (const [key, item] of attempts) if (now > item.until) attempts.delete(key);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';
    const key = `${ip}:${identity}`, item = attempts.get(key) || { count: 0, until: now + 15 * 60000 };
    requireThat(item.count < 20, 429, 'Too many attempts. Please try again in 15 minutes.'); item.count++; attempts.set(key, item);
    return () => attempts.delete(key);
  }
  
  async function body(req) {
    let size = 0, parts = [];
    for await (const chunk of req) { size += chunk.length; requireThat(size <= 5 * 1024 * 1024, 413, 'Request too large. Attachments must be under 3 MB.'); parts.push(chunk); }
    try { const data = JSON.parse(Buffer.concat(parts).toString() || '{}'); requireThat(data && typeof data === 'object' && !Array.isArray(data), 400, 'Invalid request.'); return data; }
    catch (e) { if (e.status) throw e; throw new HttpError(400, 'Invalid JSON request.'); }
  }
  
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        requireThat(method === 'GET' || method === 'HEAD', 405, 'Method not allowed.');
        const allowed = ['/', '/index.html', '/app.js', '/signature.js', '/styles.css', '/favicon.svg', '/logo.JPG'];
        requireThat(allowed.includes(path), 404, 'Page not found.');
        const file = path === '/' ? '/index.html' : path;
        res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(method === 'HEAD' ? undefined : readFileSync(join(publicDir, file))); return;
      }
      if (writeMethods.includes(method)) {
        const origin = req.headers.origin;
        if (origin) {
          let valid = false;
          try {
            const u = new URL(origin);
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            valid = (u.protocol === 'http:' || u.protocol === 'https:') && u.host === host;
          } catch {}
          requireThat(valid, 403, 'This request must come from the application.');
        }
        requireThat(req.headers['content-type']?.startsWith('application/json'), 415, 'Use JSON for this request.');
      }
      if (path === '/api/setup' && method === 'GET') return send(res, 200, { required: !db.prepare('SELECT id FROM users LIMIT 1').get() });
      if (path === '/api/setup' && method === 'POST') {
        throttle(req); const input = await body(req);
        const user = transaction(db, () => {
          requireThat(!db.prepare('SELECT id FROM users LIMIT 1').get(), 409, 'Setup is already complete. Please sign in.');
          const username = clean(input.username).toLowerCase(), name = clean(input.name);
          requireThat(/^[a-z0-9._-]{3,40}$/.test(username) && name, 400, 'Enter your name and a username of 3–40 letters, numbers, dots or underscores.');
          const email = emailAddress(input.email || `${username}@example.com`, true);
          const u = { id: randomUUID(), username, name, role: 'admin', directorate: 'Administration', appointment: 'System Administrator', rank: '', active: 1, email, must_change_password: 0 };
          db.prepare('INSERT INTO users(id,username,password,name,role,directorate,appointment,rank,email,must_change_password) VALUES(?,?,?,?,?,?,?,?,?,0)').run(u.id, username, hashPassword(input.password), name, u.role, u.directorate, u.appointment, '', email);
          audit(db, u, 'setup.complete', u.id); return u;
        }); session(req, res, user); return send(res, 201, publicUser(user));
      }
      if (path === '/api/login' && method === 'POST') {
        const input = await body(req), username = clean(input.username).toLowerCase(), clearAttempts = throttle(req, 'login:' + username), u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
        const valid = verifyPassword(input.password, u?.password || dummyHash);
        if (!u || !valid || !u.active) {
          if (u) audit(db, u, 'session.login_failed', u.id, 'Invalid credentials');
          requireThat(false, 401, 'Incorrect username or password.');
        }
        clearAttempts(); session(req, res, u); audit(db, u, 'session.login', u.id); return send(res, 200, publicUser(u));
      }
      if (path === '/api/forgot-password' && method === 'POST') {
        throttle(req, 'recovery'); const input = await body(req);
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
        const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
        const origin = req.headers.origin || `${proto}://${host}`;
        const rec = createRecovery(db, { ...recovery, baseUrl: process.env.APP_BASE_URL || origin });
        return send(res, 200, await rec.request(input.email));
      }
      if (path === '/api/reset-password' && method === 'POST') {
        throttle(req, 'reset'); return send(res, 200, passwordRecovery.reset(await body(req)));
      }
      const user = authenticate(req);
      if (path === '/api/me' && method === 'GET') return send(res, 200, { user: publicUser(user), roles: ROLES });
      if (path === '/api/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(cookie(req)));
        res.setHeader('Set-Cookie', 'dsa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        audit(db, user, 'session.logout', user.id);
        return send(res, 200, { ok: true });
      }
      if (path === '/api/password' && method === 'POST') {
        const clearAttempts = throttle(req, 'password:' + user.id); const input = await body(req); requireThat(verifyPassword(input.currentPassword, user.password), 400, 'Current password is incorrect.');
        requireThat(!verifyPassword(input.newPassword, user.password), 400, 'Choose a new password different from the password you were given.');
        const next = hashPassword(input.newPassword);
        transaction(db, () => {
          db.prepare('UPDATE users SET password=?,must_change_password=0 WHERE id=?').run(next, user.id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          db.prepare('DELETE FROM password_resets WHERE user_id=?').run(user.id);
          audit(db, user, 'user.password', user.id);
        });
        clearAttempts();
        const freshUser = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        session(req, res, freshUser);
        return send(res, 200, { ok: true });
      }
      requireThat(!user.must_change_password, 403, 'Change your temporary password before accessing your dashboard.');
      if (path === '/api/directory' && method === 'GET') return send(res, 200, db.prepare('SELECT id,name,appointment FROM users WHERE role=? AND active=1 AND directorate=? AND id!=? ORDER BY name').all('staff', user.directorate, user.id));
      if (path === '/api/directorates' && method === 'GET') return send(res, 200, db.prepare('SELECT name FROM directorates ORDER BY name').all().map(r => r.name));
      if (path === '/api/directorates' && method === 'POST') {
        requireThat(user.role === 'admin', 403, 'Administrator access is required.'); const input = await body(req), name = clean(input.name, 100); requireThat(name, 400, 'Enter a directorate name.');
        db.prepare('INSERT OR IGNORE INTO directorates(name) VALUES(?)').run(name); audit(db, user, 'directorate.create', name); return send(res, 201, { name });
      }
      if (path === '/api/users' || /^\/api\/users\/[^/]+$/.test(path)) {
        requireThat(user.role === 'admin', 403, 'Administrator access is required.');
        if (method === 'GET' && path === '/api/users') return send(res, 200, db.prepare('SELECT * FROM users ORDER BY name').all().map(publicUser));
        requireThat(method === 'POST' || method === 'PUT', 405, 'Method not allowed.');
        const input = await body(req), id = path.split('/')[3];
        requireThat((method === 'POST' && !id) || (method === 'PUT' && id), 405, 'Method not allowed.');
        const updated = transaction(db, () => {
          const old = id ? db.prepare('SELECT * FROM users WHERE id=?').get(id) : null; requireThat(!id || old, 404, 'User not found.');
          const name = clean(input.name), username = clean(input.username).toLowerCase(), role = clean(input.role), directorate = clean(input.directorate), appointment = clean(input.appointment), rank = clean(input.rank), active = input.active === false ? 0 : 1;
          requireThat(name && /^[a-z0-9._-]{3,40}$/.test(username) && Object.hasOwn(ROLES, role) && appointment, 400, 'Complete name, username, role and appointment.');
          requireThat(db.prepare('SELECT name FROM directorates WHERE name=?').get(directorate), 400, 'Choose an existing directorate.');
          const duplicate = db.prepare('SELECT id FROM users WHERE username=?').get(username); requireThat(!duplicate || duplicate.id === id, 409, 'Username is already taken.');
          if (old && (old.role !== role || old.directorate !== directorate || old.active !== active)) {
            requireThat(old.id !== user.id, 400, 'You cannot change your own role, directorate or active status.');
            const pending = db.prepare("SELECT data FROM applications WHERE stage NOT IN ('approved','rejected')").all().map(r => JSON.parse(r.data)).filter(a => !a.archived);
            requireThat(!pending.some(a => a.ownerId === id || a.fields.relieverId === id || (old.role !== 'staff' && old.role !== 'admin' && (old.role === 'doa' || old.directorate === a.directorate))), 409, 'Resolve or archive pending applications before changing this account’s role, directorate or active status.');
          }
          const password = input.password ? hashPassword(input.password) : old?.password; requireThat(password, 400, 'A password is required for a new account.');
          const email = emailAddress(input.email, true);
          const emailOwner = email ? db.prepare('SELECT id FROM users WHERE lower(email)=?').get(email) : null;
          requireThat(!emailOwner || emailOwner.id === id, 409, 'This email address is already registered to another account.');
          const mustChange = !old || input.password ? 1 : old.must_change_password;
          const next = { id: id || randomUUID(), username, name, role, directorate, appointment, rank, active, email, must_change_password: mustChange };
          db.prepare('INSERT INTO users(id,username,password,name,role,directorate,appointment,rank,active) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,password=excluded.password,name=excluded.name,role=excluded.role,directorate=excluded.directorate,appointment=excluded.appointment,rank=excluded.rank,active=excluded.active').run(next.id, username, password, name, role, directorate, appointment, rank, active);
          if (id) {
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
            db.prepare('DELETE FROM password_resets WHERE user_id=?').run(id);
          }
          db.prepare('UPDATE users SET email=?,must_change_password=? WHERE id=?').run(email, mustChange, next.id);
          audit(db, user, old ? 'user.update' : 'user.create', next.id, `${name} — ${ROLES[role]}`);
          return next;
        });
        if (id === user.id) {
          const freshAdmin = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
          session(req, res, freshAdmin);
        }
        return send(res, method === 'POST' ? 201 : 200, publicUser(updated));
      }
      if (path === '/api/audit' && method === 'GET') { requireThat(user.role === 'admin', 403, 'Administrator access is required.'); return send(res, 200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 500').all()); }
      if (path === '/api/applications' && method === 'GET') {
        const list = db.prepare('SELECT data FROM applications ORDER BY rowid DESC').all().map(r => JSON.parse(r.data)).filter(a => canView(user, a)).map(a => present(user, a)); return send(res, 200, list);
      }
      if (path === '/api/applications' && method === 'POST') return send(res, 201, saveApplication(db, user, await body(req)));
      const match = path.match(/^\/api\/applications\/([^/]+)(?:\/(actions|slip|packet|archive|return|attachments)(?:\/([^/]+))?)?$/);
      if (match) {
        const [, id, action, attachmentId] = match, a = getApplication(db, id); requireThat(canView(user, a), 403, 'You do not have access to this application.');
        if (method === 'GET' && !action) return send(res, 200, present(user, a));
        if (method === 'PUT' && !action) return send(res, 200, saveApplication(db, user, await body(req), id));
        if (method === 'POST' && action === 'actions') return send(res, 200, decide(db, user, id, await body(req)));
        if (method === 'POST' && ['archive', 'return'].includes(action)) return send(res, 200, adminApplication(db, user, id, await body(req), action));
        if (method === 'GET' && ['slip', 'packet'].includes(action)) {
          if (action === 'slip') requireThat(a.stage === 'approved' && !a.archived, 409, 'The final slip is available only after DOA approval.');
          const pdf = await generatePDF(a, action);
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${a.reference}-${action}.pdf"` }); res.end(pdf); return;
        }
        if (method === 'GET' && action === 'attachments' && attachmentId) {
          const file = db.prepare('SELECT * FROM attachments WHERE id=? AND application_id=?').get(attachmentId, id); requireThat(file, 404, 'Attachment not found.');
          res.writeHead(200, { 'Content-Type': file.mime, 'Content-Disposition': `attachment; filename="${file.name}"` }); res.end(Buffer.from(file.content)); return;
        }
      }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' }); else res.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  return { server, close: () => db.close() };
}
