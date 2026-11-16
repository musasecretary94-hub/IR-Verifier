// Steps 2 + 3 + 4 together: AI output -> normalize -> check -> route.
const test = require('node:test');
const assert = require('node:assert');
const { analyzeExtraction } = require('../src/services/pipeline');
const sample = () => JSON.parse(JSON.stringify(require('../data/sample-extraction.json')));

test('the sample AI result is clean', () => {
  const r = analyzeExtraction(sample());
  assert.strictEqual(r.status, 'clean');
  assert.deepStrictEqual(r.findings, []);
});

test('one wrong party figure is caught by A1 and routed to review', () => {
  const raw = sample();
  raw.parties[0].figures = '-210-';
  raw.parties[0].words = 'TWO HUNDRED AND TEN';
  const r = analyzeExtraction(raw);
  assert.strictEqual(r.status, 'needs_review');
  const a1 = r.findings.find((f) => f.code === 'A1');
  assert.ok(a1);
  assert.strictEqual(a1.details.partiesSum, 500);
});

test('figures that disagree with the words are caught by B1', () => {
  const raw = sample();
  raw.parties[0].words = 'TWO HUNDRED AND TEN';
  const r = analyzeExtraction(raw);
  assert.ok(r.findings.some((f) => f.code === 'B1'));
  assert.strictEqual(r.status, 'needs_review');
});

test('misreading 490 as 409 raises A1, A2 and A3 together', () => {
  const raw = sample();
  raw.counts.valid_total = { v: 409, l: 'clear' };
  const codes = analyzeExtraction(raw).findings.map((f) => f.code);
  ['A1', 'A2', 'A3'].forEach((c) => assert.ok(codes.includes(c), c));
});

test('an unreadable count can never look clean', () => {
  const raw = sample();
  raw.counts.unused = { v: null, l: 'illegible' };
  const r = analyzeExtraction(raw);
  assert.strictEqual(r.status, 'needs_review');
  assert.ok(r.findings.some((f) => f.code === 'D1'));
});

test('a poor photo is routed to review', () => {
  const raw = sample();
  raw.image_quality = 'poor';
  const r = analyzeExtraction(raw);
  assert.strictEqual(r.status, 'needs_review');
  assert.ok(r.findings.some((f) => f.code === 'D2'));
});

test('an empty AI answer is a blank sheet and goes to review', () => {
  const r = analyzeExtraction({});
  assert.strictEqual(r.status, 'needs_review');
  assert.ok(r.findings.some((f) => f.code === 'D3'));
});

test('a dash for spoiled ballots (none) does not raise a problem', () => {
  const raw = sample();
  raw.counts.spoiled = { v: '-', l: 'clear' };
  raw.counts.used_total = { v: 498, l: 'clear' };   // 0 + 8 + 490
  raw.counts.unused = { v: 302, l: 'clear' };       // 800 - 498
  const r = analyzeExtraction(raw);
  assert.ok(!r.findings.some((f) => f.severity === 'error'));
});

test('notes show what the normalizer changed', () => {
  const r = analyzeExtraction(sample());
  assert.ok(r.notes.length >= 3);
  assert.ok(r.notes.every((n) => n.field && n.reason));
});
