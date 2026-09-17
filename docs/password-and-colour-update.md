# Password lifecycle and service colours

Requested: require a personal password at first login, send forgotten-password links to registered email addresses, and use Army/Navy/Air Force colours from the supplied logo.

Implemented: additive SQLite migration for registered email and first-login flags; restricted first-login session; one-use hashed recovery tokens with 30-minute expiry; session/token revocation; SMTP delivery configuration loaded from a local ignored .env file; account email fields; login/recovery/password screens; red, deep-blue and sky-blue interface treatments.

Tests use an isolated database and a captured email delivery function. They verify first-login gating, different-password requirement, recovery delivery recipient, generic response for unknown addresses, successful recovery, reuse rejection, expiry and session revocation. Live SMTP delivery requires office configuration and has not been verified.

Existing office data is retained. The migration exempts the initial administrator and accounts with an audited personal-password change; other existing admin-issued accounts require a change. Existing email fields start empty and must be completed by Admin.
