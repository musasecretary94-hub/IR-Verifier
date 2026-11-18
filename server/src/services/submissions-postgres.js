// PostgreSQL submissions service.
// SQLite service remains untouched.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { HttpError } = require('../middleware/errors');
const { transaction } = require('../db/transaction-postgres');
const { PARTIES } = require('../config/elections');
const { analyzeExtraction } = require('./pipeline');
const { validateSheet } = require('./validation');
const { sanitizeValues, toRaw, sheetToValues } = require('./values');
const { runServerChecks, sortFindings } = require('./serverChecks-postgres');
const { decorate } = require('./explain');
const {
  detectImageType,
  decodeBase64Image,
  sha256
} = require('../security/images');
const audit = require('./audit-postgres');

const hasErrors = (findings) =>
  findings.some((item) => item.severity === 'error');

const hasWarnings = (findings) =>
  findings.some((item) => item.severity === 'warning');

async function getPU(db, id) {
  const result = await db.query(
    'SELECT * FROM polling_units WHERE id = $1',
    [id]
  );

  const pu = result.rows[0];

  if (!pu) {
    throw new HttpError(404, 'not_found', 'Polling unit not found');
  }

  return pu;
}

async function analyze(ctx, user, values, imageHash = null, imageQuality = null, db = ctx.db) {
  const pu = await getPU(db, user.pollingUnitId);
  const clean = sanitizeValues(values, PARTIES);

  const result = analyzeExtraction(toRaw(clean, imageQuality));

  const sheetFindings = result.findings.filter(
    (finding) => finding.code !== 'D1'
  );

  const serverFindings = await runServerChecks(db, {
    pu,
    sheet: result.sheet,
    imageHash
  });

  const findings = sortFindings([
    ...sheetFindings,
    ...serverFindings
  ]);

  return {
    pu,
    sheet: result.sheet,
    findings
  };
}

async function checkForAgent(ctx, user, values) {
  const { findings } = await analyze(ctx, user, values);

  return {
    findings: decorate(findings, { forAgent: true }),
    canSubmit: !hasErrors(findings),
    needsNote: hasWarnings(findings)
  };
}

async function latestState(db, puId) {
  const result = await db.query(
    `SELECT id, version, status, review_reason, submitted_at, reviewed_at
     FROM submissions
     WHERE polling_unit_id = $1
     ORDER BY version DESC
     LIMIT 1`,
    [puId]
  );

  return result.rows[0] || null;
}

async function createSubmission(ctx, user, {
  values,
  image,
  note,
  attested,
  ip
}) {
  const { db, config } = ctx;

  if (attested !== true) {
    throw new HttpError(
      422,
      'attest_required',
      'Please confirm that you compared the numbers with the photo'
    );
  }

  let buffer;

  try {
    buffer = decodeBase64Image(
      image,
      config.maxImageMb * 1024 * 1024
    );
  } catch (error) {
    const code = error.message === 'image_too_large'
      ? 'image_too_large'
      : 'bad_image';

    throw new HttpError(
      code === 'image_too_large' ? 413 : 400,
      code,
      code === 'image_too_large'
        ? `The photo is larger than ${config.maxImageMb} MB`
        : 'The photo could not be read'
    );
  }

  const type = detectImageType(buffer);

  if (!type) {
    throw new HttpError(
      400,
      'bad_image',
      'Only JPEG, PNG or WebP photos are accepted'
    );
  }

  const hash = sha256(buffer);

  const current = await latestState(db, user.pollingUnitId);

  if (current && current.status === 'pending') {
    throw new HttpError(
      409,
      'already_pending',
      'A result for this polling unit is already waiting for review'
    );
  }

  if (current && current.status === 'approved') {
    throw new HttpError(
      409,
      'already_approved',
      'This polling unit already has an approved result'
    );
  }

  const { pu, sheet, findings } = await analyze(
    ctx,
    user,
    values,
    hash
  );

  if (hasErrors(findings)) {
    throw new HttpError(
      422,
      'checks_failed',
      'Some checks failed. Please correct the numbers.',
      { findings: decorate(findings, { forAgent: true }) }
    );
  }

  const cleanNote = typeof note === 'string' ? note.trim() : '';

  if (hasWarnings(findings) && cleanNote.length < 10) {
    throw new HttpError(
      422,
      'note_required',
      'There are warnings. Please write a short note (at least 10 letters) for the reviewer.',
      { findings: decorate(findings, { forAgent: true }) }
    );
  }

  if (cleanNote.length > 500) {
    throw new HttpError(400, 'bad_values', 'The note is too long');
  }

  if (!ctx.storage) {
    throw new HttpError(
      503,
      'storage_unavailable',
      'Persistent image storage is not configured'
    );
  }

  const fileName = crypto.randomUUID() + '.' + type.ext;

  await ctx.storage.upload(fileName, buffer, type.mime);

  try {
    return await transaction(db, async (client) => {
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM submissions
         WHERE polling_unit_id = $1`,
        [pu.id]
      );

      const version = Number(versionResult.rows[0].version);
      const counts = sheet.counts;

      const inserted = await client.query(
        `INSERT INTO submissions (
          polling_unit_id, version, status, agent_id, serial_no,
          registered, accredited, issued, unused, spoiled, rejected,
          valid_total, used_total, total_valid_row, image_file,
          image_hash, image_type, agent_note, sheet_json
        )
        VALUES (
          $1, $2, 'pending', $3, $4,
          $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18
        )
        RETURNING id`,
        [
          pu.id,
          version,
          user.id,
          sheet.header.serialNo,
          counts.registered,
          counts.accredited,
          counts.issued,
          counts.unused,
          counts.spoiled,
          counts.rejected,
          counts.validTotal,
          counts.usedTotal,
          sheet.totalValidRow,
          fileName,
          hash,
          type.mime,
          cleanNote || null,
          JSON.stringify(sheet)
        ]
      );

      const id = inserted.rows[0].id;

      for (const party of sheet.parties) {
        await client.query(
          `INSERT INTO party_votes
            (submission_id, party, votes, words)
           VALUES ($1, $2, $3, $4)`,
          [id, party.party, party.figures, party.words || null]
        );
      }

      for (const finding of findings) {
        await client.query(
          `INSERT INTO findings
            (submission_id, code, severity, details)
           VALUES ($1, $2, $3, $4)`,
          [
            id,
            finding.code,
            finding.severity,
            JSON.stringify(finding.details || {})
          ]
        );
      }

      await audit.record(client, {
        user,
        action: 'submission.create',
        entity: 'submission',
        entityId: id,
        detail: {
          version,
          warnings: findings.filter(
            (finding) => finding.severity === 'warning'
          ).length
        },
        ip
      });

      return {
        id,
        version,
        status: 'pending'
      };
    });
  } catch (error) {
    try {
      await ctx.storage.remove(fileName);
    } catch (storageError) {
      console.error('Could not remove failed submission image:', storageError.message);
    }

    if (
      /unique/i.test(String(error.message)) ||
      error.code === '23505'
    ) {
      throw new HttpError(
        409,
        'already_pending',
        'A result for this polling unit already exists'
      );
    }

    throw error;
  }
}

async function submissionDetail(db, id, { forAgent }) {
  const result = await db.query(
    `SELECT
       s.*,
       p.code AS pu_code,
       p.name AS pu_name,
       p.ward,
       p.lga,
       p.state,
       p.registered AS pu_registered,
       a.username AS agent_username,
       r.username AS reviewer_username
     FROM submissions s
     JOIN polling_units p ON p.id = s.polling_unit_id
     JOIN users a ON a.id = s.agent_id
     LEFT JOIN users r ON r.id = s.reviewer_id
     WHERE s.id = $1`,
    [id]
  );

  const submission = result.rows[0];

  if (!submission) return null;

  const votesResult = await db.query(
    `SELECT party, votes, words
     FROM party_votes
     WHERE submission_id = $1
     ORDER BY party`,
    [id]
  );

  const findingsResult = await db.query(
    `SELECT code, severity, details
     FROM findings
     WHERE submission_id = $1
     ORDER BY id`,
    [id]
  );

  const historyResult = await db.query(
    `SELECT id, version, status, review_reason, submitted_at, reviewed_at
     FROM submissions
     WHERE polling_unit_id = $1
     ORDER BY version DESC`,
    [submission.polling_unit_id]
  );

  const findings = findingsResult.rows.map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    details: typeof finding.details === 'string'
      ? JSON.parse(finding.details || '{}')
      : finding.details || {}
  }));

  const out = {
    id: submission.id,
    version: submission.version,
    status: submission.status,
    submittedAt: submission.submitted_at,
    reviewedAt: submission.reviewed_at,
    reviewReason: submission.review_reason,
    agentNote: submission.agent_note,
    serialNo: submission.serial_no,

    unit: {
      code: submission.pu_code,
      name: submission.pu_name,
      ward: submission.ward,
      lga: submission.lga,
      state: submission.state,
      registered: submission.pu_registered
    },

    counts: {
      registered: submission.registered,
      accredited: submission.accredited,
      issued: submission.issued,
      unused: submission.unused,
      spoiled: submission.spoiled,
      rejected: submission.rejected,
      validTotal: submission.valid_total,
      usedTotal: submission.used_total,
      totalValidRow: submission.total_valid_row
    },

    votes: votesResult.rows,
    findings: decorate(findings, { forAgent }),
    history: historyResult.rows
  };

  if (!forAgent) {
    out.agent = submission.agent_username;
    out.reviewer = submission.reviewer_username;
  }

  return { out, row: submission };
}

async function getForAgent(ctx, user, id) {
  const detail = await submissionDetail(ctx.db, id, {
    forAgent: true
  });

  if (
    !detail ||
    String(detail.row.polling_unit_id) !== String(user.pollingUnitId)
  ) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return detail.out;
}

async function getAdmin(ctx, id) {
  const detail = await submissionDetail(ctx.db, id, {
    forAgent: false
  });

  if (!detail) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return detail.out;
}

async function imageFor(ctx, id, {
  agentPuId = null,
  onlyApproved = false
} = {}) {
  const result = await ctx.db.query(
    `SELECT polling_unit_id, status, image_file, image_type
     FROM submissions
     WHERE id = $1`,
    [id]
  );

  const submission = result.rows[0];

  if (!submission) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  if (
    agentPuId !== null &&
    String(submission.polling_unit_id) !== String(agentPuId)
  ) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  if (onlyApproved && submission.status !== 'approved') {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  if (
    typeof submission.image_file !== 'string' ||
    !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(submission.image_file)
  ) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  if (ctx.storage) {
    try {
      const buffer = await ctx.storage.download(submission.image_file);
      return { buffer, mime: submission.image_type };
    } catch (error) {
      // Older submissions may still have their photos in local uploads/.
      console.warn('Supabase image lookup failed; checking local backup:', error.message);
    }
  }

  const file = path.join(ctx.config.uploadDir, submission.image_file);

  if (!fs.existsSync(file)) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  return {
    buffer: fs.readFileSync(file),
    mime: submission.image_type
  };
}

async function agentOverview(ctx, user) {
  const pu = await getPU(ctx.db, user.pollingUnitId);

  const result = await ctx.db.query(
    `SELECT id, version, status, review_reason,
            submitted_at, reviewed_at
     FROM submissions
     WHERE polling_unit_id = $1
     ORDER BY version DESC`,
    [pu.id]
  );

  const history = result.rows;
  const latest = history[0] || null;

  return {
    unit: {
      code: pu.code,
      name: pu.name,
      ward: pu.ward,
      lga: pu.lga,
      state: pu.state,
      registered: pu.registered
    },
    latest,
    history,
    canSubmit: !latest || latest.status === 'rejected'
  };
}

async function listForAdmin(ctx, {
  status = 'pending',
  page = 1,
  pageSize = 25
} = {}) {
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    throw new HttpError(400, 'bad_values', 'Unknown status');
  }

  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * size;

  const countResult = await ctx.db.query(
    'SELECT COUNT(*) AS n FROM submissions WHERE status = $1',
    [status]
  );

  const itemsResult = await ctx.db.query(
    `SELECT
       s.id, s.version, s.status, s.submitted_at,
       s.valid_total, s.accredited,
       p.code, p.name, p.ward, p.lga, p.state,
       (SELECT COUNT(*)
        FROM findings f
        WHERE f.submission_id = s.id
          AND f.severity = 'warning') AS warnings
     FROM submissions s
     JOIN polling_units p ON p.id = s.polling_unit_id
     WHERE s.status = $1
     ORDER BY s.submitted_at, s.id
     LIMIT $2 OFFSET $3`,
    [status, size, offset]
  );

  return {
    total: Number(countResult.rows[0].n),
    page: currentPage,
    pageSize: size,
    items: itemsResult.rows
  };
}

async function stats(ctx) {
  const [statusResult, unitsResult] = await Promise.all([
    ctx.db.query(
      `SELECT status, COUNT(*) AS n
       FROM submissions
       GROUP BY status`
    ),
    ctx.db.query(
      'SELECT COUNT(*) AS n FROM polling_units'
    )
  ]);

  const out = {
    pending: 0,
    approved: 0,
    rejected: 0,
    totalUnits: Number(unitsResult.rows[0].n)
  };

  for (const row of statusResult.rows) {
    out[row.status] = Number(row.n);
  }

  return out;
}

async function approve(ctx, admin, id, ip) {
  const { db } = ctx;

  return transaction(db, async (client) => {
    const result = await client.query(
      `SELECT * FROM submissions
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    const submission = result.rows[0];

    if (!submission) {
      throw new HttpError(404, 'not_found', 'Not found');
    }

    if (submission.status !== 'pending') {
      throw new HttpError(
        409,
        'not_pending',
        'This result has already been decided'
      );
    }

    const sheet = typeof submission.sheet_json === 'string'
      ? JSON.parse(submission.sheet_json)
      : submission.sheet_json;

    const validation = validateSheet(sheet);

    if (validation.findings.some((f) => f.severity === 'error')) {
      throw new HttpError(
        409,
        'recheck_failed',
        'The numbers fail the checks, so this cannot be approved. Please reject it.'
      );
    }

    const duplicate = await client.query(
      `SELECT p.code
       FROM submissions other
       JOIN polling_units p ON p.id = other.polling_unit_id
       WHERE other.status = 'approved'
         AND other.polling_unit_id <> $1
         AND (
           other.image_hash = $2
           OR ($3::text IS NOT NULL AND other.serial_no = $3)
         )
       LIMIT 1`,
      [
        submission.polling_unit_id,
        submission.image_hash,
        submission.serial_no
      ]
    );

    if (duplicate.rows.length > 0) {
      throw new HttpError(
        409,
        'duplicate_evidence',
        'The photo or serial number belongs to another approved polling unit. Please reject it.'
      );
    }

    await client.query(
      `UPDATE submissions
       SET status = 'approved',
           reviewer_id = $1,
           reviewed_at = NOW()::text
       WHERE id = $2`,
      [admin.id, id]
    );

    await audit.record(client, {
      user: admin,
      action: 'submission.approve',
      entity: 'submission',
      entityId: id,
      ip
    });

    return {
      id: Number(id),
      status: 'approved'
    };
  });
}

async function reject(ctx, admin, id, reason, ip) {
  const text = typeof reason === 'string' ? reason.trim() : '';

  if (text.length < 10) {
    throw new HttpError(
      422,
      'reason_required',
      'Please give a reason (at least 10 letters)'
    );
  }

  if (text.length > 500) {
    throw new HttpError(400, 'bad_values', 'The reason is too long');
  }

  const { db } = ctx;

  return transaction(db, async (client) => {
    const result = await client.query(
      `SELECT id, status
       FROM submissions
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    const submission = result.rows[0];

    if (!submission) {
      throw new HttpError(404, 'not_found', 'Not found');
    }

    if (submission.status !== 'pending') {
      throw new HttpError(
        409,
        'not_pending',
        'This result has already been decided'
      );
    }

    await client.query(
      `UPDATE submissions
       SET status = 'rejected',
           review_reason = $1,
           reviewer_id = $2,
           reviewed_at = NOW()::text
       WHERE id = $3`,
      [text, admin.id, id]
    );

    await audit.record(client, {
      user: admin,
      action: 'submission.reject',
      entity: 'submission',
      entityId: id,
      detail: text,
      ip
    });

    return {
      id: Number(id),
      status: 'rejected'
    };
  });
}

module.exports = {
  checkForAgent,
  createSubmission,
  getForAgent,
  getAdmin,
  imageFor,
  agentOverview,
  listForAdmin,
  stats,
  approve,
  reject,
  sheetToValues
};
