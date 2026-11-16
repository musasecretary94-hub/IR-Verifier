// Updates the polling-unit registry from a CSV file.
//   npm run import-registry -- units-registered.csv          shows what WOULD change (nothing is changed)
//   npm run import-registry -- units-registered.csv --yes    really changes it
// If the file has even one problem, nothing is changed.
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { planImport, applyImport } = require('../src/db/registryCsv');

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--'));
if (!fileArg) {
  console.log('Usage: npm run import-registry -- <file.csv> [--yes]');
  process.exit(1);
}
const file = path.resolve(fileArg);
if (!fs.existsSync(file)) { console.error('File not found: ' + file); process.exit(1); }
if (fs.statSync(file).size > 20 * 1024 * 1024) { console.error('The file is too large (maximum 20 MB)'); process.exit(1); }

const db = openDb(load().dbPath);
const plan = planImport(db, fs.readFileSync(file, 'utf8'));
const s = plan.summary;

if (plan.errors.length) {
  console.log(`The file has ${plan.errors.length} problem(s). NOTHING was changed. Fix them and run again:`);
  plan.errors.slice(0, 25).forEach((e) => console.log(`  line ${e.line}: ${e.message}`));
  if (plan.errors.length > 25) console.log(`  ... and ${plan.errors.length - 25} more`);
  process.exit(1);
}

console.log(`Rows read: ${s.rows}`);
console.log(`  new polling units:        ${s.newUnits}`);
console.log(`  "registered" will change: ${s.registeredChanged}`);
console.log(`  place names will change:  ${s.placeChanged}`);
console.log(`  no change:                ${s.unchanged}`);
console.log(`  not in the file (kept as they are): ${s.notInFile}`);
plan.changes.slice(0, 10).forEach((c) => console.log(`    ${c.code}: ${c.kind === 'registered' ? `${c.from} -> ${c.to}` : c.kind === 'new' ? 'NEW, registered ' + c.to : c.to}`));
if (plan.changes.length > 10) console.log(`    ... and ${plan.changes.length - 10} more`);
plan.warnings.slice(0, 10).forEach((w) => console.log('  note: ' + w));

if (!args.includes('--yes')) {
  console.log('\nNothing was changed. To apply these changes, run again with --yes');
} else {
  applyImport(db, plan, { fileName: path.basename(file) });
  console.log('\nDone. The registry was updated.');
}
