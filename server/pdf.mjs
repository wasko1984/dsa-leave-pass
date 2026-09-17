import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { ROLES } from './workflow.mjs';

const logo = fileURLToPath(new URL('../all-forms/logo.JPG', import.meta.url));
const stamp = fileURLToPath(new URL('../all-forms/STAMP.jpg', import.meta.url));
const date = value => value ? new Date(value).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export function endDate(a) { const d = new Date(a.fields.effectiveDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + a.fields.days - 1); return d.toISOString().slice(0, 10); }
function signature(doc, sign, x, y, width = 210, height = 65, underline = true) {
  doc.save().strokeColor('#173452').lineWidth(1.4);
  for (const stroke of sign?.signature || []) {
    stroke.forEach(([px, py], i) => { const xx = x + px / 100 * width, yy = y + py / 100 * height; if (!i) doc.moveTo(xx, yy); else doc.lineTo(xx, yy); }); doc.stroke();
  }
  doc.restore(); if (underline) doc.strokeColor('#8492a3').lineWidth(.5).moveTo(x, y + height + 4).lineTo(x + width, y + height + 4).stroke();
}
function approvalSlip(doc, a) {
  const f = a.fields, doa = a.approvals.find(s => s.stage === 'doa');
  const left = 25, right = doc.page.width - 25, width = right - left;
  doc.image(logo, (doc.page.width - 64) / 2, 18, { width: 64 });
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(16).text('LEAVE/PASS', left, 91, { width, align: 'center' });
  doc.fontSize(14).text('DEFENCE SPACE ADMINISTRATION', left, 114, { width, align: 'center' });
  function line(label, value, y, x = left, end = right, height = 25) {
    doc.font('Helvetica').fontSize(12).text(label, x, y, { lineBreak: false });
    const start = x + doc.widthOfString(label) + 5;
    doc.save().strokeColor('#666666').lineWidth(.6).dash(1, { space: 2 }).moveTo(start, y + height - 5).lineTo(end, y + height - 5).stroke().restore();
    const text = String(value || '—').replace(/\s+/g, ' ');
    doc.font('Helvetica');
    let size = 11;
    while (size > 5 && doc.fontSize(size).heightOfString(text, { width: end - start - 3 }) > height - 7) size -= .25;
    doc.fontSize(size).text(text, start, y, { width: end - start - 3, lineGap: 0 });
  }
  line('No.', f.fileNumber, 143);
  line('Station', f.station, 171);
  line('Name', a.applicantName, 199);
  line('Dept/Appointment', f.department, 227, left, right, 33);
  doc.font('Helvetica').fontSize(12).text('Has permission to absent from his/her quarter/duty', left, 267, { width });
  line('From', date(f.effectiveDate), 300, left, 203);
  line('To', date(endDate(a)), 300, 215);
  doc.fontSize(12).text('For the purpose of proceeding to:', left, 329);
  line('', f.travelPlace, 348, left, right, 30);
  line('Date', date(a.approvedAt), 382);
  doc.fontSize(12).text('Releasing Authority:', left, 415);
  doc.text('Signature', left, 457);
  // Embed the supplied stamp first, then the actual recorded signature and date.
  doc.image(stamp, 167, 411, { width: 140 });
  signature(doc, doa, 218, 443, 54, 14, false);
  doc.font('Helvetica').fontSize(6.5).text(date(doa?.at || a.approvedAt), 218, 461, { lineBreak: false });
  line('Name & Rank', [doa?.name, doa?.rank].filter(Boolean).join(' / '), 502);
  line('Appt.', 'Director of Administration', 529);
  doc.font('Helvetica').fontSize(10).text('If sick while on leave/pass report to the nearest medical Officer and show this pass.', left, 560, { width, lineGap: 2 });
}
function header(doc, a, title) {
  const compact = title !== 'LEAVE / PASS', shift = compact ? 41 : 0;
  const logoWidth = compact ? 65 : 90, logoX = (doc.page.width - logoWidth) / 2, logoY = compact ? 25 : 35;
  doc.image(logo, logoX, logoY, { width: logoWidth });
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#142b46').text('DEFENCE SPACE ADMINISTRATION', 40, 150 - shift, { align: 'center', width: 515 });
  doc.font('Helvetica-Bold').fillColor('#142b46').fontSize(12).text(title, 40, 175 - shift, { align: 'center', width: 515 });
  doc.font('Helvetica').fontSize(9).fillColor('#5a6879').text(`${a.reference}  |  Revision ${a.revision}`, 40, 198 - shift, { align: 'center', width: 515 });
  doc.strokeColor('#bc9851').lineWidth(1).moveTo(45, 218 - shift).lineTo(550, 218 - shift).stroke(); doc.y = 235 - shift;
}
function field(doc, label, value) {
  const y = doc.y; doc.font('Helvetica-Bold').fontSize(10).fillColor('#182b40').text(label, 48, y, { width: 178 });
  doc.font('Helvetica').text(String(value || '—'), 232, y, { width: 309 });
  doc.y = Math.max(y + 22, doc.y + 10);
}
function footer(doc, a) {
  doc.font('Helvetica').fontSize(8).fillColor('#637184').text(`${a.reference}  •  ${a.archived ? 'ARCHIVED — NOT VALID FOR RELEASE' : a.stage === 'approved' ? 'Approved by DOA' : 'APPLICATION RECORD — NOT AN APPROVAL SLIP'}`, 45, 770, { width: 505, align: 'center', lineBreak: false });
}
export function generatePDF(a, kind) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: kind === 'slip' ? 'A5' : 'A4', margin: kind === 'slip' ? 15 : 45, bufferPages: true, info: { Title: `${a.reference} ${kind === 'slip' ? 'Leave/Pass Approval Slip' : 'Application and Signatures'}`, Author: 'Defence Space Administration' } });
    const chunks = []; doc.on('data', b => chunks.push(b)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
    try {
      if (kind === 'slip') {
        approvalSlip(doc, a);
      } else {
        header(doc, a, 'CIVILIAN STAFF LEAVE/PASS APPLICATION FORM');
        const f = a.fields;
        for (const [label, value] of [['1. File Number', f.fileNumber], ['2. Name', a.applicantName], ['3. Place of Deployment', f.placeOfDeployment], ['4. Description of Leave/Pass', f.description], ['5. Date of Previous Leave/Pass', date(f.previousDate)], ['6. Request Made Through', f.requestThrough], ['7. Number of Days Required', f.days], ['8. Effective Date', date(f.effectiveDate)], ['9. Reason(s) for Application', f.reasons], ['10. Attachment to Application', a.attachment ? `Yes — ${a.attachment.name}` : 'No'], ['11. Place Intended to Travel', f.travelPlace], ['12. Contact Address', f.contactAddress]]) {
          if (doc.y > 670) { doc.addPage(); header(doc, a, 'CIVILIAN APPLICATION — CONTINUED'); }
          field(doc, label, value);
        }
        if (doc.y > 490) { doc.addPage(); header(doc, a, 'CIVILIAN APPLICATION — SIGNATURES'); }
        const applicant = a.approvals.find(s => s.stage === 'applicant'), reliever = a.approvals.find(s => s.stage === 'reliever');
        doc.font('Helvetica-Bold').fontSize(11).text('13. Signature of Applicant', 48, doc.y + 5); let y = doc.y + 6; signature(doc, applicant, 48, y); doc.y = y + 82; field(doc, 'Date of Application', date(applicant?.at));
        doc.font('Helvetica-Bold').text('14. Reliever Details', 48, doc.y); doc.moveDown(); field(doc, 'Name of Reliever', f.relieverName); field(doc, 'Appointment', f.relieverAppointment);
        if (doc.y > 660) { doc.addPage(); header(doc, a, 'CIVILIAN APPLICATION — RELIEVER SIGNATURE'); }
        y = doc.y; signature(doc, reliever, 48, y); doc.y = y + 82; field(doc, 'Date', date(reliever?.at));
        for (const stage of ['head', 'ao', 'dd', 'director', 'doa']) {
          doc.addPage(); header(doc, a, stage === 'head' ? 'CIVILIAN HEAD (DIRECTORATE)' : stage === 'dd' ? 'DEPUTY DIRECTOR (DIRECTORATE)' : stage === 'director' ? 'DIRECTOR (DIRECTORATE)' : ROLES[stage].toUpperCase());
          const s = a.approvals.find(p => p.stage === stage);
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#182b40').text(stage === 'director' ? "Director’s Approval:" : stage === 'dd' ? "Recommending DD’s Comment:" : `${ROLES[stage]}’s Comments:`, 48, doc.y);
          doc.moveDown(); doc.font('Helvetica').fontSize(11).text(s?.comment || 'Awaiting comment and signature.', { width: 495 }); doc.moveDown(2);
          if (doc.y > 530) { doc.addPage(); header(doc, a, `${ROLES[stage].toUpperCase()} — SIGNATURE`); }
          if (stage !== 'head') field(doc, 'Rank', s?.rank); field(doc, 'Name', s?.name); field(doc, 'Appointment', stage === 'doa' && s ? 'Director of Administration' : s?.appointment); field(doc, 'Date', date(s?.at));
          doc.font('Helvetica-Bold').text('Signature', 48, doc.y); signature(doc, s, 180, doc.y + 10, 270, 85);
        }
      }
      if (kind !== 'slip') { const range = doc.bufferedPageRange(); for (let i = range.start; i < range.start + range.count; i++) { doc.switchToPage(i); footer(doc, a); } }
      doc.end();
    } catch (e) { reject(e); doc.end(); }
  });
}
