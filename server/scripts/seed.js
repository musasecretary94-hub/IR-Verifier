// Creates the database, the demo registry, one admin and six demo agents.
// Run:  npm run seed

const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { seedRegistry } = require('../src/db/demoData');
const { createUser } = require('../src/services/users');
const { generatePassword } = require('../src/security/passwords');

const config = load();
const db = openDb(config.dbPath);
const total = seedRegistry(db);
console.log(`Registry: ${total} synthetic polling units.`);

const lines = ['IR Verifier demo accounts (synthetic data). Keep this file private.', ''];
if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
  const pw = generatePassword();
  createUser(db, { username: 'admin', password: pw, role: 'admin' });
  lines.push(`ADMIN   username: admin   password: ${pw}`);
}
db.prepare('SELECT code FROM polling_units WHERE id % 12 = 1 ORDER BY id LIMIT 6').all().forEach((u) => {
  const username = 'agent-' + u.code.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return;
  const pw = generatePassword();
  createUser(db, { username, password: pw, role: 'agent', pollingUnitCode: u.code });
  lines.push(`AGENT   username: ${username}   password: ${pw}   polling unit: ${u.code}`);
});

if (lines.length > 2) {
  const file = path.join(__dirname, '..', 'credentials.local.txt');
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(lines.slice(2).join('\n'));
  console.log(`\nThe same list was saved in: ${file}`);
} else {
  console.log('Accounts already exist. Nothing new was created.');
}
