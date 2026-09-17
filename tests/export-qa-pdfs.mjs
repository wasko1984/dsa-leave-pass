import { writeFileSync, mkdirSync } from 'node:fs';
import { generatePDF } from '../server/pdf.mjs';
const base = 'http://127.0.0.1:3001';
const login = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa.staff', password: 'QA-personal-office-2026!' }) });
if (!login.ok) throw new Error('Start tests/ui-fixture.mjs before exporting QA PDFs.');
const cookie = login.headers.get('set-cookie').split(';')[0];
const list = await (await fetch(base + '/api/applications', { headers: { Cookie: cookie } })).json();
const approved = list.find(a => a.stage === 'approved');
mkdirSync('test-results', { recursive: true });
for (const kind of ['slip', 'packet']) {
  const response = await fetch(`${base}/api/applications/${approved.id}/${kind}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error('PDF export failed');
  writeFileSync(`test-results/qa-${kind}.pdf`, Buffer.from(await response.arrayBuffer()));
}
console.log('Synthetic approval slip and form packet saved to test-results.');
const long = structuredClone(approved);
long.fields.reasons = 'Extended reason for leave with all details preserved. '.repeat(38).slice(0, 2000);
long.fields.contactAddress = 'Long contact address with supporting directions. '.repeat(40).slice(0, 2000);
for (const s of long.approvals) s.comment = 'Detailed review comment and recommendation. '.repeat(68).slice(0, 3000);
writeFileSync('test-results/qa-long-packet.pdf', await generatePDF(long, 'packet'));
