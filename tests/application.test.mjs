import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('office workflow enforces ownership, serial signatures, revisions and final PDF access', async t => {
  const mod = await import('../server/app.mjs').catch(() => ({}));
  assert.equal(typeof mod.createApp, 'function', 'the application HTTP service must exist');
  const folder = mkdtempSync(join(tmpdir(), 'dsa-test-'));
  const app = mod.createApp({ dbPath: join(folder, 'test.sqlite') });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise(r => app.server.close(r)); app.close(); rmSync(folder, { recursive: true, force: true }); });
  function client() {
    let cookie = '';
    return async (path, method = 'GET', body) => {
      const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      const bytes = Buffer.from(await res.arrayBuffer());
      let data; try { data = JSON.parse(bytes.toString()); } catch { data = bytes; }
      return { status: res.status, data, headers: res.headers };
    };
  }
  const admin = client(), staff = client(), reliever = client(), stranger = client(), head = client(), ao = client(), dd = client(), director = client(), doa = client();
  assert.equal((await staff('/me')).status, 401);
  assert.equal((await admin('/setup', 'POST', { name: 'Office Admin', username: 'admin', password: 'Office-test-123!' })).status, 201);
  assert.equal((await stranger('/setup', 'POST', { name: 'Intruder', username: 'intruder', password: 'Office-test-123!' })).status, 409);
  const users = {};
  for (const [username, role, c, directorate] of [
    ['staff', 'staff', staff, 'Administration'], ['reliever', 'staff', reliever, 'Administration'], ['stranger', 'staff', stranger, 'Engineering'],
    ['head', 'head', head, 'Administration'], ['ao', 'ao', ao, 'Administration'], ['dd', 'dd', dd, 'Administration'], ['director', 'director', director, 'Administration'], ['doa', 'doa', doa, 'Administration']
  ]) {
    const created = await admin('/users', 'POST', { username: `${username}.office`, email: `${username}@example.com`, name: `${username} Officer`, role, directorate, appointment: 'Office appointment', rank: 'Officer', password: 'Office-test-123!' });
    assert.equal(created.status, 201, JSON.stringify(created.data)); users[username] = created.data;
    assert.equal((await c('/login', 'POST', { username: `${username}.office`, password: 'Office-test-123!' })).status, 200);
    assert.equal((await c('/password', 'POST', { currentPassword: 'Office-test-123!', newPassword: 'Personal-test-456!' })).status, 200);
  }
  assert.equal((await staff('/users')).status, 403);
  const signature = [[[8, 25], [20, 5], [30, 28], [45, 15], [65, 25]]];
  const fields = { fileNumber: 'DSA/CIV/001', placeOfDeployment: 'Headquarters', description: 'Annual leave', previousDate: '', requestThrough: 'Civilian Head', days: 5, effectiveDate: '2026-10-05', reasons: 'Family commitments', travelPlace: 'Abuja', contactAddress: '12 Office Road, Abuja', station: 'Abuja', department: 'Administration', relieverId: users.reliever.id };
  let response = await staff('/applications', 'POST', { fields, signature, submit: true });
  assert.equal(response.status, 201, JSON.stringify(response.data)); let a = response.data;
  assert.equal(a.stage, 'reliever');
  assert.equal((await stranger(`/applications/${a.id}`)).status, 403);
  assert.equal((await staff(`/applications/${a.id}/slip`)).status, 409);
  assert.equal((await ao(`/applications/${a.id}/actions`, 'POST', { action: 'approve', version: a.version, comment: 'Skip', signature })).status, 403);
  for (const [c, nextStage] of [[reliever, 'head'], [head, 'ao'], [ao, 'dd'], [dd, 'director'], [director, 'doa'], [doa, 'approved']]) {
    const missing = await c(`/applications/${a.id}/actions`, 'POST', { action: 'approve', version: a.version, comment: 'Recommended' });
    assert.equal(missing.status, 400);
    const oldVersion = a.version;
    response = await c(`/applications/${a.id}/actions`, 'POST', { action: 'approve', version: a.version, comment: 'Recommended and approved', signature });
    assert.equal(response.status, 200, JSON.stringify(response.data)); a = response.data; assert.equal(a.stage, nextStage);
    assert.equal((await c(`/applications/${a.id}/actions`, 'POST', { action: 'approve', version: oldVersion, comment: 'Duplicate', signature })).status, 409);
  }
  const slip = await staff(`/applications/${a.id}/slip`);
  assert.equal(slip.status, 200); assert.equal(slip.data.subarray(0, 4).toString(), '%PDF');
  assert.match(slip.data.toString('latin1'), /\/MediaBox \[0 0 419\.53 595\.28\]/, 'Approval slips must be A5 portrait');
  assert.ok(slip.data.includes(await import('node:fs/promises').then(fs => fs.readFile(new URL('../all-forms/STAMP.jpg', import.meta.url)))), 'The supplied stamp must be embedded in the approval slip');
  await t.test('standard approval slip fits one page and the form packet fits six forms', async () => {
    assert.equal((slip.data.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1, 'The slip must not create a separate footer page');
    const packet = await staff(`/applications/${a.id}/packet`);
    assert.equal((packet.data.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 6);
  });
  assert.equal((await stranger(`/applications/${a.id}/slip`)).status, 403);
  assert.equal((await staff(`/applications/${a.id}/packet`)).status, 200);
  let correction = (await staff('/applications', 'POST', { fields, signature, submit: true })).data;
  correction = (await reliever(`/applications/${correction.id}/actions`, 'POST', { version: correction.version, action: 'approve', signature, comment: 'Confirmed' })).data;
  correction = (await head(`/applications/${correction.id}/actions`, 'POST', { version: correction.version, action: 'return', signature, comment: 'Correct the travel destination' })).data;
  assert.equal(correction.stage, 'returned');
  correction = (await staff(`/applications/${correction.id}`, 'PUT', { version: correction.version, fields: { ...fields, travelPlace: 'Lagos' }, signature, submit: true })).data;
  assert.equal(correction.stage, 'reliever'); assert.equal(correction.revision, 2); assert.equal(correction.approvals.length, 1); assert.ok(correction.history.length >= 4);
  assert.equal((await staff(`/applications/${a.id}`, 'PUT', { version: a.version, fields, signature, submit: true })).status, 409);
  assert.equal((await staff('/applications', 'POST', { fields: { ...fields, relieverId: users.staff.id }, signature, submit: true })).status, 400);
  assert.equal((await staff('/applications', 'POST', { fields: { ...fields, days: -2 }, signature, submit: true })).status, 400);
  const archived = await admin(`/applications/${a.id}/archive`, 'POST', { version: a.version, reason: 'Duplicate record' });
  assert.equal(archived.status, 200); assert.equal((await staff(`/applications/${a.id}/slip`)).status, 409);
  assert.equal((await admin('/audit')).status, 200);
  assert.equal((await staff('/logout', 'POST', {})).status, 200); assert.equal((await staff('/me')).status, 401);
  await t.test('rejects unknown roles even when they match Object prototype properties', async () => {
    const result = await admin('/users', 'POST', { username: 'bad.role', name: 'Invalid role', role: 'constructor', directorate: 'Administration', appointment: 'Not a role', password: 'Office-test-123!' });
    assert.equal(result.status, 400);
  });
  await t.test('successful office logins do not exhaust the failed-login allowance', async () => {
    for (let i = 0; i < 22; i++) assert.equal((await staff('/login', 'POST', { username: 'staff.office', password: 'Personal-test-456!' })).status, 200);
  });
  await t.test('attachment access follows application access and rejects executable uploads', async () => {
    const uploaded = await staff('/applications', 'POST', { fields, signature, submit: true, attachment: { name: 'support.pdf', base64: Buffer.from('%PDF-1.4\nQA attachment').toString('base64') } });
    assert.equal(uploaded.status, 201);
    const path = `/applications/${uploaded.data.id}/attachments/${uploaded.data.attachment.id}`;
    assert.equal((await staff(path)).status, 200);
    assert.equal((await stranger(path)).status, 403);
    const invalid = await staff('/applications', 'POST', { fields, signature, submit: true, attachment: { name: 'payload.html', base64: Buffer.from('<script>alert(1)</script>').toString('base64') } });
    assert.equal(invalid.status, 400);
  });
  await t.test('a reviewer in another directorate cannot see or sign the application', async () => {
    const foreign = client();
    assert.equal((await admin('/users', 'POST', { username: 'foreign.head', email: 'foreign@example.com', name: 'Other Head', role: 'head', directorate: 'Engineering', appointment: 'Head', password: 'Office-test-123!' })).status, 201);
    await foreign('/login', 'POST', { username: 'foreign.head', password: 'Office-test-123!' });
    await foreign('/password','POST',{currentPassword:'Office-test-123!',newPassword:'Foreign-personal-2026!'});
    assert.equal((await foreign(`/applications/${correction.id}`)).status, 403);
    assert.equal((await foreign('/applications')).data.length, 0);
  });
  await t.test('admin cannot strand a reliever with pending work', async () => {
    assert.equal((await admin('/users/' + users.reliever.id, 'PUT', { ...users.reliever, active: false })).status, 409);
  });
  await t.test('password changes revoke previous sessions', async () => {
    const duplicate = client(); await duplicate('/login', 'POST', { username: 'stranger.office', password: 'Personal-test-456!' });
    assert.equal((await stranger('/password', 'POST', { currentPassword: 'Personal-test-456!', newPassword: 'Changed-test-2026!' })).status, 200);
    assert.equal((await duplicate('/me')).status, 401);
    assert.equal((await stranger('/me')).status, 200);
  });
  await t.test('requests from a different origin cannot mutate accounts', async () => {
    const result = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Office-test-123!' }) });
    assert.equal(result.status, 403);
  });
  await t.test('administrator can edit their own profile without losing the current session', async () => {
    const me = (await admin('/me')).data.user;
    assert.equal((await admin('/users/' + me.id, 'PUT', { ...me, name: 'Updated Office Administrator' })).status, 200);
    assert.equal((await admin('/me')).status, 200);
  });
});
