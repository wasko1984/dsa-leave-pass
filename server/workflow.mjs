import { randomUUID } from 'node:crypto';
import { transaction, audit } from './db.mjs';
import { clean, requireThat, validateSignature } from './security.mjs';

export const ROLES = { staff: 'Civilian Staff', head: 'Civilian Head', ao: 'Administrative Officer', dd: 'Deputy Director', director: 'Director', doa: 'Director of Administration', admin: 'Administrator' };
export const STAGES = ['reliever', 'head', 'ao', 'dd', 'director', 'doa', 'approved'];
export function getApplication(db, id) {
  const row = db.prepare('SELECT data FROM applications WHERE id=?').get(id);
  requireThat(row, 404, 'Application not found.'); return JSON.parse(row.data);
}
export function canView(user, a) {
  return user.role === 'admin' || a.ownerId === user.id || a.fields.relieverId === user.id ||
    (a.stage !== 'draft' && (user.role === 'doa' || (user.role !== 'staff' && user.directorate === a.directorate)));
}
export function canAct(user, a) {
  if (a.archived || a.ownerId === user.id) return false;
  if (a.stage === 'reliever') return user.id === a.fields.relieverId && user.role === 'staff';
  return user.role === a.stage && (user.role === 'doa' || user.directorate === a.directorate);
}
export function present(user, a) { return { ...a, canAct: canAct(user, a), canEdit: a.ownerId === user.id && !a.archived && ['draft', 'returned'].includes(a.stage) }; }
function persist(db, a) {
  db.prepare('INSERT INTO applications(id,owner_id,directorate,stage,version,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET stage=excluded.stage,version=excluded.version,data=excluded.data')
    .run(a.id, a.ownerId, a.directorate, a.stage, a.version, JSON.stringify(a));
}
function event(a, user, action, comment) {
  a.history.push({ at: new Date().toISOString(), actor: user.name, actorId: user.id, role: user.role, action, comment, revision: a.revision });
}
function sign(a, user, stage, signature, comment = '') {
  a.approvals.push({ stage, userId: user.id, name: user.name, rank: user.rank, appointment: user.appointment, signature: validateSignature(signature), comment, at: new Date().toISOString(), revision: a.revision });
}
function dateValid(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function fieldsFor(db, user, input, submit) {
  requireThat(input && typeof input === 'object', 400, 'Application details are required.');
  const fields = {};
  for (const key of ['fileNumber', 'placeOfDeployment', 'description', 'previousDate', 'requestThrough', 'effectiveDate', 'reasons', 'travelPlace', 'contactAddress', 'station', 'department', 'relieverId']) fields[key] = clean(input[key], key === 'reasons' || key === 'contactAddress' ? 2000 : 200);
  fields.days = Number(input.days) || 0;
  if (submit) {
    for (const key of ['fileNumber', 'placeOfDeployment', 'description', 'requestThrough', 'effectiveDate', 'reasons', 'travelPlace', 'contactAddress', 'station', 'department', 'relieverId']) requireThat(fields[key], 400, `Please complete ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
    requireThat(Number.isInteger(fields.days) && fields.days >= 1 && fields.days <= 365, 400, 'Days required must be between 1 and 365.');
    requireThat(dateValid(fields.effectiveDate), 400, 'Enter a valid effective date.');
    requireThat(!fields.previousDate || dateValid(fields.previousDate), 400, 'Enter a valid previous leave/pass date.');
    requireThat(!fields.previousDate || fields.previousDate <= fields.effectiveDate, 400, 'Previous leave/pass date cannot be after the effective date.');
    const reliever = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(fields.relieverId);
    requireThat(reliever && reliever.role === 'staff' && reliever.id !== user.id && reliever.directorate === user.directorate, 400, 'Select another active civilian staff member in your directorate as reliever.');
    fields.relieverName = reliever.name; fields.relieverAppointment = reliever.appointment;
  }
  return fields;
}
function attachment(db, a, input) {
  if (input === undefined) return;
  if (input === null) { a.attachment = null; return; }
  requireThat(input && typeof input.base64 === 'string' && input.base64.length <= 4200000 && /^[A-Za-z0-9+/]*={0,2}$/.test(input.base64), 400, 'Attachment must be a PDF, PNG or JPEG up to 3 MB.');
  const bytes = Buffer.from(input.base64, 'base64');
  requireThat(bytes.length > 0 && bytes.length <= 3 * 1024 * 1024, 400, 'Attachment must be up to 3 MB.');
  const mime = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf' : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : '';
  requireThat(mime, 400, 'Only PDF, PNG and JPEG attachments are supported.');
  const id = randomUUID(), name = clean(input.name, 120).replace(/[^a-zA-Z0-9 ._()-]/g, '_') || 'attachment';
  db.prepare('INSERT INTO attachments(id,application_id,name,mime,content) VALUES(?,?,?,?,?)').run(id, a.id, name, mime, bytes);
  a.attachment = { id, name, mime, size: bytes.length };
}
export function saveApplication(db, user, input, id) {
  requireThat(user.role === 'staff', 403, 'Only civilian staff may submit applications.');
  return transaction(db, () => {
    let a;
    if (id) {
      a = getApplication(db, id); requireThat(a.ownerId === user.id, 403, 'This is not your application.');
      requireThat(a.version === input.version, 409, 'This application has changed. Refresh and try again.');
      requireThat(!a.archived && ['draft', 'returned'].includes(a.stage), 409, 'Only a draft or returned application can be edited.');
      if (a.stage === 'returned') {
        a.revisions.push({ revision: a.revision, fields: a.fields, approvals: a.approvals, attachment: a.attachment, closedAt: new Date().toISOString() });
        a.revision++;
      }
      a.version++; a.approvals = [];
    } else {
      a = { id: randomUUID(), ownerId: user.id, applicantName: user.name, directorate: user.directorate, createdAt: new Date().toISOString(), revision: 1, version: 1, approvals: [], history: [], revisions: [], attachment: null, archived: false };
      a.reference = `DSA-${new Date().getFullYear()}-${a.id.slice(0, 8).toUpperCase()}`;
    }
    a.fields = fieldsFor(db, user, input.fields, input.submit === true);
    a.stage = input.submit === true ? 'reliever' : 'draft';
    a.updatedAt = new Date().toISOString();
    if (input.submit === true) sign(a, user, 'applicant', input.signature);
    event(a, user, input.submit === true ? 'Submitted for reliever signature' : 'Draft saved', '');
    persist(db, a); attachment(db, a, input.attachment); persist(db, a);
    audit(db, user, input.submit === true ? 'application.submit' : 'application.draft', a.id, `Revision ${a.revision}`);
    return present(user, a);
  });
}
export function decide(db, user, id, input) {
  return transaction(db, () => {
    const a = getApplication(db, id);
    requireThat(canView(user, a), 403, 'You do not have access to this application.');
    requireThat(a.version === input.version, 409, 'This application has changed. Refresh and try again.');
    requireThat(canAct(user, a), 403, 'This application is not awaiting your action.');
    requireThat(['approve', 'return', 'reject'].includes(input.action), 400, 'Choose a valid action.');
    const comment = clean(input.comment, 3000); requireThat(comment, 400, 'Please enter your comments.');
    sign(a, user, a.stage, input.signature, comment);
    const prior = a.stage;
    a.stage = input.action === 'approve' ? STAGES[STAGES.indexOf(prior) + 1] : input.action === 'return' ? 'returned' : 'rejected';
    a.version++; a.updatedAt = new Date().toISOString();
    if (a.stage === 'approved') a.approvedAt = a.updatedAt;
    event(a, user, input.action === 'approve' ? `${prior === 'reliever' ? 'Reliever confirmed' : ROLES[prior] + ' signed'}${a.stage === 'approved' ? ' — final approval' : ''}` : input.action === 'return' ? 'Returned for correction' : 'Application rejected', comment);
    persist(db, a); audit(db, user, `application.${input.action}`, id, `${prior}: ${comment}`);
    return present(user, a);
  });
}
export function adminApplication(db, user, id, input, action) {
  requireThat(user.role === 'admin', 403, 'Administrator access is required.');
  return transaction(db, () => {
    const a = getApplication(db, id);
    requireThat(a.version === input.version, 409, 'This application has changed. Refresh and try again.');
    const reason = clean(input.reason, 2000); requireThat(reason.length >= 5, 400, 'Give a reason for this correction (at least 5 characters).');
    if (action === 'archive') { requireThat(!a.archived, 409, 'Application already archived.'); a.archived = true; }
    else { requireThat(!a.archived, 409, 'Archived applications cannot be returned.'); a.stage = 'returned'; delete a.approvedAt; }
    a.version++; a.updatedAt = new Date().toISOString(); event(a, user, action === 'archive' ? 'Archived by administrator' : 'Administrator requested correction', reason);
    persist(db, a); audit(db, user, `application.${action}`, id, reason); return present(user, a);
  });
}
