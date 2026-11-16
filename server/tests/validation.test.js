const test = require('node:test');
const assert = require('node:assert');
const { validateSheet } = require('../src/services/validation');

function cleanSheet() {
  return {
    counts: {
      registered: 800, accredited: 500, issued: 800, unused: 300,
      spoiled: 2, rejected: 8, validTotal: 490, usedTotal: 500,
    },
    parties: [
      { party: 'A', figures: 200 }, { party: 'B', figures: 150 },
      { party: 'C', figures: 90 },  { party: 'D', figures: 30 },
      { party: 'E', figures: 10 },  { party: 'F', figures: 5 },
      { party: 'G', figures: 5 },
    ],
    totalValidRow: 490,
  };
}

test('a clean sheet is routed to clean with no findings', () => {
  const r = validateSheet(cleanSheet());
  assert.strictEqual(r.status, 'clean');
  assert.deepStrictEqual(r.findings, []);
});

test('an error sends the sheet to needs_review', () => {
  const s = cleanSheet();
  s.totalValidRow = 480;
  assert.strictEqual(validateSheet(s).status, 'needs_review');
});

test('info alone does not stop a sheet from being clean', () => {
  const s = cleanSheet();
  s.counts.accredited = 520; // only A7 (info) fires
  const r = validateSheet(s);
  assert.deepStrictEqual(r.findings.map((f) => f.code), ['A7']);
  assert.strictEqual(r.status, 'clean');
});

test('GAP CLOSED: unreadable fields can never look clean', () => {
  const s = cleanSheet();
  s.counts.rejected = null;
  s.counts.unused = null;
  const r = validateSheet(s);
  assert.strictEqual(r.status, 'needs_review');
  assert.ok(r.findings.some((f) => f.code === 'D1'));
});

test('a blank sheet is routed to needs_review', () => {
  const s = cleanSheet();
  s.imageQuality = 'blank';
  assert.strictEqual(validateSheet(s).status, 'needs_review');
});

test('a poor image is routed to needs_review', () => {
  const s = cleanSheet();
  s.imageQuality = 'poor';
  assert.strictEqual(validateSheet(s).status, 'needs_review');
});
