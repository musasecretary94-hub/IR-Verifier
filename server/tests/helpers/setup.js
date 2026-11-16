// Shared helpers for the tests: a fresh in-memory database, a temporary upload folder, users and sample data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('../../src/config/env');
const { createContext } = require('../../src/app');
const { openDb } = require('../../src/db/connection');
const { seedRegistry, makeSheetNumbers, sheetToAgentValues } = require('../../src/db/demoData');
const { createUser } = require('../../src/services/users');
const { demoPng } = require('../../src/db/png');

const PASSWORD = 'correct-horse-battery';

function makeCtx(overrides = {}, configOverrides = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'irv-'));
  const config = load({ dbPath: ':memory:', uploadDir, tokenSecret: 'test-secret-test-secret-test-secret', demoMode: true, ...configOverrides });
  const db = openDb(':memory:');
  seedRegistry(db);
  const ctx = createContext(config, { db, ...overrides });
  createUser(db, { username: 'admin', password: PASSWORD, role: 'admin' });
  createUser(db, { username: 'admin2', password: PASSWORD, role: 'admin' });
  return ctx;
}

function addAgent(ctx, puCode) {
  const username = 'agent-' + puCode.toLowerCase();
  const id = createUser(ctx.db, { username, password: PASSWORD, role: 'agent', pollingUnitCode: puCode });
  const pu = ctx.db.prepare('SELECT * FROM polling_units WHERE code = ?').get(puCode);
  return { id, username, pollingUnitId: pu.id, pu: { ...pu } };
}

const adminUser = (ctx, name = 'admin') => {
  const u = ctx.db.prepare('SELECT id, username FROM users WHERE username = ?').get(name);
  return { id: u.id, username: u.username, role: 'admin' };
};

function goodValues(agent, opts) {
  return sheetToAgentValues(agent.pu, makeSheetNumbers(agent.pu), opts);
}

function pngDataUrl(seed) {
  return 'data:image/png;base64,' + demoPng(seed).toString('base64');
}

const clone = (o) => JSON.parse(JSON.stringify(o));

module.exports = { makeCtx, addAgent, adminUser, goodValues, pngDataUrl, clone, PASSWORD };
