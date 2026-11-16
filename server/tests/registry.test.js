const test = require('node:test');
const assert = require('node:assert');
const sub = require('../src/services/submissions');
const results = require('../src/services/results');
const { parseCsv, exportRegistryCsv, planImport, applyImport } = require('../src/db/registryCsv');
const { createMissingAgents } = require('../src/db/maintenance');
const { makeCtx, addAgent, adminUser, goodValues, pngDataUrl } = require('./helpers/setup');

const reg = (db, code) => db.prepare('SELECT registered FROM polling_units WHERE code = ?').get(code).registered;
const units = (db) => db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n;

// ---------- reading CSV ----------
test('parseCsv: quotes, commas inside names, doubled quotes, Excel BOM and Windows line ends', () => {
  const rows = parseCsv('\ufeffcode,name,registered\r\nA-1,"School, Main",500\r\nA-2,"The ""Big"" School",600\r\n');
  assert.deepStrictEqual(rows.map((r) => r.cells), [['code', 'name', 'registered'], ['A-1', 'School, Main', '500'], ['A-2', 'The "Big" School', '600']]);
  assert.deepStrictEqual(rows.map((r) => r.line), [1, 2, 3]);
});

test('parseCsv: a semicolon file (some Excel settings) and blank lines', () => {
  const rows = parseCsv('code;registered\n\nA-1;500\n\n\nA-2;600');
  assert.deepStrictEqual(rows.map((r) => r.cells), [['code', 'registered'], ['A-1', '500'], ['A-2', '600']]);
  assert.deepStrictEqual(rows.map((r) => r.line), [1, 3, 6], 'line numbers match the real file');
});

test('parseCsv: an unclosed quote is an error', () => {
  assert.throws(() => parseCsv('code,name\nA-1,"oops'), /never closed/);
});

// ---------- export and round trip ----------
test('export then import with no edits changes nothing', () => {
  const ctx = makeCtx();
  const text = exportRegistryCsv(ctx.db);
  assert.strictEqual(text.split('\n').length, 74); // header + 72 + trailing newline
  const plan = planImport(ctx.db, text);
  assert.deepStrictEqual(plan.errors, []);
  assert.strictEqual(plan.summary.unchanged, 72);
  assert.strictEqual(plan.ops.length, 0);
  assert.strictEqual(plan.summary.notInFile, 0);
});

// ---------- changing registered voters ----------
test('changing the "registered" column updates only those polling units', () => {
  const ctx = makeCtx();
  const lines = exportRegistryCsv(ctx.db).split('\n');
  const old1 = reg(ctx.db, 'KN-01-01-001');
  const old3 = reg(ctx.db, 'KN-01-01-003');
  lines[1] = lines[1].replace(/,\d+$/, ',611');
  lines[3] = lines[3].replace(/,\d+$/, ',622');
  const plan = planImport(ctx.db, lines.join('\n'));
  assert.deepStrictEqual(plan.errors, []);
  assert.strictEqual(plan.summary.registeredChanged, 2);
  assert.strictEqual(plan.summary.unchanged, 70);
  assert.deepStrictEqual(plan.changes.map((c) => [c.code, c.from, c.to]), [['KN-01-01-001', old1, 611], ['KN-01-01-003', old3, 622]]);
  assert.strictEqual(reg(ctx.db, 'KN-01-01-001'), old1, 'planning must change nothing');
  applyImport(ctx.db, plan, { fileName: 'x.csv' });
  assert.strictEqual(reg(ctx.db, 'KN-01-01-001'), 611);
  assert.strictEqual(reg(ctx.db, 'KN-01-01-003'), 622);
  assert.strictEqual(units(ctx.db), 72);
  assert.strictEqual(ctx.db.prepare('SELECT action FROM audit_log ORDER BY id DESC LIMIT 1').get().action, 'registry.import');
});

test('a file with only the columns code and registered is enough, and extra columns are ignored', () => {
  const ctx = makeCtx();
  const plan = planImport(ctx.db, 'Code,REGISTERED,done\nKN-01-01-002,700,yes\nKN-01-01-004,800,\n');
  assert.deepStrictEqual(plan.errors, []);
  assert.strictEqual(plan.summary.registeredChanged, 2);
  assert.strictEqual(plan.summary.notInFile, 70, 'units that are not in the file stay as they are');
  applyImport(ctx.db, plan);
  assert.strictEqual(reg(ctx.db, 'KN-01-01-002'), 700);
  assert.strictEqual(units(ctx.db), 72, 'nothing is ever deleted');
});

test('after the change, the agent is checked against the NEW number (C4)', () => {
  const ctx = makeCtx();
  const a = addAgent(ctx, 'KN-01-01-001');
  const oldValues = goodValues(a);
  applyImport(ctx.db, planImport(ctx.db, 'code,registered\nKN-01-01-001,999\n'));
  assert.ok(sub.checkForAgent(ctx, a, oldValues).findings.some((f) => f.code === 'C4'));
});

test('a unit that already has results: registered may change, the stored result keeps its number', () => {
  const ctx = makeCtx();
  const a = addAgent(ctx, 'KN-01-01-001');
  const r = sub.createSubmission(ctx, a, { values: goodValues(a), image: pngDataUrl('q'), attested: true, ip: 'x' });
  sub.approve(ctx, adminUser(ctx), r.id, 'x');
  const before = results.getArea(ctx.db, {}).totals.registered;
  const plan = planImport(ctx.db, 'code,registered\nKN-01-01-001,999\n');
  assert.strictEqual(plan.summary.changedWithResults, 1);
  assert.ok(plan.warnings[0].includes('already has results'));
  applyImport(ctx.db, plan);
  assert.strictEqual(results.getArea(ctx.db, {}).totals.registered, before);
});

// ---------- new polling units ----------
test('a new polling unit needs its place columns, and can then get an agent', () => {
  const ctx = makeCtx();
  const bad = planImport(ctx.db, 'code,registered\nNEW-01,500\n');
  assert.ok(bad.errors[0].message.includes('NEW polling unit') && bad.errors[0].message.includes('name'));
  const plan = planImport(ctx.db, 'code,name,ward,lga,state,registered\nNEW-01,"O\'Brien School, Annex",Ward 1,LGA 1,Kano,520\n');
  assert.deepStrictEqual(plan.errors, []);
  assert.strictEqual(plan.summary.newUnits, 1);
  applyImport(ctx.db, plan);
  assert.strictEqual(units(ctx.db), 73);
  assert.strictEqual(ctx.db.prepare("SELECT name FROM polling_units WHERE code = 'NEW-01'").get().name, "O'Brien School, Annex");
  const rows = createMissingAgents(ctx.db);
  assert.strictEqual(rows.length, 73);
  assert.ok(rows.find((r) => r.code === 'NEW-01').created);
});

// ---------- everything or nothing ----------
test('one bad row means NOTHING is changed', () => {
  const ctx = makeCtx();
  const before = ctx.db.prepare('SELECT code, registered FROM polling_units ORDER BY id').all().map((r) => ({ ...r }));
  const plan = planImport(ctx.db, 'code,registered\nKN-01-01-001,611\nKN-01-01-002,abc\nKN-01-01-003,622\n');
  assert.strictEqual(plan.errors.length, 1);
  assert.strictEqual(plan.errors[0].line, 3);
  assert.throws(() => applyImport(ctx.db, plan), /nothing was changed/);
  assert.deepStrictEqual(ctx.db.prepare('SELECT code, registered FROM polling_units ORDER BY id').all().map((r) => ({ ...r })), before);
});

test('bad numbers, bad codes, duplicates and huge numbers are all refused with the line number', () => {
  const ctx = makeCtx();
  const bad = [
    ['KN-01-01-001,', 'whole number'],
    ['KN-01-01-001,-5', 'whole number'],
    ['KN-01-01-001,12.5', 'whole number'],
    ['KN-01-01-001,1e3', 'whole number'],
    ['KN-01-01-001,99999999', 'too large'],
    ["KN-01-01-001'; DROP TABLE users;--,500", 'Bad polling unit code'],
    [',500', 'Bad polling unit code'],
  ];
  bad.forEach(([row, msg]) => {
    const plan = planImport(ctx.db, 'code,registered\n' + row + '\n');
    assert.strictEqual(plan.errors.length, 1, row);
    assert.ok(plan.errors[0].message.includes(msg), row + ' -> ' + plan.errors[0].message);
    assert.strictEqual(plan.errors[0].line, 2);
  });
  const dup = planImport(ctx.db, 'code,registered\nKN-01-01-001,500\nKN-01-01-001,600\n');
  assert.ok(dup.errors[0].message.includes('more than once'));
  assert.strictEqual(ctx.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
});

test('missing columns, empty file and broken quotes are refused', () => {
  const ctx = makeCtx();
  assert.ok(planImport(ctx.db, 'code,name\nKN-01-01-001,x\n').errors[0].message.includes('"registered"'));
  assert.ok(planImport(ctx.db, 'registered\n500\n').errors[0].message.includes('"code"'));
  assert.ok(planImport(ctx.db, '').errors[0].message.includes('empty'));
  assert.ok(planImport(ctx.db, 'code,registered\n"KN-01-01-001,500\n').errors.length === 1);
});

test('the place of a unit that already has results cannot be changed (it would move its votes)', () => {
  const ctx = makeCtx();
  const a = addAgent(ctx, 'KN-01-01-001');
  sub.createSubmission(ctx, a, { values: goodValues(a), image: pngDataUrl('w'), attested: true, ip: 'x' });
  const plan = planImport(ctx.db, 'code,name,ward,lga,state,registered\nKN-01-01-001,Same,Other Ward,Kano LGA 01,Kano,500\n');
  assert.ok(plan.errors[0].message.includes('already has results'));
  const ok = planImport(ctx.db, 'code,name,ward,lga,state,registered\nKN-01-01-002,New Name,Kano Ward 01,Kano LGA 01,Kano,500\n');
  assert.deepStrictEqual(ok.errors, []);
  assert.strictEqual(ok.summary.placeChanged, 1);
});
