// The whole workflow at service level: agent submits -> admin approves/rejects -> public results.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sub = require('../src/services/submissions');
const results = require('../src/services/results');
const { makeCtx, addAgent, adminUser, goodValues, pngDataUrl, clone } = require('./helpers/setup');
const { makeSheetNumbers } = require('../src/db/demoData');

function setup() {
  const ctx = makeCtx();
  const a1 = addAgent(ctx, 'KN-01-01-001');
  const a2 = addAgent(ctx, 'KN-01-01-002');
  const a3 = addAgent(ctx, 'LA-01-01-001');
  return { ctx, a1, a2, a3, admin: adminUser(ctx), admin2: adminUser(ctx, 'admin2') };
}
const submit = (ctx, agent, over = {}) => sub.createSubmission(ctx, agent, {
  values: goodValues(agent), image: pngDataUrl(agent.pu.code), note: '', attested: true, ip: '1.1.1.1', ...over,
});
const rejects = (fn, code, status) => assert.throws(fn, (e) => e.code === code && (status === undefined || e.status === status), 'expected ' + code);

// ---------- agent side ----------
test('a good sheet passes the checks and can be submitted', () => {
  const { ctx, a1 } = setup();
  const check = sub.checkForAgent(ctx, a1, goodValues(a1));
  assert.strictEqual(check.canSubmit, true);
  assert.strictEqual(check.needsNote, false);
  const r = submit(ctx, a1);
  assert.strictEqual(r.status, 'pending');
  assert.strictEqual(r.version, 1);
  assert.strictEqual(sub.agentOverview(ctx, a1).canSubmit, false);
});

test('the server re-checks: numbers that do not add up are refused with a message in English and Hausa', () => {
  const { ctx, a1 } = setup();
  const v = goodValues(a1);
  v.parties[0].figures += 10;
  v.parties[0].words = ''; // keep it a pure A1 problem
  const check = sub.checkForAgent(ctx, a1, v);
  assert.strictEqual(check.canSubmit, false);
  assert.ok(check.findings.some((f) => f.code === 'A1' && f.message.en && f.message.ha));
  assert.throws(() => submit(ctx, a1, { values: v }), (e) => e.code === 'checks_failed' && e.status === 422 && e.extra.findings.some((f) => f.code === 'A1'));
  assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0);
});

test('an incomplete form is refused (F1)', () => {
  const { ctx, a1 } = setup();
  const v = goodValues(a1);
  v.counts.rejected = '';
  v.parties[2].figures = null;
  v.header.serialNo = '';
  const f = sub.checkForAgent(ctx, a1, v).findings.find((x) => x.code === 'F1');
  assert.ok(f);
  assert.deepStrictEqual(f.details.missing.sort(), ['party:' + v.parties[2].party, 'rejected', 'serialNo'].sort());
});

test('values with dashes like -03- are cleaned, not refused', () => {
  const { ctx, a1 } = setup();
  const v = goodValues(a1);
  const s = v.counts.spoiled;
  v.counts.spoiled = `-${String(s).padStart(2, '0')}-`;
  assert.strictEqual(sub.checkForAgent(ctx, a1, v).canSubmit, true);
});

test('a warning is allowed only with a note from the agent', () => {
  const { ctx, a1 } = setup();
  const v = goodValues(a1);
  v.parties[0].words = 'nine hundred'; // words disagree with the figure -> B1 warning
  const check = sub.checkForAgent(ctx, a1, v);
  assert.strictEqual(check.canSubmit, true);
  assert.strictEqual(check.needsNote, true);
  rejects(() => submit(ctx, a1, { values: v }), 'note_required', 422);
  rejects(() => submit(ctx, a1, { values: v, note: 'short' }), 'note_required', 422);
  const r = submit(ctx, a1, { values: v, note: 'The words on the sheet look different from the figure.' });
  assert.strictEqual(r.status, 'pending');
  assert.ok(sub.getAdmin(ctx, r.id).findings.some((f) => f.code === 'B1'));
});

test('the agent must confirm they compared with the photo', () => {
  const { ctx, a1 } = setup();
  rejects(() => submit(ctx, a1, { attested: false }), 'attest_required', 422);
  rejects(() => submit(ctx, a1, { attested: 'yes' }), 'attest_required', 422);
});

test('a sheet for another polling unit is refused (C1)', () => {
  const { ctx, a1, a2 } = setup();
  const v = goodValues(a1);
  v.header.puCode = a2.pu.code;
  assert.throws(() => submit(ctx, a1, { values: v }), (e) => e.code === 'checks_failed' && e.extra.findings.some((f) => f.code === 'C1'));
});

test('registered voters that differ from the registry raise a warning (C4)', () => {
  const { ctx, a1 } = setup();
  const v = clone(goodValues(a1));
  const c = makeSheetNumbers(a1.pu).counts;
  v.counts.registered = c.registered + 5;
  v.counts.issued = c.issued + 5;
  v.counts.unused = c.unused + 5;
  const f = sub.checkForAgent(ctx, a1, v).findings;
  assert.ok(f.some((x) => x.code === 'C4' && x.severity === 'warning'));
});

test('unknown parties and extra junk are ignored; the party list comes from the server', () => {
  const { ctx, a1 } = setup();
  const v = goodValues(a1);
  v.parties.push({ party: 'EVIL', figures: 9999, words: '' });
  v.hack = '<script>';
  const r = submit(ctx, a1, { values: v });
  const parties = ctx.db.prepare('SELECT party FROM party_votes WHERE submission_id = ?').all(r.id).map((x) => x.party);
  assert.ok(!parties.includes('EVIL'));
  assert.strictEqual(parties.length, 8);
});

test('bad values are rejected cleanly', () => {
  const { ctx, a1 } = setup();
  rejects(() => sub.checkForAgent(ctx, a1, null), 'bad_values', 400);
  rejects(() => sub.checkForAgent(ctx, a1, 'text'), 'bad_values', 400);
  const v = goodValues(a1);
  v.counts.registered = 99999999;
  rejects(() => sub.checkForAgent(ctx, a1, v), 'bad_values', 400);
  const w = goodValues(a1);
  w.counts.accredited = { evil: true };
  rejects(() => sub.checkForAgent(ctx, a1, w), 'bad_values', 400);
});

test('only real JPEG, PNG or WebP photos are accepted; huge photos are refused', () => {
  const { ctx, a1 } = setup();
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>').toString('base64');
  rejects(() => submit(ctx, a1, { image: svg }), 'bad_image', 400);
  rejects(() => submit(ctx, a1, { image: 'hello' }), 'bad_image', 400);
  rejects(() => submit(ctx, a1, { image: undefined }), 'bad_image', 400);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(7 * 1024 * 1024)]);
  rejects(() => submit(ctx, a1, { image: 'data:image/jpeg;base64,' + big.toString('base64') }), 'image_too_large', 413);
  assert.strictEqual(fs.readdirSync(ctx.config.uploadDir).length, 0, 'no file may be left behind');
});

test('only one result can wait for review, and an approved unit is locked', () => {
  const { ctx, a1, admin } = setup();
  const r = submit(ctx, a1);
  rejects(() => submit(ctx, a1, { image: pngDataUrl('other') }), 'already_pending', 409);
  sub.approve(ctx, admin, r.id, '1.1.1.1');
  rejects(() => submit(ctx, a1, { image: pngDataUrl('another') }), 'already_approved', 409);
});

test('the same photo or serial number cannot be used for another polling unit (C3)', () => {
  const { ctx, a1, a2 } = setup();
  submit(ctx, a1);
  // same photo, different unit
  try {
    submit(ctx, a2, { image: pngDataUrl(a1.pu.code) });
    assert.fail('should have been refused');
  } catch (e) {
    assert.strictEqual(e.code, 'checks_failed');
    const c3 = e.extra.findings.find((f) => f.code === 'C3');
    assert.ok(c3 && c3.details.kind === 'image');
    assert.ok(!JSON.stringify(e.extra).includes(a1.pu.code), 'the other unit must not leak to the agent');
  }
  // same serial number, different unit
  const v = goodValues(a2);
  v.header.serialNo = makeSheetNumbers(a1.pu).serialNo;
  assert.throws(() => submit(ctx, a2, { values: v, image: pngDataUrl('fresh') }), (e) => e.extra.findings.some((f) => f.code === 'C3'));
  assert.strictEqual(sub.agentOverview(ctx, a2).latest, null);
});

test('an agent can only see their own polling unit', () => {
  const { ctx, a1, a2 } = setup();
  const r = submit(ctx, a1);
  assert.ok(sub.getForAgent(ctx, a1, r.id));
  rejects(() => sub.getForAgent(ctx, a2, r.id), 'not_found', 404);
  rejects(() => sub.imageFor(ctx, r.id, { agentPuId: a2.pollingUnitId }), 'not_found', 404);
  assert.ok(sub.imageFor(ctx, r.id, { agentPuId: a1.pollingUnitId }).buffer.length > 50);
});

// ---------- admin side ----------
test('admin sees the photo, the numbers, the findings and the history', () => {
  const { ctx, a1 } = setup();
  const r = submit(ctx, a1);
  const d = sub.getAdmin(ctx, r.id);
  assert.strictEqual(d.status, 'pending');
  assert.strictEqual(d.unit.code, 'KN-01-01-001');
  assert.strictEqual(d.votes.length, 8);
  assert.strictEqual(d.agent, a1.username);
  assert.strictEqual(d.history.length, 1);
  assert.ok(sub.listForAdmin(ctx, { status: 'pending' }).items.some((i) => i.id === r.id));
  assert.deepStrictEqual(sub.stats(ctx).pending, 1);
});

test('approving locks the result; a second decision is refused', () => {
  const { ctx, a1, admin, admin2 } = setup();
  const r = submit(ctx, a1);
  assert.strictEqual(sub.approve(ctx, admin, r.id, 'ip').status, 'approved');
  rejects(() => sub.approve(ctx, admin2, r.id, 'ip'), 'not_pending', 409);
  rejects(() => sub.reject(ctx, admin2, r.id, 'I changed my mind about this.', 'ip'), 'not_pending', 409);
  const d = sub.getAdmin(ctx, r.id);
  assert.strictEqual(d.status, 'approved');
  assert.strictEqual(d.reviewer, 'admin');
});

test('rejecting needs a reason; the agent sees it and can submit again (version 2)', () => {
  const { ctx, a1, admin } = setup();
  const r = submit(ctx, a1);
  rejects(() => sub.reject(ctx, admin, r.id, '', 'ip'), 'reason_required', 422);
  rejects(() => sub.reject(ctx, admin, r.id, 'bad', 'ip'), 'reason_required', 422);
  sub.reject(ctx, admin, r.id, 'The photo is too blurry to read the party rows.', 'ip');
  const o = sub.agentOverview(ctx, a1);
  assert.strictEqual(o.latest.status, 'rejected');
  assert.ok(o.latest.review_reason.includes('blurry'));
  assert.strictEqual(o.canSubmit, true);
  const r2 = submit(ctx, a1, { image: pngDataUrl('clearer photo') });
  assert.strictEqual(r2.version, 2);
  assert.strictEqual(sub.getAdmin(ctx, r2.id).history.length, 2);
  assert.ok(sub.checkForAgent(ctx, a1, goodValues(a1)).findings.some((f) => f.code === 'C2'));
});

test('the admin cannot change numbers: the service has no edit function', () => {
  const names = Object.keys(sub);
  assert.ok(!names.some((n) => /edit|update|change|set|patch/i.test(n)), names.join(', '));
});

test('approval re-checks the numbers (defence in depth)', () => {
  const { ctx, a1, admin } = setup();
  const s = makeSheetNumbers(a1.pu);
  const bad = { header: { puCode: a1.pu.code, serialNo: s.serialNo }, counts: { ...s.counts, validTotal: s.counts.validTotal + 50 }, parties: s.parties, totalValidRow: s.totalValidRow };
  const r = ctx.db.prepare(`INSERT INTO submissions (polling_unit_id, version, status, agent_id, serial_no, image_file, image_hash, image_type, sheet_json)
    VALUES (?, 1, 'pending', ?, ?, '00000000-0000-0000-0000-000000000000.png', 'h', 'image/png', ?)`).run(a1.pollingUnitId, a1.id, s.serialNo, JSON.stringify(bad));
  rejects(() => sub.approve(ctx, admin, Number(r.lastInsertRowid), 'ip'), 'recheck_failed', 409);
});

// ---------- the database protects itself ----------
test('the database refuses to change submitted numbers, decisions, votes and the audit log', () => {
  const { ctx, a1, admin } = setup();
  const r = submit(ctx, a1);
  const { db } = ctx;
  assert.throws(() => db.prepare('UPDATE submissions SET valid_total = 1 WHERE id = ?').run(r.id), /cannot be changed/);
  assert.throws(() => db.prepare('UPDATE submissions SET image_hash = ? WHERE id = ?').run('x', r.id), /cannot be changed/);
  assert.throws(() => db.prepare('UPDATE party_votes SET votes = 1 WHERE submission_id = ?').run(r.id), /cannot be changed/);
  sub.approve(ctx, admin, r.id, 'ip');
  assert.throws(() => db.prepare("UPDATE submissions SET status = 'rejected' WHERE id = ?").run(r.id), /final/);
  assert.throws(() => db.prepare("UPDATE audit_log SET action = 'x'").run(), /cannot be changed/);
  assert.throws(() => db.prepare('DELETE FROM audit_log').run(), /cannot be changed/);
  assert.throws(() => db.prepare("INSERT INTO submissions (polling_unit_id, version, status, agent_id, image_file, image_hash, image_type, sheet_json) VALUES (?, 5, 'approved', ?, 'f', 'h2', 'image/png', '{}')").run(a1.pollingUnitId, a1.id), /UNIQUE/);
});

test('every action is written to the audit log', () => {
  const { ctx, a1, admin } = setup();
  const r = submit(ctx, a1);
  sub.approve(ctx, admin, r.id, '2.2.2.2');
  const actions = ctx.db.prepare('SELECT action, username, ip FROM audit_log ORDER BY id').all().map((x) => x.action);
  assert.deepStrictEqual(actions, ['submission.create', 'submission.approve']);
});

// ---------- public results ----------
test('public totals add up from polling unit to ward, LGA, state and country (approved only)', () => {
  const { ctx, a1, a2, a3, admin } = setup();
  const r1 = submit(ctx, a1);
  const r2 = submit(ctx, a2);
  const r3 = submit(ctx, a3);
  assert.strictEqual(results.getArea(ctx.db, {}).coverage.approvedUnits, 0, 'nothing is public before approval');
  sub.approve(ctx, admin, r1.id, 'ip');
  sub.approve(ctx, admin, r2.id, 'ip');
  sub.reject(ctx, admin, r3.id, 'Rejected for the test of the totals.', 'ip');

  const n1 = makeSheetNumbers(a1.pu);
  const n2 = makeSheetNumbers(a2.pu);
  const expectValid = n1.counts.validTotal + n2.counts.validTotal;
  const expectPA = n1.parties[0].figures + n2.parties[0].figures;

  const ward = results.getArea(ctx.db, { state: 'Kano', lga: 'Kano LGA 01', ward: 'Kano Ward 01' });
  assert.strictEqual(ward.level, 'ward');
  assert.deepStrictEqual(ward.coverage, { units: 4, approvedUnits: 2 });
  assert.strictEqual(ward.totals.validTotal, expectValid);
  assert.strictEqual(ward.parties[0].votes, expectPA);
  assert.strictEqual(ward.childLevel, 'unit');
  assert.strictEqual(ward.children.length, 4);
  assert.strictEqual(ward.children.filter((c) => c.approved).length, 2);

  const lga = results.getArea(ctx.db, { state: 'Kano', lga: 'Kano LGA 01' });
  assert.strictEqual(lga.level, 'lga');
  assert.strictEqual(lga.totals.validTotal, expectValid);
  assert.strictEqual(lga.coverage.units, 12);
  assert.strictEqual(lga.childLevel, 'ward');
  assert.strictEqual(lga.children.length, 3);

  const state = results.getArea(ctx.db, { state: 'Kano' });
  assert.strictEqual(state.totals.validTotal, expectValid);
  assert.strictEqual(state.childLevel, 'lga');

  const country = results.getArea(ctx.db, {});
  assert.strictEqual(country.level, 'country');
  assert.strictEqual(country.coverage.units, 72);
  assert.strictEqual(country.coverage.approvedUnits, 2);
  assert.strictEqual(country.totals.validTotal, expectValid, 'the rejected Lagos result must not count');
  assert.strictEqual(country.childLevel, 'state');
  assert.deepStrictEqual(country.children.map((c) => c.name), ['Kano', 'Lagos', 'Oyo']);
  assert.strictEqual(country.parties.reduce((a, p) => a + p.votes, 0), expectValid, 'party votes add up to total valid votes');
  assert.strictEqual(country.parties.length, 8);
});

test('a bad area gives a clean error', () => {
  const { ctx } = setup();
  rejects(() => results.getArea(ctx.db, { lga: 'Kano LGA 01' }), 'bad_values', 400);
  rejects(() => results.getArea(ctx.db, { state: 'Kano', ward: 'x' }), 'bad_values', 400);
  rejects(() => results.getArea(ctx.db, { state: 'Atlantis' }), 'not_found', 404);
  rejects(() => results.getUnit(ctx.db, 'nope'), 'not_found', 404);
  // SQL-looking input is just treated as a name that does not exist
  rejects(() => results.getArea(ctx.db, { state: "Kano' OR '1'='1" }), 'not_found', 404);
});

test('a polling unit page shows the approved result only', () => {
  const { ctx, a1, admin } = setup();
  assert.strictEqual(results.getUnit(ctx.db, a1.pu.code).approved, false);
  const r = submit(ctx, a1);
  assert.strictEqual(results.getUnit(ctx.db, a1.pu.code).approved, false, 'pending is not public');
  sub.approve(ctx, admin, r.id, 'ip');
  const u = results.getUnit(ctx.db, a1.pu.code);
  assert.strictEqual(u.approved, true);
  assert.strictEqual(u.counts.validTotal, makeSheetNumbers(a1.pu).counts.validTotal);
  assert.strictEqual(u.parties.length, 8);
  assert.ok(sub.imageFor(ctx, u.submissionId, { onlyApproved: true }).buffer.length > 50);
});

test('a photo is never served from a path outside the upload folder', () => {
  const { ctx, a1 } = setup();
  const r = submit(ctx, a1);
  // pretend a bug stored a dangerous file name: it must still be refused
  ctx.db.exec('DROP TRIGGER submissions_values_locked');
  ctx.db.prepare('UPDATE submissions SET image_file = ? WHERE id = ?').run('../../../etc/passwd', r.id);
  rejects(() => sub.imageFor(ctx, r.id), 'not_found', 404);
  assert.ok(fs.existsSync(path.join(ctx.config.uploadDir)));
});
