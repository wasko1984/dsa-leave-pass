# DSA-LEAVE-PASS — approved design

Approved by the user on 15 September 2026 following review of all six supplied templates.

## Outcome
Civilian staff apply for leave/pass, obtain their reliever's signature and progress through Civilian Head, AO, Deputy Director, Director and DOA. Only DOA approval permits a final PDF slip download.

## Roles and records
Seven role dashboards: staff, civilian head, AO, deputy director, director, DOA and admin. A reliever acts through their own staff account. Directorate officers can only review their own directorate; DOA has central scope. Admin manages users and directorates, returns mistakes for correction and archives applications with a reason. Admin does not impersonate signatories or silently alter signed records. Every mutation records actor and timestamp. Archived approved applications cannot issue slips.

## Forms
Preserve every field and section in all-forms/CIVILIAN FORM2.txt, CIVILIAN HEAD2.txt, AO2.txt, DEPUTY DIRECTOR2.txt and DIRECTOR2.txt. Add a DOA comments, rank, name, appointment, signature and date section. Reproduce the wording and field arrangement in DOA approval.jfif for the final slip, using logo.JPG. Do not reuse the photographed stamp as proof of approval. Signatures are hand-drawn with mouse/touch, saved against the authenticated account and application revision, and included in PDF output. Original templates remain unmodified.

## Workflow
Draft -> Reliever -> Civilian Head -> AO -> Deputy Director -> Director -> DOA -> Approved. Reviewers may return for correction or reject, with comments. A correction starts a new revision, clears active approvals and requires the applicant and all subsequent signatories to sign again. Prior revisions remain in the history. Staff see status and a timeline. DOA sets/validates releasing-authority details before approval.

## Implementation choices
Build in the provided project folder: Node.js 22.13+, SQLite, an HTTP API and responsive HTML/CSS/JavaScript interface. Use PDFKit for downloadable slip and signed form packet. Serve both UI and API from the same origin. Office-controlled deployment is documented; the initial runnable app is local. No dependency on ChatGPT accounts for staff login.

## Security and administration
Hash passwords with salted scrypt. Use random expiring HttpOnly SameSite sessions, same-origin write checks, request limits, login throttling, server-side role checks and optimistic revision checks. First-run setup creates the administrator; do not ship default passwords. Store attachments as authenticated database blobs with file type and size checks. Deactivation revokes sessions. Preserve audit records when removing a mistake from active lists. Restrict role and directorate changes when pending work would be stranded.

## Validation
Integration tests exercise the real HTTP server and temporary SQLite databases: setup/login/logout, all serial approvals, ownership and directorate isolation, mandatory signatures, missing fields, premature PDF access, correction/revision invalidation, attachments, duplicate decisions and admin controls. Browser checks cover login/setup, staff form, queues, signature pad, final PDF action and narrow viewport. Document any deployment requirements separately from tested local behavior.
