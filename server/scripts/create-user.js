// Creates one account.   Examples:
//   npm run create-user -- admin  reviewer1
//   npm run create-user -- agent  agent-ly-01-01-002  LA-01-01-002
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { createUser } = require('../src/services/users');
const { generatePassword } = require('../src/security/passwords');

const [role, username, pollingUnitCode] = process.argv.slice(2);
if (!['admin', 'agent'].includes(role) || !username || (role === 'agent' && !pollingUnitCode)) {
  console.log('Usage: npm run create-user -- admin <username>\n       npm run create-user -- agent <username> <polling-unit-code>');
  process.exit(1);
}
const db = openDb(load().dbPath);
const password = generatePassword();
try {
  createUser(db, { username, password, role, pollingUnitCode });
  console.log(`Created ${role} "${username}". Password (shown once): ${password}`);
} catch (e) {
  console.error('Could not create the user:', e.message);
  process.exit(1);
}
