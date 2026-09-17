# DSA-LEAVE-PASS

An office leave/pass application for the Defence Space Administration, based on the supplied `all-forms` templates and logo.

## Start the app

Requires **Node.js 22.13 or newer**. Dependencies have been installed in this workspace.

1. Double-click **start.cmd**, or run `npm start` from this directory.
2. Open **http://127.0.0.1:3000**.
3. On first use, create your administrator account. There is no default office username or password.
4. Open **People & access**, add your directorates, and create staff and signatory accounts with a registered email. Share each temporary password directly with its owner. The person must choose a different personal password on first login before accessing their dashboard. Admin-issued replacement passwords also require a change.

On a fresh copy of the project, run `npm ci` before starting. Stop the app with Ctrl+C in its terminal. A second instance cannot use the same port.

## Seven dashboards

| Role | Actions |
| --- | --- |
| Civilian Staff | Draft, sign and submit applications; act as another staff member's reliever; correct returned requests; track status; download approved slips. |
| Civilian Head | Comment and sign directorate requests after the reliever. |
| Administrative Officer | Review Civilian Head endorsements and forward to Deputy Director. |
| Deputy Director | Comment, sign and recommend to Director. |
| Director | Comment, sign and approve for DOA review. |
| DOA | Final comments, signature and approval; issue the approval slip. |
| Administrator | Manage people and directorates; reset passwords; deactivate accounts; return mistakes for correction; archive mistaken applications; inspect the activity log. |

Each staff member and their reliever must belong to the same directorate. Directorate officers only access their own directorate. DOA and Admin have central access. Add at least one officer for each reviewing role and a second civilian staff account for relief before the office begins submitting applications.

### Approval sequence

**Applicant → Reliever → Civilian Head → AO → Deputy Director → Director → DOA → Approved slip**

The reliever uses their own civilian staff account. Their signature is part of the first form. Comments and drawn signatures are required for each review action. Names, appointments, ranks and dates come from authenticated accounts and server timestamps. The applicant cannot sign on a reliever's behalf.

Reviewers can **return for correction** or **reject**. Resubmission after a return creates a new revision and requires all signatures again. Prior fields, signatures and attachments stay in the history. Director approval alone does not permit a slip download.

Administrators resolve mistakes by returning a record or archiving it, with a reason. They cannot silently edit signed details or impersonate a signatory. Archiving removes a record from active lists and disables its slip download while preserving the audit trail. Already downloaded copies cannot be recalled; refer to the current application status when checking validity.

## Forms and documents

- All supplied original files remain in `all-forms`.
- The civilian application preserves the 14 numbered fields, applicant and reliever signatures, and includes station and department/appointment for the final slip.
- Civilian Head, AO, Deputy Director and Director sections preserve the template fields. The DOA section adds the final comment and signature that produces the supplied approval-slip layout.
- **Download form packet** produces the current forms with recorded signatures and comments. A standard packet is six pages; long entries may require continuation pages.
- **Download approval slip** is available only after final DOA approval, and only to accounts entitled to access the application.
- The slip uses the original logo, wording and field arrangement. It uses the recorded releasing-authority signature; the photographed rubber stamp is not copied onto new approvals.
- Signature pads accept mouse, touch or stylus. Signatures are stored as drawing coordinates and reproduced in PDF output. These are account-attributed handwritten signatures, not certificate-based PDF digital signatures.
- Dates display in Africa/Lagos time. Duration uses **calendar days**, inclusive of the effective date; it does not calculate leave balances or exclude weekends/public holidays.
- Attachments support PDF, PNG and JPEG, up to 3 MB each. Downloads require the same application access checks.

## Office deployment

The current instance runs on this computer only. A shared office deployment needs an office-controlled server or PC, a stable network address and HTTPS. Public hosting has not been configured.

Configuration uses environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listening address. Use `0.0.0.0` only when intentionally making the service available to the office network. |
| `PORT` | `3000` | HTTP listening port. |
| `DATABASE_PATH` | `data/dsa.sqlite` relative to the project | Location of the shared SQLite database. |
| `COOKIE_SECURE` | `false` | Set to `true` behind HTTPS so session cookies are sent only over HTTPS. |

Complete administrator setup locally before exposing the server. For shared use, place the app behind an HTTPS reverse proxy, preserve the original Host header, restrict network access to intended office users, and run it as a managed service. The same-origin write checks reject cross-site requests. Do not put the live SQLite file on a shared network drive; run one service with local database storage.

Passwords use salted scrypt hashes. Sessions use random, hashed tokens with an eight-hour expiry and HttpOnly/SameSite cookies. Password changes and account edits revoke older sessions. Failed-login throttling is per source and username; successful logins do not exhaust the allowance. Concurrent or stale approvals are rejected using application versions and SQLite transactions.

### Backups

Stop the app before copying the entire `data` directory to an office-approved backup location. It contains accounts, signatures, attachments and audit history. To restore, stop the app, preserve the current data directory, restore the backup directory and restart. Back up before updates. Do not publish the data directory or commit it to source control.

## Verification and development

```powershell
npm test
npm run check
npm run dev
```

The integration suite starts a real HTTP service against a temporary SQLite database. It covers serial approvals, missing signatures, duplicate/stale decisions, ownership and directorate isolation, revision invalidation, premature slip denial, PDF page counts, attachments, account roles, session invalidation, cross-origin writes and admin controls.

For repeatable browser QA with fictional records, run `node tests/ui-fixture.mjs` and visit **http://127.0.0.1:3001**. This creates a separate temporary database. Its printed QA credentials work only there. Use a separate browser session from the real app because cookies share a hostname across ports. `node tests/export-qa-pdfs.mjs` exports synthetic PDF samples to the ignored `test-results` folder.

The app provides in-app queues and status tracking. Approval email/SMS notifications, public hosting, leave-balance policies, and certificate-based signatures are not configured.

## First login and forgotten passwords

Accounts created by Admin must change their temporary password on first login. This restriction is enforced by the server, including access to applications and downloads. The initial administrator chooses their own password during setup and is exempt. Existing accounts that have never changed their admin-issued password are prompted after this update. Existing applications and signatures are preserved.

Admin must register a unique email for each person under **People & access**. Add emails to existing accounts, including the administrator. Users can see their registered email under **My account**; only Admin changes the registered recovery address.

The login page now includes **Forgot password?**. Recovery links expire after 30 minutes, work once, and reset the password without automatically signing in. Resetting or changing a password revokes older sessions and recovery links. Only a hash of the recovery token is stored. An Admin password reset or email change invalidates existing recovery links.

### Configure recovery-email delivery

1. Copy `.env.example` to `.env` in the project folder.
2. Enter your office SMTP host, port, sender address and SMTP credentials locally. Use a provider-supported SMTP credential; do not paste it into chat.
3. Set `APP_BASE_URL` to the address staff can open from their email. For shared office use, use the office's HTTPS app URL; `127.0.0.1` links only work on the same computer.
4. Restart the app. Use `SMTP_SECURE=true` for implicit TLS (typically port 465), or `false` for STARTTLS (typically port 587). STARTTLS is required when implicit TLS is disabled.

No sending account is included. Until SMTP and the app URL are configured, the recovery form explains that email recovery is unavailable. If a configured mail transport fails, Admin sees `password.recovery.delivery_failed` in **Activity log**. The public response does not disclose whether an email is registered.

## Source layout

`server/` contains the database, workflow, authentication, HTTP routes and PDF renderer. `public/` contains the responsive interface and signature pad. `tests/` contains integration tests and synthetic QA fixtures. The approved design and implementation checklist are in `docs/superpowers`.

### Approval slip printing

Approved slips use A5 portrait (148 × 210 mm), half the area of A4, following the supplied leave/pass form. The releasing-authority section embeds `all-forms/STAMP.jpg` with the recorded DOA signature and approval date. The appointment prints as Director of Administration. Existing stored signatures are preserved.

Print the downloaded slip at **Actual size / 100%** on A5 paper, or at actual size on A4 to retain its half-A4 dimensions. Do not select “Fit to page” on A4, which enlarges it. The full application packet remains A4.
