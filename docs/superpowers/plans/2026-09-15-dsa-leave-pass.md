# DSA-LEAVE-PASS Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the provided empty project workspace.

**Goal:** Deliver a runnable seven-dashboard office leave/pass application with serial signatures and final approval PDF.

**Architecture:** A same-origin Node HTTP service owns authentication, authorization and workflow transitions. SQLite stores users, applications, versions, attachments, sessions and audit entries; the browser renders responsive role-specific screens. PDF generation uses immutable approved snapshots.

**Tech Stack:** Node.js 22.13+, node:sqlite, node:test, PDFKit, plain browser ES modules.

**Spec:** docs/superpowers/specs/2026-09-15-dsa-leave-pass-design.md

## Global constraints
- Preserve the files in all-forms.
- Seven role dashboards; reliever uses their own staff account.
- No slip before final DOA approval and no skipped approval stages.
- No shipped default password and no client-side authority decisions.
- All corrections invalidate active signatures and preserve history.

## Task 1: Authentication and workflow service
Files: package.json, server/db.mjs, server/security.mjs, server/workflow.mjs, server/app.mjs, server/index.mjs, tests/application.test.mjs.
Interfaces: createApp({dbPath}) returns {server, close}; HTTP JSON /api/setup, /api/login, /api/me, /api/users, /api/applications, /api/applications/:id/actions. Authenticated decisions accept {version, action, comment, signature}; the server resolves the actor and role.
- [x] Write integration tests with an ephemeral server and temporary database. Assert an unauthenticated request returns 401; wrong-role decision returns 403; a full approval yields approved; a second decision at the stale version returns 409.
- [x] Run `node --test tests/application.test.mjs` and confirm failure before implementation.
- [x] Implement database transactions, hashed passwords, sessions, input validation, authenticated attachments, directorate routing, admin management and versioned transitions.
- [x] Run the integration suite; inspect failures and correct their causes.

## Task 2: Branded dashboard and forms
Files: public/index.html, public/styles.css, public/app.js, public/signature.js, public/favicon.svg, public/logo.JPG.
Interfaces: UI uses /api/me for role, /api/applications for accessible queues, /api/directory for eligible relievers, and POST actions for signed transitions. All responses use {error} for failures.
- [x] Implement the logo landing screen and first-run administrator setup.
- [x] Implement seven dashboard variants, searchable lists, status filters, application detail, template-matching form sections, pointer signature pad and account password change.
- [x] Implement staff application/resubmission, review actions, revision history and administration forms with visible success/error feedback.
- [x] Verify syntax, then open the served app and exercise the real primary journey including a narrow viewport.

## Task 3: PDF, review and handoff
Files: server/pdf.mjs, tests/application.test.mjs, README.md, start.cmd, .gitignore.
Interfaces: GET /api/applications/:id/slip returns application/pdf only when approved and authorized; GET /api/applications/:id/packet returns the current accessible form packet.
- [x] Add tests asserting premature/unauthorized slip denial and a final PDF response beginning with %PDF.
- [x] Implement branded slip and full signed packet, including dates, comments and drawn signatures.
- [x] Review authorization, revision rules, attachment access, PDF contents and admin actions with gstack review.
- [x] Run the complete integration suite and browser checks; save concrete results in README.
- [x] Provide start instructions and first-admin setup, office deployment guidance and limitations.
