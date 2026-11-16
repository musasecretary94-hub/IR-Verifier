// Operator tools (run by scripts, never by the web app):
//   resetResults:       removes every submitted result and its photo, keeps polling units and accounts
//   createMissingAgents: gives every polling unit that has no agent an agent account
const fs = require('node:fs');
const path = require('node:path');
const { transaction } = require('./connection');
const { createUser } = require('../services/users');
const { generatePassword } = require('../security/passwords');
const audit = require('../services/audit');

const PHOTO_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

function resetResults(db, uploadDir, { confirm = false } = {}) {
  const counts = {
    submissions: db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n,
    votes: db.prepare('SELECT COUNT(*) AS n FROM party_votes').get().n,
    findings: db.prepare('SELECT COUNT(*) AS n FROM findings').get().n,
  };
  if (!confirm) return { ...counts, deleted: false };

  const files = db.prepare('SELECT image_file FROM submissions').all().map((r) => r.image_file);
  transaction(db, () => {
    db.exec('DELETE FROM findings; DELETE FROM party_votes; DELETE FROM submissions;');
    audit.record(db, { user: null, action: 'results.cleared', detail: counts });
  });
  let removedFiles = 0;
  files.filter((f) => PHOTO_NAME.test(f)).forEach((f) => {
    const p = path.join(uploadDir, f);
    if (fs.existsSync(p)) { fs.rmSync(p); removedFiles++; }
  });
  return { ...counts, deleted: true, removedFiles };
}

function createMissingAgents(db, { password = null } = {}) {
  const units = db.prepare(`SELECT p.id, p.code, p.name, p.ward, p.lga, p.state,
      (SELECT username FROM users u WHERE u.polling_unit_id = p.id AND u.role = 'agent' LIMIT 1) AS existing
    FROM polling_units p ORDER BY p.id`).all();
  return units.map((u) => {
    if (u.existing) return { code: u.code, name: u.name, ward: u.ward, lga: u.lga, state: u.state, username: u.existing, password: null, created: false };
    const username = 'agent-' + u.code.toLowerCase();
    const pw = password || generatePassword();
    createUser(db, { username, password: pw, role: 'agent', pollingUnitCode: u.code });
    return { code: u.code, name: u.name, ward: u.ward, lga: u.lga, state: u.state, username, password: pw, created: true };
  });
}

module.exports = { resetResults, createMissingAgents };
