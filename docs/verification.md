# Verification record — 15 September 2026

## Automated service checks

`npm test` exercises a real HTTP server and temporary SQLite database. The parent workflow scenario and nine focused subtests pass (10 tests total):

- Full applicant, reliever, Civilian Head, AO, Deputy Director, Director and DOA sequence.
- Mandatory signatures, premature PDF denial, unauthorized record access, duplicate decisions and revision invalidation.
- One-page standard slip and six-page standard form packet.
- Strict role validation.
- Successful logins do not consume the failed-login allowance.
- Attachment authorization and rejection of unsupported file content.
- Isolation between directorates.
- Account changes cannot strand pending reliever work.
- Password changes revoke other sessions.
- Cross-origin mutation denial.
- Administrator self-edit preserves the current session.

`npm run check` verifies JavaScript syntax for the server and browser entrypoints.

## Browser checks

Used an isolated browser QA service and fictional accounts, separate from the office database. Verified staff login, populated overview, civilian form fields, date calculation, submitted-request display, AO queue, comment entry, pointer-drawn signature and successful forwarding to Deputy Director. Verified Admin's people screen lists the seven roles. Inspected the mobile dashboard; after fixing the grid minimum-width issue, the document had no horizontal overflow. No browser console errors were reported in that check.

The main office instance was left on its login page. First-time administrator setup had already been completed by the time of final inspection; this task did not seed default accounts into the office database.

## PDF inspection

Generated synthetic documents and inspected them with PyMuPDF. Checked one-page standard slip, six-page standard packet, and a long-comment packet with continuation pages. Applicant and releasing-authority names are present, and signature drawing bounds remain above the footer. Visually inspected the standard slip with the supplied logo and recorded DOA signature.

## Corrections made during review

- Tightened accepted roles to own keys of the role map.
- Reset failed-login counters after successful authentication.
- Reissued the current admin session after self-edit.
- Fixed the applicant name label and officer attention count.
- Kept tables within their panel on narrow screens.
- Prevented PDF footers from creating extra pages and moved long-comment signatures to continuation pages.

## Scope of validation

Local operation is verified. Office network deployment, TLS configuration, backup recovery on another machine and operational approval policies have not been tested here. The folder was not a Git repository, so no commit, merge, push or deployment was performed.
