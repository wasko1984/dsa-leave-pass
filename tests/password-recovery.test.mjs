import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

test('first login is restricted and email reset links expire, are single-use, and revoke sessions', async t => {
  const sent = [];
  let now = Date.now();
  const app = createApp({ dbPath: ':memory:', recovery: { baseUrl: 'https://leave.office.example', send: async message => sent.push(message), now: () => now } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(r => app.server.close(r)); app.close(); });
  function client() { let cookie = ''; return async (path, method = 'GET', data) => {
    const r = await fetch(base + '/api' + path, { method, headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, data: await r.json() };
  }; }
  const admin = client(), staff = client(), anon = client();
  await admin('/setup', 'POST', { username: 'admin', name: 'Admin', password: 'Administrator-2026!', email: 'admin@example.com' });
  const created = await admin('/users', 'POST', { username: 'staff', name: 'Staff', role: 'staff', directorate: 'Administration', appointment: 'Assistant', email: 'staff@example.com', password: 'Temporary-office-2026!' });
  assert.equal(created.status, 201);
  let r = await staff('/login', 'POST', { username: 'staff', password: 'Temporary-office-2026!' });
  assert.equal(r.data.must_change_password, 1);
  assert.equal((await staff('/applications')).status, 403);
  assert.equal((await staff('/directory')).status, 403);
  assert.equal((await staff('/password', 'POST', { currentPassword: 'Temporary-office-2026!', newPassword: 'Temporary-office-2026!' })).status, 400);
  assert.equal((await staff('/password', 'POST', { currentPassword: 'Temporary-office-2026!', newPassword: 'Personal-office-2026!' })).status, 200);
  assert.equal((await staff('/applications')).status, 200);
  const known = await anon('/forgot-password', 'POST', { email: 'staff@example.com' });
  const unknown = await anon('/forgot-password', 'POST', { email: 'absent@example.com' });
  assert.equal(known.status, 200); assert.deepEqual(known, unknown); assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'staff@example.com');
  let token = new URLSearchParams(new URL(sent[0].resetUrl).hash.split('?')[1]).get('token');
  assert.equal((await anon('/reset-password', 'POST', { token, newPassword: 'Recovered-office-2026!' })).status, 200);
  assert.equal((await anon('/reset-password', 'POST', { token, newPassword: 'Another-office-2026!' })).status, 400);
  assert.equal((await staff('/me')).status, 401);
  assert.equal((await staff('/login', 'POST', { username: 'staff', password: 'Recovered-office-2026!' })).status, 200);
  now += 61000;
  await anon('/forgot-password', 'POST', { email: 'staff@example.com' });
  token = new URLSearchParams(new URL(sent.at(-1).resetUrl).hash.split('?')[1]).get('token');
  now += 31 * 60000;
  assert.equal((await anon('/reset-password', 'POST', { token, newPassword: 'Expired-office-2026!' })).status, 400);
  const changed = await admin('/users/' + created.data.id, 'PUT', { ...created.data, password: 'New-temporary-2026!' });
  assert.equal(changed.status, 200);
  r = await staff('/login', 'POST', { username: 'staff', password: 'New-temporary-2026!' });
  assert.equal(r.data.must_change_password, 1);
  assert.equal((await staff('/applications')).status, 403);
});

test('email recovery reports missing configuration honestly', async t => {
  const app = createApp({ dbPath: ':memory:' });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(r => app.server.close(r)); app.close(); });
  const result = await fetch(base + '/api/forgot-password', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'staff@example.com' }) });
  assert.equal(result.status, 503);
  assert.match((await result.json()).error, /not configured/);
});
