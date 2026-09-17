// Isolated, synthetic data for manual browser QA. Never uses the office database.
import { createApp } from '../server/app.mjs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const folder = mkdtempSync(join(tmpdir(), 'dsa-browser-'));
const app = createApp({ dbPath: join(folder, 'ui.sqlite') });
await new Promise(resolve => app.server.listen(3001, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:3001', password = 'QA-only-office-2026!';
const clients = {}, people = {};
function client() { let cookie = ''; return async (path, method = 'GET', data) => {
  const res = await fetch(base + '/api' + path, { method, headers: { Origin:base, Cookie:cookie, 'Content-Type':'application/json' }, body:data === undefined ? undefined : JSON.stringify(data) });
  if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  const value = await res.json(); if (!res.ok) throw new Error(JSON.stringify(value)); return value;
}; }
clients.admin = client();
await clients.admin('/setup','POST',{ username:'qa.admin', name:'QA Administrator', password });
for (const [key,role,name,appointment] of [
  ['staff','staff','Amina Ibrahim','Administrative Assistant'], ['reliever','staff','Chidi Okafor','Administrative Assistant'],
  ['head','head','Grace Adeyemi','Civilian Head'], ['ao','ao','Daniel Musa','Administrative Officer'],
  ['dd','dd','David Bello','Deputy Director'], ['director','director','Miriam Eze','Director'], ['doa','doa','Samuel Umar','Director of Administration']
]) {
  people[key] = await clients.admin('/users','POST',{ username:'qa.'+key, email:key+'@example.com', name, role, directorate:'Administration', appointment, rank:role === 'staff' || role === 'head' ? '' : 'Officer', password });
  clients[key] = client(); await clients[key]('/login','POST',{ username:'qa.'+key,password });
  await clients[key]('/password','POST',{currentPassword:password,newPassword:'QA-personal-office-2026!'});
}
const signature = [[[10,60],[23,20],[31,70],[38,35],[43,60],[60,40],[78,56]]];
const fields = { fileNumber:'DSA/CIV/0142', placeOfDeployment:'DSA Headquarters', description:'Annual leave', previousDate:'2026-03-02', requestThrough:'Civilian Head', days:10, effectiveDate:'2026-10-05', reasons:'Annual leave to spend time with family.', travelPlace:'Abuja', contactAddress:'QA example address, Abuja', station:'Abuja', department:'Administration / Administrative Assistant', relieverId:people.reliever.id };
for (const [label,count,days] of [['Annual leave',6,10],['Personal pass',2,3],['Annual leave',0,14]]) {
  let a = await clients.staff('/applications','POST',{ fields:{...fields,description:label,days},signature,submit:true });
  for (const key of ['reliever','head','ao','dd','director','doa'].slice(0,count)) a = await clients[key](`/applications/${a.id}/actions`,'POST',{ version:a.version,action:'approve',comment:'Reviewed and recommended. Coverage confirmed.',signature });
}
console.log('Synthetic browser QA ready at ' + base + '. Test users: qa.staff, qa.reliever, qa.head, qa.ao, qa.dd, qa.director, qa.doa, qa.admin. Staff password: QA-personal-office-2026!; administrator password: ' + password);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => app.server.close(() => { app.close(); process.exit(0); }));
