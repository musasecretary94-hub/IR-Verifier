// The real web server: logins, roles, uploads, limits. Needs "express" installed (npm install).
// If express is missing, these tests are skipped (the rest still run).
const test = require('node:test');
const assert = require('node:assert');
const { makeCtx, addAgent, goodValues, pngDataUrl, PASSWORD } = require('./helpers/setup');
const { createLimiter } = require('../src/security/rateLimit');
const sample = require('../data/sample-extraction.json');

let hasExpress = true;
try { require.resolve('express'); } catch (_) { hasExpress = false; }
const t = (name, fn) => test(name, { skip: !hasExpress && 'express is not installed' }, fn);

async function start(overrides = {}, configOverrides = {}) {
  const { createApp } = require('../src/app');
  const ctx = makeCtx(overrides, configOverrides);
  const app = createApp(ctx);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  server.unref(); // a failing test must never keep the process open
  const closeAll = () => { if (server.closeAllConnections) server.closeAllConnections(); server.close(); };
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(method, path, { token, body, headers = {}, raw } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    try { json = JSON.parse(buf.toString('utf8')); } catch (_) { /* not json */ }
    return { status: res.status, json, buf, headers: res.headers };
  }
  const login = async (username) => (await call('POST', '/api/auth/login', { body: { username, password: PASSWORD } })).json.token;
  return { ctx, call, login, close: closeAll };
}

t('health, config and security headers', async () => {
  const s = await start();
  const h = await s.call('GET', '/api/health');
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(h.headers.get('x-frame-options'), 'DENY');
  const c = await s.call('GET', '/api/public/config');
  assert.strictEqual(c.json.demoMode, true);
  assert.strictEqual(c.json.parties.length, 8);
  assert.strictEqual(c.json.aiAvailable, false);
  const nf = await s.call('GET', '/api/nothing-here');
  assert.strictEqual(nf.status, 404);
  assert.strictEqual(nf.json.error.code, 'not_found');
  s.close();
});

t('login: right password works, wrong ones do not say which part was wrong', async () => {
  const s = await start();
  addAgent(s.ctx, 'KN-01-01-001');
  const ok = await s.call('POST', '/api/auth/login', { body: { username: 'admin', password: PASSWORD } });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.json.token && ok.json.user.role === 'admin');
  assert.ok(!JSON.stringify(ok.json).includes('hash'));
  const wrongPw = await s.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong-password-123' } });
  const noUser = await s.call('POST', '/api/auth/login', { body: { username: 'nobody', password: 'wrong-password-123' } });
  assert.strictEqual(wrongPw.status, 401);
  assert.deepStrictEqual(wrongPw.json, noUser.json);
  const junk = await s.call('POST', '/api/auth/login', { body: { username: { $ne: 1 }, password: [1] } });
  assert.strictEqual(junk.status, 401);
  const me = await s.call('GET', '/api/auth/me', { token: ok.json.token });
  assert.strictEqual(me.json.user.username, 'admin');
  s.close();
});

t('login: too many wrong attempts are blocked (429)', async () => {
  const limiters = { login: createLimiter({ max: 3, windowMs: 60000 }), api: createLimiter({ max: 1000, windowMs: 60000 }), extract: createLimiter({ max: 5, windowMs: 60000 }) };
  const s = await start({ limiters });
  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await s.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'wrong-password-123' } })).status, 401);
  }
  const blocked = await s.call('POST', '/api/auth/login', { body: { username: 'admin', password: PASSWORD } });
  assert.strictEqual(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  s.close();
});

t('the whole server slows down a flood of requests (429)', async () => {
  const limiters = { login: createLimiter({ max: 8, windowMs: 60000 }), api: createLimiter({ max: 5, windowMs: 60000 }), extract: createLimiter({ max: 5, windowMs: 60000 }) };
  const s = await start({ limiters });
  let blocked = 0;
  for (let i = 0; i < 8; i++) if ((await s.call('GET', '/api/health')).status === 429) blocked++;
  assert.ok(blocked >= 3);
  s.close();
});

t('roles: nobody gets in without a login, and agents and admins stay in their own area', async () => {
  const s = await start();
  addAgent(s.ctx, 'KN-01-01-001');
  const agent = await s.login('agent-kn-01-01-001');
  const admin = await s.login('admin');
  assert.strictEqual((await s.call('GET', '/api/agent/unit')).status, 401);
  assert.strictEqual((await s.call('GET', '/api/admin/stats')).status, 401);
  assert.strictEqual((await s.call('GET', '/api/admin/stats', { token: agent })).status, 403);
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: admin })).status, 403);
  assert.strictEqual((await s.call('GET', '/api/admin/stats', { token: admin })).status, 200);
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: agent })).status, 200);
  const forged = agent.split('.')[0] + '.' + 'A'.repeat(43);
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: forged })).status, 401);
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: 'garbage' })).status, 401);
  s.close();
});

t('a switched-off account stops working at once, even with a valid token', async () => {
  const s = await start();
  addAgent(s.ctx, 'KN-01-01-001');
  const agent = await s.login('agent-kn-01-01-001');
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: agent })).status, 200);
  s.ctx.db.prepare("UPDATE users SET active = 0 WHERE username = 'agent-kn-01-01-001'").run();
  assert.strictEqual((await s.call('GET', '/api/agent/unit', { token: agent })).status, 401);
  s.close();
});

t('FULL FLOW: agent submits -> admin reviews -> admin approves -> everyone can see it', async () => {
  const s = await start();
  const a1 = addAgent(s.ctx, 'KN-01-01-001');
  const a2 = addAgent(s.ctx, 'KN-01-01-002');
  const t1 = await s.login(a1.username);
  const t2 = await s.login(a2.username);
  const admin = await s.login('admin');

  const unit = await s.call('GET', '/api/agent/unit', { token: t1 });
  assert.strictEqual(unit.json.unit.code, 'KN-01-01-001');
  assert.strictEqual(unit.json.canSubmit, true);

  const values = goodValues(a1);
  const check = await s.call('POST', '/api/agent/check', { token: t1, body: { values } });
  assert.strictEqual(check.json.canSubmit, true);

  const image = pngDataUrl('kn-01-01-001');
  const created = await s.call('POST', '/api/agent/submissions', { token: t1, body: { values, image, note: '', attested: true } });
  assert.strictEqual(created.status, 201);
  const id = created.json.id;

  // nothing is public yet
  assert.strictEqual((await s.call('GET', '/api/public/units/KN-01-01-001')).json.approved, false);
  assert.strictEqual((await s.call('GET', '/api/public/units/KN-01-01-001/image')).status, 404);

  // another agent cannot read this submission or its photo
  assert.strictEqual((await s.call('GET', `/api/agent/submissions/${id}`, { token: t2 })).status, 404);
  assert.strictEqual((await s.call('GET', `/api/agent/submissions/${id}/image`, { token: t2 })).status, 404);

  // admin reviews
  const list = await s.call('GET', '/api/admin/submissions?status=pending', { token: admin });
  assert.strictEqual(list.json.total, 1);
  const detail = await s.call('GET', `/api/admin/submissions/${id}`, { token: admin });
  assert.strictEqual(detail.json.votes.length, 8);
  const photo = await s.call('GET', `/api/admin/submissions/${id}/image`, { token: admin });
  assert.strictEqual(photo.status, 200);
  assert.strictEqual(photo.headers.get('content-type'), 'image/png');
  assert.ok(photo.buf.equals(Buffer.from(image.split(',')[1], 'base64')), 'the stored photo is exactly the uploaded one');

  // the admin has no way to edit
  assert.strictEqual((await s.call('POST', `/api/admin/submissions/${id}/edit`, { token: admin, body: { counts: { validTotal: 1 } } })).status, 404);
  assert.strictEqual((await s.call('POST', `/api/admin/submissions`, { token: admin, body: {} })).status, 404);

  // an agent cannot approve their own result
  assert.strictEqual((await s.call('POST', `/api/admin/submissions/${id}/approve`, { token: t1 })).status, 403);

  const approved = await s.call('POST', `/api/admin/submissions/${id}/approve`, { token: admin });
  assert.strictEqual(approved.status, 200);
  assert.strictEqual((await s.call('POST', `/api/admin/submissions/${id}/approve`, { token: admin })).status, 409);

  // now it is public, with no login
  const pub = await s.call('GET', '/api/public/units/KN-01-01-001');
  assert.strictEqual(pub.json.approved, true);
  const img = await s.call('GET', '/api/public/units/KN-01-01-001/image');
  assert.strictEqual(img.status, 200);
  const country = await s.call('GET', '/api/public/results');
  assert.strictEqual(country.json.coverage.approvedUnits, 1);
  assert.strictEqual(country.json.children[0].name, 'Kano');
  const ward = await s.call('GET', '/api/public/results?state=Kano&lga=Kano%20LGA%2001&ward=Kano%20Ward%2001');
  assert.strictEqual(ward.json.children.filter((c) => c.approved).length, 1);
  assert.strictEqual(ward.json.totals.validTotal, pub.json.counts.validTotal);

  // audit log has the story
  const audit = await s.call('GET', '/api/admin/audit', { token: admin });
  const actions = audit.json.items.map((x) => x.action);
  assert.ok(actions.includes('submission.create') && actions.includes('submission.approve') && actions.includes('login.success'));
  s.close();
});

t('rejecting: the admin must give a reason and the agent sees it', async () => {
  const s = await start();
  const a1 = addAgent(s.ctx, 'KN-01-01-001');
  const t1 = await s.login(a1.username);
  const admin = await s.login('admin');
  const created = await s.call('POST', '/api/agent/submissions', { token: t1, body: { values: goodValues(a1), image: pngDataUrl('x1'), attested: true } });
  const id = created.json.id;
  assert.strictEqual((await s.call('POST', `/api/admin/submissions/${id}/reject`, { token: admin, body: {} })).status, 422);
  const rej = await s.call('POST', `/api/admin/submissions/${id}/reject`, { token: admin, body: { reason: 'The photo does not match the numbers typed.' } });
  assert.strictEqual(rej.status, 200);
  const unit = await s.call('GET', '/api/agent/unit', { token: t1 });
  assert.strictEqual(unit.json.latest.status, 'rejected');
  assert.ok(unit.json.latest.review_reason.includes('photo'));
  assert.strictEqual(unit.json.canSubmit, true);
  s.close();
});

t('submitting wrong numbers returns 422 with explanations in two languages', async () => {
  const s = await start();
  const a1 = addAgent(s.ctx, 'KN-01-01-001');
  const t1 = await s.login(a1.username);
  const values = goodValues(a1, { withWords: false });
  values.counts.validTotal += 7;
  const r = await s.call('POST', '/api/agent/submissions', { token: t1, body: { values, image: pngDataUrl('x2'), attested: true } });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.json.error.code, 'checks_failed');
  const codes = r.json.error.findings.map((f) => f.code);
  assert.ok(codes.includes('A1') && codes.includes('A2') && codes.includes('A3'));
  assert.ok(r.json.error.findings.every((f) => f.message.en && f.message.ha));
  s.close();
});

t('uploads: bad type, bad JSON, wrong body and oversized bodies are refused politely', async () => {
  const s = await start();
  const a1 = addAgent(s.ctx, 'KN-01-01-001');
  const t1 = await s.login(a1.username);
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  const r1 = await s.call('POST', '/api/agent/submissions', { token: t1, body: { values: goodValues(a1), image: svg, attested: true } });
  assert.strictEqual(r1.status, 400);
  const r2 = await s.call('POST', '/api/agent/submissions', { token: t1, raw: '{not json', headers: { 'content-type': 'application/json' } });
  assert.strictEqual(r2.status, 400);
  assert.strictEqual(r2.json.error.code, 'bad_json');
  const r3 = await s.call('POST', '/api/agent/submissions', { token: t1, body: {} });
  assert.ok([400, 422].includes(r3.status));
  const big = JSON.stringify({ values: {}, image: 'A'.repeat(20 * 1024 * 1024) });
  const r4 = await s.call('POST', '/api/agent/submissions', { token: t1, raw: big, headers: { 'content-type': 'application/json' } });
  assert.strictEqual(r4.status, 413);
  const r5 = await s.call('POST', '/api/auth/login', { raw: JSON.stringify({ username: 'a'.repeat(100000), password: 'x' }), headers: { 'content-type': 'application/json' } });
  assert.strictEqual(r5.status, 413);
  assert.ok(!JSON.stringify(r2.json).includes('at '), 'no stack traces for the user');
  s.close();
});

t('CORS: only the web app address is allowed', async () => {
  const s = await start();
  const ok = await s.call('GET', '/api/health', { headers: { origin: 'http://localhost:5173' } });
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const evil = await s.call('GET', '/api/health', { headers: { origin: 'http://evil.example' } });
  assert.strictEqual(evil.headers.get('access-control-allow-origin'), null);
  const pre = await s.call('OPTIONS', '/api/agent/submissions', { headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } });
  assert.strictEqual(pre.status, 204);
  s.close();
});

t('public URLs treat odd input as plain text (no SQL injection, no crashes)', async () => {
  const s = await start();
  const r = await s.call('GET', '/api/public/results?state=' + encodeURIComponent("Kano' OR '1'='1"));
  assert.strictEqual(r.status, 404);
  const u = await s.call('GET', '/api/public/units/' + encodeURIComponent("x'; DROP TABLE users;--"));
  assert.strictEqual(u.status, 404);
  assert.strictEqual(s.ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
  const arr = await s.call('GET', '/api/public/results?state=Kano&state=Lagos');
  assert.ok([200, 400, 404].includes(arr.status));
  s.close();
});

t('AI reading: off by default (503); with settings it fills the form (the agent still confirms)', async () => {
  const s1 = await start();
  const a1 = addAgent(s1.ctx, 'KN-01-01-001');
  const t1 = await s1.login(a1.username);
  const off = await s1.call('POST', '/api/agent/extract', { token: t1, body: { image: pngDataUrl('e1') } });
  assert.strictEqual(off.status, 503);
  assert.strictEqual(off.json.error.code, 'ai_not_configured');
  s1.close();

  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(sample) }] }) });
  const s2 = await start({ fetchImpl }, { ai: { provider: 'anthropic', apiKey: 'k', model: 'm' } });
  const b1 = addAgent(s2.ctx, 'KN-01-01-001');
  const t2 = await s2.login(b1.username);
  assert.strictEqual((await s2.call('GET', '/api/public/config')).json.aiAvailable, true);
  const on = await s2.call('POST', '/api/agent/extract', { token: t2, body: { image: pngDataUrl('e2') } });
  assert.strictEqual(on.status, 200);
  assert.strictEqual(on.json.values.counts.spoiled, 2);
  assert.strictEqual((await s2.call('POST', '/api/agent/extract', { body: { image: pngDataUrl('e2') } })).status, 401);
  s2.close();
});
