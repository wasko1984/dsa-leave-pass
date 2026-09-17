import { createApp } from './app.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const app = createApp({ dbPath: process.env.DATABASE_PATH });
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
app.server.listen(port, host, () => console.log(`DSA-LEAVE-PASS is ready at http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.server.close(() => { app.close(); process.exit(0); }));
