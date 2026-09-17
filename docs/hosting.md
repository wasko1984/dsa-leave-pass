# Hosting DSA Leave and Pass

Status: deployment files prepared; no remote service has been provisioned or published.

## Runtime

The Dockerfile packages the existing Node.js app, frontend, logo and stamp.
It excludes the local database, environment secrets, tests and reference documents.
Use one running instance with a persistent disk mounted at `/app/data`, writable
by the container's `node` user (UID 1000). Do not deploy with ephemeral storage
or multiple replicas sharing a SQLite database.

Configure the host to build `Dockerfile`, route HTTPS to the container's port
3000 (or set `PORT`), and preserve the original Host header. The health check is
GET `/api/setup`. Set `APP_BASE_URL` to the final HTTPS origin. Secure cookies
are enabled in the image. Add SMTP configuration from `.env.example` using the
hosting provider's secret settings if password recovery email is needed.

## Initial publication

1. Select a hosting account and persistent-storage plan.
2. Build the image and mount persistent storage before starting the service.
3. Keep initial access restricted until the owner creates the administrator.
   A new empty database otherwise exposes first-administrator setup.
4. If preserving existing accounts and applications, stop the local app and
   securely transfer a consistent database backup into the mounted disk before
   startup. Never include that backup in a Git repository or container image.
5. Verify HTTPS login, signatures, an approved A5 PDF with stamp, and retained
   data after a service restart before sharing the access URL.

The container has not yet been built or tested because Docker is not installed
in the current environment. Hosting credentials and a destination are still needed.
