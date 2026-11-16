// Writes the polling-unit registry to a CSV file (open it in Excel, change "registered", save as CSV).
//   npm run export-registry                  -> units-registered.csv
//   npm run export-registry -- myfile.csv    -> myfile.csv
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { exportRegistryCsv } = require('../src/db/registryCsv');

const config = load();
const db = openDb(config.dbPath);
const file = path.resolve(process.argv[2] || 'units-registered.csv');
fs.writeFileSync(file, exportRegistryCsv(db));
const n = db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n;
console.log(`Saved ${n} polling units in: ${file}`);
