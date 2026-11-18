// PostgreSQL version of database-dependent sheet checks.
const { isNum } = require('../rules/helpers');

const REQUIRED_COUNTS = [
  'registered', 'accredited', 'issued', 'unused',
  'spoiled', 'rejected', 'validTotal', 'usedTotal'
];

async function runServerChecks(db, { pu, sheet, imageHash }) {
  const findings = [];

  // F1: Check required fields
  const missing = [];

  REQUIRED_COUNTS.forEach((field) => {
    if (!isNum(sheet.counts[field])) missing.push(field);
  });

  sheet.parties.forEach((party) => {
    if (!isNum(party.figures)) missing.push('party:' + party.party);
  });

  if (!isNum(sheet.totalValidRow)) missing.push('totalValidRow');
  if (!sheet.header.serialNo) missing.push('serialNo');

  if (missing.length) {
    findings.push({
      code: 'F1',
      severity: 'error',
      details: { missing }
    });
  }

  // C1: Polling unit mismatch
  if ((sheet.header.puCode || '') !== pu.code) {
    findings.push({
      code: 'C1',
      severity: 'error',
      details: {
        entered: sheet.header.puCode || '',
        expected: pu.code
      }
    });
  }

  // C4: Registered voters mismatch
  if (
    isNum(sheet.counts.registered) &&
    sheet.counts.registered !== pu.registered
  ) {
    findings.push({
      code: 'C4',
      severity: 'warning',
      details: {
        entered: sheet.counts.registered,
        registry: pu.registered
      }
    });
  }

  // C3: Duplicate image
  if (imageHash) {
    const result = await db.query(
      `SELECT p.code
       FROM submissions s
       JOIN polling_units p ON p.id = s.polling_unit_id
       WHERE s.image_hash = $1
         AND s.polling_unit_id != $2
       LIMIT 1`,
      [imageHash, pu.id]
    );

    if (result.rows[0]) {
      findings.push({
        code: 'C3',
        severity: 'error',
        details: {
          kind: 'image',
          otherUnit: result.rows[0].code
        }
      });
    }
  }

  // C3: Duplicate serial number
  if (sheet.header.serialNo) {
    const result = await db.query(
      `SELECT p.code
       FROM submissions s
       JOIN polling_units p ON p.id = s.polling_unit_id
       WHERE s.serial_no = $1
         AND s.polling_unit_id != $2
       LIMIT 1`,
      [sheet.header.serialNo, pu.id]
    );

    if (result.rows[0]) {
      findings.push({
        code: 'C3',
        severity: 'error',
        details: {
          kind: 'serial',
          otherUnit: result.rows[0].code
        }
      });
    }
  }

  // C2: Previous submission
  const lastResult = await db.query(
    `SELECT version, status
     FROM submissions
     WHERE polling_unit_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [pu.id]
  );

  if (lastResult.rows[0]) {
    findings.push({
      code: 'C2',
      severity: 'info',
      details: {
        version: lastResult.rows[0].version,
        status: lastResult.rows[0].status
      }
    });
  }

  return findings;
}

const RANK = { error: 0, warning: 1, info: 2 };

const sortFindings = (list) =>
  [...list].sort((a, b) => RANK[a.severity] - RANK[b.severity]);

module.exports = { runServerChecks, sortFindings };
