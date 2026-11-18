// Public PostgreSQL results.
// Only APPROVED submissions are ever counted.

const { HttpError } = require('../middleware/errors');
const { PARTIES } = require('../config/elections');

const NEXT = {
  country: 'state',
  state: 'lga',
  lga: 'ward',
  ward: 'unit'
};

const num = (value) => Number(value || 0);

function scopeOf({ state, lga, ward }) {
  const s = typeof state === 'string' && state ? state : null;
  const l = typeof lga === 'string' && lga ? lga : null;
  const w = typeof ward === 'string' && ward ? ward : null;

  if (l && !s) {
    throw new HttpError(400, 'bad_values', 'An LGA needs a state');
  }

  if (w && !l) {
    throw new HttpError(400, 'bad_values', 'A ward needs an LGA');
  }

  const where = [];
  const params = [];

  if (s) {
    params.push(s);
    where.push(`pu.state = $${params.length}`);
  }

  if (l) {
    params.push(l);
    where.push(`pu.lga = $${params.length}`);
  }

  if (w) {
    params.push(w);
    where.push(`pu.ward = $${params.length}`);
  }

  const level = w ? 'ward' : l ? 'lga' : s ? 'state' : 'country';

  return {
    level,
    where: where.length ? 'WHERE ' + where.join(' AND ') : '',
    params,
    state: s,
    lga: l,
    ward: w
  };
}

async function getArea(db, query) {
  const sc = scopeOf(query);

  const exists = await db.query(
    `SELECT COUNT(*) AS n
     FROM polling_units pu
     ${sc.where}`,
    sc.params
  );

  if (num(exists.rows[0].n) === 0 && sc.level !== 'country') {
    throw new HttpError(404, 'not_found', 'Area not found');
  }

  const totalResult = await db.query(
    `SELECT
       COUNT(*) AS units,
       COUNT(s.id) AS approved_units,
       COALESCE(SUM(s.registered), 0) AS registered,
       COALESCE(SUM(s.accredited), 0) AS accredited,
       COALESCE(SUM(s.rejected), 0) AS rejected,
       COALESCE(SUM(s.valid_total), 0) AS valid_total,
       COALESCE(SUM(s.used_total), 0) AS used_total
     FROM polling_units pu
     LEFT JOIN submissions s
       ON s.polling_unit_id = pu.id
       AND s.status = 'approved'
     ${sc.where}`,
    sc.params
  );

  const total = totalResult.rows[0];

  const sumsResult = await db.query(
    `SELECT
       pv.party,
       SUM(pv.votes) AS votes
     FROM party_votes pv
     JOIN submissions s
       ON s.id = pv.submission_id
       AND s.status = 'approved'
     JOIN polling_units pu
       ON pu.id = s.polling_unit_id
     ${sc.where}
     GROUP BY pv.party`,
    sc.params
  );

  const sums = new Map(
    sumsResult.rows.map((r) => [r.party, num(r.votes)])
  );

  const parties = PARTIES.map((party) => ({
    party,
    votes: sums.get(party) || 0
  }));

  const next = NEXT[sc.level];
  let children;

  if (next === 'unit') {
    const unitsResult = await db.query(
      `SELECT
         pu.code,
         pu.name,
         s.id AS submission_id,
         s.valid_total,
         s.accredited,
         s.reviewed_at
       FROM polling_units pu
       LEFT JOIN submissions s
         ON s.polling_unit_id = pu.id
         AND s.status = 'approved'
       ${sc.where}
       ORDER BY pu.code`,
      sc.params
    );

    children = unitsResult.rows.map((r) => ({
      type: 'unit',
      code: r.code,
      name: r.name,
      approved: r.submission_id !== null,
      validTotal: r.valid_total === null ? null : num(r.valid_total),
      accredited: r.accredited === null ? null : num(r.accredited),
      approvedAt: r.reviewed_at
    }));
  } else {
    const col = {
      state: 'pu.state',
      lga: 'pu.lga',
      ward: 'pu.ward'
    }[next];

    const childrenResult = await db.query(
      `SELECT
         ${col} AS name,
         COUNT(*) AS units,
         COUNT(s.id) AS approved_units,
         COALESCE(SUM(s.valid_total), 0) AS valid_total,
         COALESCE(SUM(s.accredited), 0) AS accredited
       FROM polling_units pu
       LEFT JOIN submissions s
         ON s.polling_unit_id = pu.id
         AND s.status = 'approved'
       ${sc.where}
       GROUP BY ${col}
       ORDER BY ${col}`,
      sc.params
    );

    children = childrenResult.rows.map((r) => ({
      type: next,
      name: r.name,
      units: num(r.units),
      approvedUnits: num(r.approved_units),
      validTotal: num(r.valid_total),
      accredited: num(r.accredited)
    }));
  }

  return {
    level: sc.level,
    path: {
      state: sc.state,
      lga: sc.lga,
      ward: sc.ward
    },
    coverage: {
      units: num(total.units),
      approvedUnits: num(total.approved_units)
    },
    totals: {
      registered: num(total.registered),
      accredited: num(total.accredited),
      rejected: num(total.rejected),
      validTotal: num(total.valid_total),
      usedTotal: num(total.used_total)
    },
    parties,
    childLevel: next,
    children
  };
}

async function getUnit(db, code) {
  const puResult = await db.query(
    'SELECT * FROM polling_units WHERE code = $1',
    [code]
  );

  const pu = puResult.rows[0];

  if (!pu) {
    throw new HttpError(404, 'not_found', 'Polling unit not found');
  }

  const submissionResult = await db.query(
    `SELECT *
     FROM submissions
     WHERE polling_unit_id = $1
       AND status = 'approved'`,
    [pu.id]
  );

  const submission = submissionResult.rows[0];

  const unit = {
    code: pu.code,
    name: pu.name,
    ward: pu.ward,
    lga: pu.lga,
    state: pu.state,
    registered: num(pu.registered)
  };

  if (!submission) {
    return {
      unit,
      approved: false
    };
  }

  const votesResult = await db.query(
    `SELECT party, votes
     FROM party_votes
     WHERE submission_id = $1
     ORDER BY party`,
    [submission.id]
  );

  const byParty = new Map(
    votesResult.rows.map((v) => [v.party, num(v.votes)])
  );

  return {
    unit,
    approved: true,
    submissionId: Number(submission.id),
    approvedAt: submission.reviewed_at,
    counts: {
      registered: num(submission.registered),
      accredited: num(submission.accredited),
      issued: num(submission.issued),
      unused: num(submission.unused),
      spoiled: num(submission.spoiled),
      rejected: num(submission.rejected),
      validTotal: num(submission.valid_total),
      usedTotal: num(submission.used_total)
    },
    parties: PARTIES.map((party) => ({
      party,
      votes: byParty.get(party) || 0
    }))
  };
}

module.exports = {
  getArea,
  getUnit
};
