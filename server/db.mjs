import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, directorate TEXT NOT NULL, appointment TEXT NOT NULL, rank TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), directorate TEXT NOT NULL, stage TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS directorates (name TEXT PRIMARY KEY COLLATE NOCASE);
    INSERT OR IGNORE INTO directorates(name) VALUES ('Administration'), ('Engineering');`);
  const columns = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!columns.includes('email')) db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  if (!columns.includes('must_change_password')) {
    db.exec(`ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
      UPDATE users SET must_change_password=1
      WHERE (role!='admin' OR id IN (SELECT target FROM audit WHERE action='user.create'))
      AND id NOT IN (SELECT target FROM audit WHERE action='user.password');`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email)) WHERE email!='';
    CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, created INTEGER NOT NULL);`);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function audit(db, user, action, target, detail = '') {
  db.prepare('INSERT INTO audit(actor_id,actor_name,action,target,detail,created_at) VALUES(?,?,?,?,?,?)').run(user.id, user.name, action, target, detail, new Date().toISOString());
}
