const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { createUser } = require('../src/services/users');
const { generatePassword } = require('../src/security/passwords');

const db = openDb(load().dbPath);

const privateDir = path.join(os.homedir(), 'IR-verifier-private');
const outputFile = path.join(privateDir, 'gombe-agent-credentials.csv');

function csv(value) {
  return '"' + String(value).replace(/"/g, '""') + '"';
}

try {
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

  if (fs.existsSync(outputFile)) {
    throw new Error('Credentials file already exists. Aborting to avoid overwriting it.');
  }

  db.exec('BEGIN IMMEDIATE');

  const missing = db.prepare(`
    SELECT p.id, p.code
    FROM polling_units p
    LEFT JOIN users u
      ON u.polling_unit_id = p.id
      AND u.role = 'agent'
    WHERE u.id IS NULL
    ORDER BY p.code
  `).all();

  if (missing.length === 0) {
    throw new Error('No missing Agent accounts found.');
  }

  const credentials = [];

  for (const pu of missing) {
    const username = 'agent-' + pu.code.toLowerCase();
    const password = generatePassword();

    createUser(db, {
      username,
      password,
      role: 'agent',
      pollingUnitCode: pu.code
    });

    credentials.push({
      code: pu.code,
      username,
      password
    });
  }

  const content = [
    'polling_unit_code,username,password',
    ...credentials.map(item =>
      [item.code, item.username, item.password].map(csv).join(',')
    )
  ].join('\n') + '\n';

  fs.writeFileSync(outputFile, content, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600
  });

  fs.chmodSync(outputFile, 0o600);

  db.exec('COMMIT');

  console.log('SUCCESS: Agent accounts created:', credentials.length);
  console.log('Credentials saved securely outside the project folder.');
  console.log('File:', outputFile);
  console.log('Passwords were NOT printed in the terminal.');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch {}
  try { fs.unlinkSync(outputFile); } catch {}
  console.error('FAILED:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
