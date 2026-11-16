// The heart of the workflow:
//   agent checks and submits  ->  admin approves or rejects (cannot edit)  ->  approved results go public.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { HttpError } = require('../middleware/errors');
const { transaction, plain, plainAll } = require('../db/connection');
const { PARTIES } = require('../config/elections');
const { analyzeExtraction } = require('./pipeline');
const { validateSheet } = require('./validation');
const { sanitizeValues, toRaw, sheetToValues } = require('./values');
const { runServerChecks, sortFindings } = require('./serverChecks');
const { decorate } = require('./explain');
const { detectImageType, decodeBase64Image, sha256 } = require('../security/images');
const audit = require('./audit');

const hasErrors = (f) => f.some((x) => x.severity === 'error');
const hasWarnings = (f) => f.some((x) => x.severity === 'warning');

function getPU(db, id) {
  const pu = db.prepare('SELECT * FROM polling_units WHERE id = ?').get(id);
  if (!pu) throw new HttpError(404, 'not_found', 'Polling unit not found');
  return plain(pu);
}

// Runs the sheet checks + the database checks on what an agent typed.
function analyze(ctx, user, values, imageHash = null, imageQuality = null) {
  const pu = getPU(ctx.db, user.pollingUnitId);
  const clean = sanitizeValues(values, PARTIES);
  const result = analyzeExtraction(toRaw(clean, imageQuality));
  // D1 ("unreadable") is replaced by F1 ("form incomplete") for typed forms
  const sheetFindings = result.findings.filter((f) => f.code !== 'D1');
  const findings = sortFindings([...sheetFindings, ...runServerChecks(ctx.db, { pu, sheet: result.sheet, imageHash })]);
  return { pu, sheet: result.sheet, findings };
}

function checkForAgent(ctx, user, values) {
  const { findings } = analyze(ctx, user, values);
  return {
    findings: decorate(findings, { forAgent: true }),
    canSubmit: !hasErrors(findings),
    needsNote: hasWarnings(findings),
  };
}

function latestState(db, puId) {
  return db.prepare('SELECT id, version, status, review_reason, submitted_at, reviewed_at FROM submissions WHERE polling_unit_id = ? ORDER BY version DESC LIMIT 1').get(puId);
}

function createSubmission(ctx, user, { values, image, note, attested, ip }) {
  const { db, config } = ctx;
  if (attested !== true) throw new HttpError(422, 'attest_required', 'Please confirm that you compared the numbers with the photo');

  let buffer;
  try {
    buffer = decodeBase64Image(image, config.maxImageMb * 1024 * 1024);
  } catch (e) {
    const code = e.message === 'image_too_large' ? 'image_too_large' : 'bad_image';
    throw new HttpError(code === 'image_too_large' ? 413 : 400, code, code === 'image_too_large' ? `The photo is larger than ${config.maxImageMb} MB` : 'The photo could not be read');
  }
  const type = detectImageType(buffer);
  if (!type) throw new HttpError(400, 'bad_image', 'Only JPEG, PNG or WebP photos are accepted');
  const hash = sha256(buffer);

  const current = latestState(db, user.pollingUnitId);
  if (current && current.status === 'pending') throw new HttpError(409, 'already_pending', 'A result for this polling unit is already waiting for review');
  if (current && current.status === 'approved') throw new HttpError(409, 'already_approved', 'This polling unit already has an approved result');

  const { pu, sheet, findings } = analyze(ctx, user, values, hash);
  if (hasErrors(findings)) {
    throw new HttpError(422, 'checks_failed', 'Some checks failed. Please correct the numbers.', { findings: decorate(findings, { forAgent: true }) });
  }
  const cleanNote = typeof note === 'string' ? note.trim() : '';
  if (hasWarnings(findings) && cleanNote.length < 10) {
    throw new HttpError(422, 'note_required', 'There are warnings. Please write a short note (at least 10 letters) for the reviewer.', { findings: decorate(findings, { forAgent: true }) });
  }
  if (cleanNote.length > 500) throw new HttpError(400, 'bad_values', 'The note is too long');

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const fileName = crypto.randomUUID() + '.' + type.ext;
  fs.writeFileSync(path.join(config.uploadDir, fileName), buffer, { flag: 'wx' });

  try {
    return transaction(db, () => {
      const version = db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM submissions WHERE polling_unit_id = ?').get(pu.id).v;
      const c = sheet.counts;
      const r = db.prepare(`INSERT INTO submissions
        (polling_unit_id, version, status, agent_id, serial_no, registered, accredited, issued, unused, spoiled, rejected,
         valid_total, used_total, total_valid_row, image_file, image_hash, image_type, agent_note, sheet_json)
        VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        pu.id, version, user.id, sheet.header.serialNo, c.registered, c.accredited, c.issued, c.unused, c.spoiled, c.rejected,
        c.validTotal, c.usedTotal, sheet.totalValidRow, fileName, hash, type.mime, cleanNote || null, JSON.stringify(sheet));
      const id = Number(r.lastInsertRowid);
      const addVote = db.prepare('INSERT INTO party_votes (submission_id, party, votes, words) VALUES (?, ?, ?, ?)');
      sheet.parties.forEach((p) => addVote.run(id, p.party, p.figures, p.words || null));
      const addFinding = db.prepare('INSERT INTO findings (submission_id, code, severity, details) VALUES (?, ?, ?, ?)');
      findings.forEach((f) => addFinding.run(id, f.code, f.severity, JSON.stringify(f.details || {})));
      audit.record(db, { user, action: 'submission.create', entity: 'submission', entityId: id, detail: { version, warnings: findings.filter((f) => f.severity === 'warning').length }, ip });
      return { id, version, status: 'pending' };
    });
  } catch (err) {
    fs.rmSync(path.join(config.uploadDir, fileName), { force: true });
    if (/UNIQUE/i.test(String(err.message))) throw new HttpError(409, 'already_pending', 'A result for this polling unit already exists');
    throw err;
  }
}

function submissionDetail(db, id, { forAgent }) {
  const s = db.prepare(`SELECT s.*, p.code AS pu_code, p.name AS pu_name, p.ward, p.lga, p.state, p.registered AS pu_registered,
      a.username AS agent_username, r.username AS reviewer_username
    FROM submissions s JOIN polling_units p ON p.id = s.polling_unit_id
    JOIN users a ON a.id = s.agent_id LEFT JOIN users r ON r.id = s.reviewer_id WHERE s.id = ?`).get(id);
  if (!s) return null;
  const votes = plainAll(db.prepare('SELECT party, votes, words FROM party_votes WHERE submission_id = ? ORDER BY party').all(id));
  const findings = plainAll(db.prepare('SELECT code, severity, details FROM findings WHERE submission_id = ? ORDER BY id').all(id))
    .map((f) => ({ code: f.code, severity: f.severity, details: JSON.parse(f.details || '{}') }));
  const history = plainAll(db.prepare('SELECT id, version, status, review_reason, submitted_at, reviewed_at FROM submissions WHERE polling_unit_id = ? ORDER BY version DESC').all(s.polling_unit_id));
  const out = {
    id: s.id, version: s.version, status: s.status, submittedAt: s.submitted_at, reviewedAt: s.reviewed_at,
    reviewReason: s.review_reason, agentNote: s.agent_note, serialNo: s.serial_no,
    unit: { code: s.pu_code, name: s.pu_name, ward: s.ward, lga: s.lga, state: s.state, registered: s.pu_registered },
    counts: {
      registered: s.registered, accredited: s.accredited, issued: s.issued, unused: s.unused, spoiled: s.spoiled,
      rejected: s.rejected, validTotal: s.valid_total, usedTotal: s.used_total, totalValidRow: s.total_valid_row,
    },
    votes,
    findings: decorate(findings, { forAgent }),
    history,
  };
  if (!forAgent) { out.agent = s.agent_username; out.reviewer = s.reviewer_username; }
  return { out, row: s };
}

function getForAgent(ctx, user, id) {
  const d = submissionDetail(ctx.db, id, { forAgent: true });
  if (!d || d.row.polling_unit_id !== user.pollingUnitId) throw new HttpError(404, 'not_found', 'Not found');
  return d.out;
}

function getAdmin(ctx, id) {
  const d = submissionDetail(ctx.db, id, { forAgent: false });
  if (!d) throw new HttpError(404, 'not_found', 'Not found');
  return d.out;
}

function imageFor(ctx, id, { agentPuId = null, onlyApproved = false } = {}) {
  const s = ctx.db.prepare('SELECT polling_unit_id, status, image_file, image_type FROM submissions WHERE id = ?').get(id);
  if (!s) throw new HttpError(404, 'not_found', 'Not found');
  if (agentPuId !== null && s.polling_unit_id !== agentPuId) throw new HttpError(404, 'not_found', 'Not found');
  if (onlyApproved && s.status !== 'approved') throw new HttpError(404, 'not_found', 'Not found');
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(s.image_file)) throw new HttpError(404, 'not_found', 'Not found');
  const file = path.join(ctx.config.uploadDir, s.image_file);
  if (!fs.existsSync(file)) throw new HttpError(404, 'not_found', 'Not found');
  return { buffer: fs.readFileSync(file), mime: s.image_type };
}

function agentOverview(ctx, user) {
  const pu = getPU(ctx.db, user.pollingUnitId);
  const history = plainAll(ctx.db.prepare('SELECT id, version, status, review_reason, submitted_at, reviewed_at FROM submissions WHERE polling_unit_id = ? ORDER BY version DESC').all(pu.id));
  const latest = history[0] || null;
  return {
    unit: { code: pu.code, name: pu.name, ward: pu.ward, lga: pu.lga, state: pu.state, registered: pu.registered },
    latest,
    history,
    canSubmit: !latest || latest.status === 'rejected',
  };
}

function listForAdmin(ctx, { status = 'pending', page = 1, pageSize = 25 }) {
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'bad_values', 'Unknown status');
  const size = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const total = ctx.db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE status = ?').get(status).n;
  const items = plainAll(ctx.db.prepare(`SELECT s.id, s.version, s.status, s.submitted_at, s.valid_total, s.accredited, p.code, p.name, p.ward, p.lga, p.state,
      (SELECT COUNT(*) FROM findings f WHERE f.submission_id = s.id AND f.severity = 'warning') AS warnings
    FROM submissions s JOIN polling_units p ON p.id = s.polling_unit_id
    WHERE s.status = ? ORDER BY s.submitted_at, s.id LIMIT ? OFFSET ?`).all(status, size, offset));
  return { total, page: Math.floor(offset / size) + 1, pageSize: size, items };
}

function stats(ctx) {
  const rows = plainAll(ctx.db.prepare('SELECT status, COUNT(*) AS n FROM submissions GROUP BY status').all());
  const out = { pending: 0, approved: 0, rejected: 0, totalUnits: ctx.db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n };
  rows.forEach((r) => { out[r.status] = r.n; });
  return out;
}

// The admin can only approve or reject. There is NO function that edits values.
function approve(ctx, admin, id, ip) {
  const { db } = ctx;
  return transaction(db, () => {
    const s = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id);
    if (!s) throw new HttpError(404, 'not_found', 'Not found');
    if (s.status !== 'pending') throw new HttpError(409, 'not_pending', 'This result has already been decided');

    // Defence in depth: check again, so nothing wrong can slip through
    const sheet = JSON.parse(s.sheet_json);
    if (validateSheet(sheet).findings.some((f) => f.severity === 'error')) {
      throw new HttpError(409, 'recheck_failed', 'The numbers fail the checks, so this cannot be approved. Please reject it.');
    }
    const dup = db.prepare(`SELECT p.code FROM submissions o JOIN polling_units p ON p.id = o.polling_unit_id
      WHERE o.status = 'approved' AND o.polling_unit_id != ? AND (o.image_hash = ? OR (? IS NOT NULL AND o.serial_no = ?)) LIMIT 1`)
      .get(s.polling_unit_id, s.image_hash, s.serial_no, s.serial_no);
    if (dup) throw new HttpError(409, 'duplicate_evidence', 'The photo or serial number belongs to another approved polling unit. Please reject it.');

    db.prepare("UPDATE submissions SET status = 'approved', reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?").run(admin.id, id);
    audit.record(db, { user: admin, action: 'submission.approve', entity: 'submission', entityId: id, ip });
    return { id, status: 'approved' };
  });
}

function reject(ctx, admin, id, reason, ip) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 10) throw new HttpError(422, 'reason_required', 'Please give a reason (at least 10 letters)');
  if (text.length > 500) throw new HttpError(400, 'bad_values', 'The reason is too long');
  const { db } = ctx;
  return transaction(db, () => {
    const s = db.prepare('SELECT id, status FROM submissions WHERE id = ?').get(id);
    if (!s) throw new HttpError(404, 'not_found', 'Not found');
    if (s.status !== 'pending') throw new HttpError(409, 'not_pending', 'This result has already been decided');
    db.prepare("UPDATE submissions SET status = 'rejected', review_reason = ?, reviewer_id = ?, reviewed_at = datetime('now') WHERE id = ?").run(text, admin.id, id);
    audit.record(db, { user: admin, action: 'submission.reject', entity: 'submission', entityId: id, detail: text, ip });
    return { id, status: 'rejected' };
  });
}

module.exports = {
  checkForAgent, createSubmission, getForAgent, getAdmin, imageFor, agentOverview,
  listForAdmin, stats, approve, reject, sheetToValues,
};
