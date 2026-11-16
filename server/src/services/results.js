// Public results: only APPROVED submissions are ever counted.
// Levels: country -> state -> LGA -> ward -> polling unit.
const { HttpError } = require('../middleware/errors');
const { plainAll, plain } = require('../db/connection');
const { PARTIES } = require('../config/elections');

const NEXT = { country: 'state', state: 'lga', lga: 'ward', ward: 'unit' };

function scopeOf({ state, lga, ward }) {
  const s = typeof state === 'string' && state ? state : null;
  const l = typeof lga === 'string' && lga ? lga : null;
  const w = typeof ward === 'string' && ward ? ward : null;
  if (l && !s) throw new HttpError(400, 'bad_values', 'An LGA needs a state');
  if (w && !l) throw new HttpError(400, 'bad_values', 'A ward needs an LGA');
  const where = [];
  const params = [];
  if (s) { where.push('pu.state = ?'); params.push(s); }
  if (l) { where.push('pu.lga = ?'); params.push(l); }
  if (w) { where.push('pu.ward = ?'); params.push(w); }
  const level = w ? 'ward' : l ? 'lga' : s ? 'state' : 'country';
  return { level, where: where.length ? 'WHERE ' + where.join(' AND ') : '', params, state: s, lga: l, ward: w };
}

function getArea(db, query) {
  const sc = scopeOf(query);

  const exists = db.prepare(`SELECT COUNT(*) AS n FROM polling_units pu ${sc.where}`).get(...sc.params).n;
  if (exists === 0 && sc.level !== 'country') throw new HttpError(404, 'not_found', 'Area not found');

  const total = plain(db.prepare(`SELECT COUNT(*) AS units, COUNT(s.id) AS approved_units,
      COALESCE(SUM(s.registered), 0) AS registered, COALESCE(SUM(s.accredited), 0) AS accredited,
      COALESCE(SUM(s.rejected), 0) AS rejected, COALESCE(SUM(s.valid_total), 0) AS valid_total, COALESCE(SUM(s.used_total), 0) AS used_total
    FROM polling_units pu LEFT JOIN submissions s ON s.polling_unit_id = pu.id AND s.status = 'approved' ${sc.where}`).get(...sc.params));

  const sums = new Map(plainAll(db.prepare(`SELECT pv.party AS party, SUM(pv.votes) AS votes
    FROM party_votes pv JOIN submissions s ON s.id = pv.submission_id AND s.status = 'approved'
    JOIN polling_units pu ON pu.id = s.polling_unit_id ${sc.where} GROUP BY pv.party`).all(...sc.params)).map((r) => [r.party, r.votes]));
  const parties = PARTIES.map((p) => ({ party: p, votes: sums.get(p) || 0 }));

  const next = NEXT[sc.level];
  let children;
  if (next === 'unit') {
    children = plainAll(db.prepare(`SELECT pu.code, pu.name, s.id AS submission_id, s.valid_total, s.accredited, s.reviewed_at
      FROM polling_units pu LEFT JOIN submissions s ON s.polling_unit_id = pu.id AND s.status = 'approved' ${sc.where} ORDER BY pu.code`).all(...sc.params))
      .map((r) => ({ type: 'unit', code: r.code, name: r.name, approved: r.submission_id !== null, validTotal: r.valid_total, accredited: r.accredited, approvedAt: r.reviewed_at }));
  } else {
    const col = { state: 'pu.state', lga: 'pu.lga', ward: 'pu.ward' }[next];
    children = plainAll(db.prepare(`SELECT ${col} AS name, COUNT(*) AS units, COUNT(s.id) AS approved_units,
        COALESCE(SUM(s.valid_total), 0) AS valid_total, COALESCE(SUM(s.accredited), 0) AS accredited
      FROM polling_units pu LEFT JOIN submissions s ON s.polling_unit_id = pu.id AND s.status = 'approved' ${sc.where}
      GROUP BY ${col} ORDER BY ${col}`).all(...sc.params))
      .map((r) => ({ type: next, name: r.name, units: r.units, approvedUnits: r.approved_units, validTotal: r.valid_total, accredited: r.accredited }));
  }

  return {
    level: sc.level,
    path: { state: sc.state, lga: sc.lga, ward: sc.ward },
    coverage: { units: total.units, approvedUnits: total.approved_units },
    totals: { registered: total.registered, accredited: total.accredited, rejected: total.rejected, validTotal: total.valid_total, usedTotal: total.used_total },
    parties,
    childLevel: next,
    children,
  };
}

function getUnit(db, code) {
  const pu = db.prepare('SELECT * FROM polling_units WHERE code = ?').get(code);
  if (!pu) throw new HttpError(404, 'not_found', 'Polling unit not found');
  const s = db.prepare("SELECT * FROM submissions WHERE polling_unit_id = ? AND status = 'approved'").get(pu.id);
  const unit = { code: pu.code, name: pu.name, ward: pu.ward, lga: pu.lga, state: pu.state, registered: pu.registered };
  if (!s) return { unit, approved: false };
  const votes = plainAll(db.prepare('SELECT party, votes FROM party_votes WHERE submission_id = ? ORDER BY party').all(s.id));
  const byParty = new Map(votes.map((v) => [v.party, v.votes]));
  return {
    unit,
    approved: true,
    submissionId: s.id,
    approvedAt: s.reviewed_at,
    counts: { registered: s.registered, accredited: s.accredited, issued: s.issued, unused: s.unused, spoiled: s.spoiled, rejected: s.rejected, validTotal: s.valid_total, usedTotal: s.used_total },
    parties: PARTIES.map((p) => ({ party: p, votes: byParty.get(p) || 0 })),
  };
}

module.exports = { getArea, getUnit };
