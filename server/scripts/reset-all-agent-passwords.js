const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { hashPassword } = require('../src/security/passwords');

const db = openDb(load().dbPath);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(__dirname, '..', 'backups');
const privateDir = path.join(os.homedir(), 'IR-verifier-private');

const backupFile = path.join(
  backupDir,
  `verifier-before-agent-password-reset-${stamp}.db`
);

const credentialsFile = path.join(
  privateDir,
  `all-agent-credentials-${stamp}.csv`
);

let transactionStarted = false;
let credentialsWritten = false;

function csv(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

function validateAgents() {
  const totalAgents = db.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role='agent'"
  ).get().n;

  const totalPUs = db.prepare(
    'SELECT COUNT(*) AS n FROM polling_units'
  ).get().n;

  const missing = db.prepare(`
    SELECT COUNT(*) AS n
    FROM polling_units p
    LEFT JOIN users u
      ON u.polling_unit_id=p.id AND u.role='agent'
    WHERE u.id IS NULL
  `).get().n;

  const duplicates = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT polling_unit_id
      FROM users
      WHERE role='agent'
      GROUP BY polling_unit_id
      HAVING COUNT(*) > 1
    )
  `).get().n;

  if (totalAgents !== 96 || totalPUs !== 96 ||
      missing !== 0 || duplicates !== 0) {
    throw new Error(
      `Safety check failed: Agents=${totalAgents}, PUs=${totalPUs}, missing=${missing}, duplicates=${duplicates}`
    );
  }

  return db.prepare(`
    SELECT u.id, u.username, p.code, p.state
    FROM users u
    JOIN polling_units p ON p.id=u.polling_unit_id
    WHERE u.role='agent'
    ORDER BY p.state,p.code
  `).all();
}

try {
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

  if (fs.existsSync(backupFile) || fs.existsSync(credentialsFile)) {
    throw new Error('Output file already exists. Aborting safely.');
  }

  // Verify all 96 agents before making changes.
  validateAgents();

  // Create a consistent SQLite backup first.
  db.exec(`VACUUM INTO '${backupFile}'`);

  // Begin the password update transaction.
  db.exec('BEGIN IMMEDIATE');
  transactionStarted = true;

  const agents = validateAgents();
  const output = ['polling_unit_code,state,username,password'];

  for (const agent of agents) {
    const password = crypto.randomBytes(9).toString('base64url');
    const passwordHash = hashPassword(password);

    const result = db.prepare(`
      UPDATE users
      SET password_hash=?
      WHERE id=? AND role='agent'
    `).run(passwordHash, agent.id);

    if (Number(result.changes) !== 1) {
      throw new Error(`Could not update Agent account: ${agent.username}`);
    }

    output.push([
      agent.code,
      agent.state,
      agent.username,
      password
    ].map(csv).join(','));
  }

  fs.writeFileSync(
    credentialsFile,
    output.join('\n') + '\n',
    { encoding: 'utf8', flag: 'wx', mode: 0o600 }
  );

  fs.chmodSync(credentialsFile, 0o600);
  credentialsWritten = true;

  db.exec('COMMIT');
  transactionStarted = false;

  console.log('SUCCESS: All 96 Agent passwords reset.');
  console.log('Credentials CSV:', credentialsFile);
  console.log('Database backup:', backupFile);
  console.log('Passwords were NOT printed in the terminal.');

} catch (error) {
  if (transactionStarted) {
    try { db.exec('ROLLBACK'); } catch {}
  }

  if (credentialsWritten) {
    try { fs.unlinkSync(credentialsFile); } catch {}
  }

  console.error('RESET FAILED:', error.message);
  process.exitCode = 1;

} finally {
  db.close();
}
