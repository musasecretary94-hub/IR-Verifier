const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sub = require('../src/services/submissions');
const results = require('../src/services/results');
const { authenticate } = require('../src/services/users');
const { resetResults, createMissingAgents } = require('../src/db/maintenance');
const { makeCtx, addAgent, adminUser, goodValues, pngDataUrl } = require('./helpers/setup');

function withResults() {
  const ctx = makeCtx();
  const admin = adminUser(ctx);
  const agents = ['KN-01-01-001', 'KN-01-01-002', 'LA-01-01-001'].map((c) => addAgent(ctx, c));
  agents.forEach((a) => {
    const r = sub.createSubmission(ctx, a, { values: goodValues(a), image: pngDataUrl(a.pu.code), attested: true, ip: 'x' });
    sub.approve(ctx, admin, r.id, 'x');
  });
  return { ctx, admin, agents };
}

test('reset-results: a dry run shows the numbers and deletes nothing', () => {
  const { ctx } = withResults();
  const r = resetResults(ctx.db, ctx.config.uploadDir, { confirm: false });
  assert.strictEqual(r.deleted, false);
  assert.strictEqual(r.submissions, 3);
  assert.strictEqual(r.votes, 24);
  assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 3);
  assert.strictEqual(fs.readdirSync(ctx.config.uploadDir).length, 3);
});

test('reset-results: removes every result and photo, keeps polling units, accounts and history', () => {
  const { ctx, agents } = withResults();
  fs.writeFileSync(path.join(ctx.config.uploadDir, '.gitkeep'), '');
  fs.writeFileSync(path.join(ctx.config.uploadDir, 'notes.txt'), 'not a photo');
  const usersBefore = ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const r = resetResults(ctx.db, ctx.config.uploadDir, { confirm: true });
  assert.strictEqual(r.deleted, true);
  assert.strictEqual(r.removedFiles, 3);
  ['submissions', 'party_votes', 'findings'].forEach((t) => assert.strictEqual(ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t));
  assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n, 72);
  assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, usersBefore);
  assert.deepStrictEqual(fs.readdirSync(ctx.config.uploadDir).sort(), ['.gitkeep', 'notes.txt']);
  const last = ctx.db.prepare('SELECT action FROM audit_log ORDER BY id DESC LIMIT 1').get();
  assert.strictEqual(last.action, 'results.cleared');
  assert.strictEqual(results.getArea(ctx.db, {}).coverage.approvedUnits, 0);
  assert.strictEqual(sub.agentOverview(ctx, agents[0]).canSubmit, true);
});

test('reset-results: after a reset the same agent can upload again from the start', () => {
  const { ctx, agents } = withResults();
  resetResults(ctx.db, ctx.config.uploadDir, { confirm: true });
  const a = agents[0];
  const r = sub.createSubmission(ctx, a, { values: goodValues(a), image: pngDataUrl(a.pu.code), attested: true, ip: 'x' });
  assert.strictEqual(r.version, 1);
  assert.strictEqual(r.status, 'pending');
});

test('reset-results: running it on an empty database is harmless', () => {
  const ctx = makeCtx();
  const r = resetResults(ctx.db, ctx.config.uploadDir, { confirm: true });
  assert.strictEqual(r.submissions, 0);
  assert.strictEqual(r.removedFiles, 0);
});

test('create-agents: one agent for every polling unit, existing agents are kept', () => {
  const ctx = makeCtx();
  const existing = addAgent(ctx, 'KN-01-01-001');
  const rows = createMissingAgents(ctx.db);
  assert.strictEqual(rows.length, 72);
  assert.strictEqual(rows.filter((r) => r.created).length, 71);
  assert.strictEqual(rows[0].created, false);
  assert.strictEqual(rows[0].username, existing.username);
  assert.strictEqual(ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'agent'").get().n, 72);
  assert.strictEqual(rows[1].username, 'agent-kn-01-01-002');
  assert.deepStrictEqual(rows.map((r) => r.code), ctx.db.prepare('SELECT code FROM polling_units ORDER BY id').all().map((r) => r.code), 'in registry order');
});

test('create-agents: random passwords are all different and each agent can log in', () => {
  const ctx = makeCtx();
  const rows = createMissingAgents(ctx.db);
  assert.strictEqual(new Set(rows.map((r) => r.password)).size, 72);
  [rows[0], rows[35], rows[71]].forEach((r) => {
    const u = authenticate(ctx.db, r.username, r.password);
    assert.ok(u && u.role === 'agent');
    assert.strictEqual(ctx.db.prepare('SELECT code FROM polling_units WHERE id = ?').get(u.pollingUnitId).code, r.code);
  });
});

test('create-agents: a shared demo password works, and a short one is refused without creating anything', () => {
  const ctx = makeCtx();
  const rows = createMissingAgents(ctx.db, { password: 'MyDemoPass123' });
  assert.ok(rows.every((r) => r.password === 'MyDemoPass123'));
  assert.ok(authenticate(ctx.db, 'agent-oy-02-03-004', 'MyDemoPass123'));
  const ctx2 = makeCtx();
  assert.throws(() => createMissingAgents(ctx2.db, { password: 'short' }));
  assert.strictEqual(ctx2.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'agent'").get().n, 0);
});

test('create-agents: running it twice creates nothing new the second time', () => {
  const ctx = makeCtx();
  createMissingAgents(ctx.db);
  const again = createMissingAgents(ctx.db);
  assert.strictEqual(again.filter((r) => r.created).length, 0);
  assert.strictEqual(ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'agent'").get().n, 72);
});
