// Removes ALL submitted results (including the synthetic ones from "npm run seed:demo") and their photos.
// Keeps the polling units, the admin and the agent accounts.
//   npm run reset-results            shows what would be deleted (nothing is deleted)
//   npm run reset-results -- --yes   really deletes
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { resetResults } = require('../src/db/maintenance');

const config = load();
const db = openDb(config.dbPath);
const confirm = process.argv.includes('--yes');
const r = resetResults(db, config.uploadDir, { confirm });

if (!r.deleted) {
  console.log(`Found ${r.submissions} results (${r.votes} party-vote rows, ${r.findings} findings).`);
  console.log('Nothing was deleted. To delete them for real, run:  npm run reset-results -- --yes');
} else {
  console.log(`Deleted ${r.submissions} results and ${r.removedFiles} photos. Polling units and accounts were kept.`);
}
