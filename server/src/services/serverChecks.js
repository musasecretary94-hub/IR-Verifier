// Checks that need the DATABASE (the sheet checks in /rules only look at numbers).
//   C1 (error)   the polling unit code on the sheet is not the agent's polling unit
//   C2 (info)    this polling unit already had an earlier submission
//   C3 (error)   the same photo, or the same serial number, belongs to ANOTHER polling unit
//   C4 (warning) "registered voters" on the sheet differs from the registry
//   F1 (error)   the form is incomplete
const { isNum } = require('../rules/helpers');

const REQUIRED_COUNTS = ['registered', 'accredited', 'issued', 'unused', 'spoiled', 'rejected', 'validTotal', 'usedTotal'];

function runServerChecks(db, { pu, sheet, imageHash }) {
  const findings = [];

  // F1: everything must be filled in
  const missing = [];
  REQUIRED_COUNTS.forEach((f) => { if (!isNum(sheet.counts[f])) missing.push(f); });
  sheet.parties.forEach((p) => { if (!isNum(p.figures)) missing.push('party:' + p.party); });
  if (!isNum(sheet.totalValidRow)) missing.push('totalValidRow');
  if (!sheet.header.serialNo) missing.push('serialNo');
  if (missing.length) findings.push({ code: 'F1', severity: 'error', details: { missing } });

  // C1
  if ((sheet.header.puCode || '') !== pu.code) {
    findings.push({ code: 'C1', severity: 'error', details: { entered: sheet.header.puCode || '', expected: pu.code } });
  }

  // C4
  if (isNum(sheet.counts.registered) && sheet.counts.registered !== pu.registered) {
    findings.push({ code: 'C4', severity: 'warning', details: { entered: sheet.counts.registered, registry: pu.registered } });
  }

  // C3 (photo)
  if (imageHash) {
    const other = db.prepare(`SELECT p.code FROM submissions s JOIN polling_units p ON p.id = s.polling_unit_id
      WHERE s.image_hash = ? AND s.polling_unit_id != ? LIMIT 1`).get(imageHash, pu.id);
    if (other) findings.push({ code: 'C3', severity: 'error', details: { kind: 'image', otherUnit: other.code } });
  }
  // C3 (serial number)
  if (sheet.header.serialNo) {
    const other = db.prepare(`SELECT p.code FROM submissions s JOIN polling_units p ON p.id = s.polling_unit_id
      WHERE s.serial_no = ? AND s.polling_unit_id != ? LIMIT 1`).get(sheet.header.serialNo, pu.id);
    if (other) findings.push({ code: 'C3', severity: 'error', details: { kind: 'serial', otherUnit: other.code } });
  }

  // C2
  const last = db.prepare('SELECT version, status FROM submissions WHERE polling_unit_id = ? ORDER BY version DESC LIMIT 1').get(pu.id);
  if (last) findings.push({ code: 'C2', severity: 'info', details: { version: last.version, status: last.status } });

  return findings;
}

const RANK = { error: 0, warning: 1, info: 2 };
const sortFindings = (list) => [...list].sort((a, b) => RANK[a.severity] - RANK[b.severity]);

module.exports = { runServerChecks, sortFindings };
