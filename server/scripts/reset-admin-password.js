const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { hashPassword } = require('../src/security/passwords');

const db = openDb(load().dbPath);
const privateDir = path.join(os.homedir(), 'IR-verifier-private');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(privateDir, `admin-credentials-${stamp}.csv`);

try {
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

  const admin = db.prepare(
    "SELECT id, username FROM users WHERE role='admin' AND active=1"
  ).all();

  if (admin.length !== 1 || admin[0].username !== 'admin') {
    throw new Error('Expected exactly one active admin account named admin. Aborting.');
  }

  if (fs.existsSync(file)) {
    throw new Error('Credentials file already exists. Aborting.');
  }

  const password = crypto.randomBytes(12).toString('base64url');
  const passwordHash = hashPassword(password);

  const csv = [
    'username,password',
    `"${admin[0].username}","${password}"`
  ].join('\n') + '\n';

  db.exec('BEGIN IMMEDIATE');

  const result = db.prepare(
    "UPDATE users SET password_hash=? WHERE id=? AND role='admin'"
  ).run(passwordHash, admin[0].id);

  if (Number(result.changes) !== 1) {
    throw new Error('Admin password update failed.');
  }

  fs.writeFileSync(file, csv, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  fs.chmodSync(file, 0o600);

  db.exec('COMMIT');

  console.log('SUCCESS: Admin password reset.');
  console.log('Credentials file:', file);
  console.log('Password was NOT printed in terminal.');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  console.error('RESET FAILED:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
