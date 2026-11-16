// Fills the public page with synthetic APPROVED results so you can see the ward/LGA/state/country totals.
// It skips the polling units that have a demo agent (so you can still submit those yourself).
// Run:  npm run seed:demo

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load } = require('../src/config/env');
const { openDb, transaction } = require('../src/db/connection');
const { makeSheetNumbers, seedRegistry } = require('../src/db/demoData');
const { demoPng } = require('../src/db/png');
const { sha256 } = require('../src/security/images');

const config = load();
const db = openDb(config.dbPath);
seedRegistry(db);
const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!admin) { console.error('Run "npm run seed" first (it creates the admin).'); process.exit(1); }
fs.mkdirSync(config.uploadDir, { recursive: true });

const units = db.prepare(`SELECT * FROM polling_units WHERE id NOT IN (SELECT polling_unit_id FROM users WHERE polling_unit_id IS NOT NULL)
  AND id NOT IN (SELECT polling_unit_id FROM submissions) ORDER BY id`).all();
let made = 0;
units.forEach((pu, i) => {
  if (i % 3 === 2) return; // leave about one third empty, to show "coverage"
  const s = makeSheetNumbers(pu);
  const png = demoPng(pu.code);
  const file = crypto.randomUUID() + '.png';
  fs.writeFileSync(path.join(config.uploadDir, file), png);
  const c = s.counts;
  const sheet = { header: { puCode: pu.code, serialNo: s.serialNo }, counts: c, parties: s.parties, totalValidRow: s.totalValidRow };
  transaction(db, () => {
    const r = db.prepare(`INSERT INTO submissions (polling_unit_id, version, status, agent_id, serial_no, registered, accredited, issued, unused, spoiled, rejected,
      valid_total, used_total, total_valid_row, image_file, image_hash, image_type, sheet_json, reviewer_id, reviewed_at)
      VALUES (?, 1, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'image/png', ?, ?, datetime('now'))`).run(
      pu.id, admin.id, s.serialNo, c.registered, c.accredited, c.issued, c.unused, c.spoiled, c.rejected, c.validTotal, c.usedTotal,
      s.totalValidRow, file, sha256(png), JSON.stringify(sheet), admin.id);
    const add = db.prepare('INSERT INTO party_votes (submission_id, party, votes) VALUES (?, ?, ?)');
    s.parties.forEach((p) => add.run(Number(r.lastInsertRowid), p.party, p.figures));
  });
  made++;
});
console.log(`Created ${made} synthetic approved results (of ${units.length} free polling units).`);
