// Creates an agent account for every polling unit that has none, and saves the list in "agents.local.csv"
// (open it in Excel to track your work). Existing agents are kept as they are.
//   npm run create-agents -- --all                       random password for each agent
//   npm run create-agents -- --all --password MyDemoPass123   the same password for all (DEMO MODE only)
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { createMissingAgents } = require('../src/db/maintenance');

const args = process.argv.slice(2);
if (!args.includes('--all')) {
  console.log('Usage: npm run create-agents -- --all [--password <text, at least 10 characters>]');
  process.exit(1);
}
const config = load();
const pwIndex = args.indexOf('--password');
const shared = pwIndex >= 0 ? args[pwIndex + 1] : null;
if (pwIndex >= 0 && !shared) { console.error('Please write the password after --password'); process.exit(1); }
if (shared && !config.demoMode) { console.error('A shared password is allowed only when DEMO_MODE=true.'); process.exit(1); }

const db = openDb(config.dbPath);
let rows;
try {
  rows = createMissingAgents(db, { password: shared });
} catch (e) {
  console.error('Could not create the agents:', e.message);
  process.exit(1);
}

const made = rows.filter((r) => r.created).length;
const file = path.join(__dirname, '..', 'agents.local.csv');
console.log(`Polling units: ${rows.length}. New agent accounts: ${made}. Already had an agent: ${rows.length - made}.`);

// Passwords are stored only as hashes, so the file is the ONLY place they can be read.
// Never overwrite it with a list that has no passwords.
if (made === 0) {
  console.log('Nothing new was created, so the list file was left untouched.');
  process.exit(0);
}
if (fs.existsSync(file)) {
  const backup = file + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, backup);
  console.log('The previous list was kept as: ' + backup);
}

const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const lines = ['no,polling_unit_code,name,ward,lga,state,username,password,done'];
rows.forEach((r, i) => lines.push([i + 1, r.code, r.name, r.ward, r.lga, r.state, r.username, r.created ? r.password : '(already existed: see credentials.local.txt)', ''].map(q).join(',')));
fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`The list (in the order to upload) was saved in: ${file}`);
console.log('Keep this file private. It is ignored by Git.');
