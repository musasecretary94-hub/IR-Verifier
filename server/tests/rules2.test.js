// Tests for A7, B1, B2, D1, D2, D3.
const test = require('node:test');
const assert = require('node:assert');
const { runChecks } = require('../src/rules');

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
const find = (sheet, code) => runChecks(sheet).find((f) => f.code === code);
const codes = (sheet) => runChecks(sheet).map((f) => f.code);

// ---------- A7 ----------
test('A7 is info when used ballots are below accredited voters', () => {
  const s = cleanSheet();
  s.counts.accredited = 520;
  const f = find(s, 'A7');
  assert.ok(f);
  assert.strictEqual(f.severity, 'info');
  assert.strictEqual(f.details.difference, 20);
});
test('A7 does not fire when used equals accredited', () => {
  assert.ok(!codes(cleanSheet()).includes('A7'));
});
test('A7 is skipped when a number is null', () => {
  const s = cleanSheet();
  s.counts.usedTotal = null;
  assert.ok(!codes(s).includes('A7'));
});

// ---------- B1 ----------
test('B1 catches figures that do not match the words', () => {
  const s = cleanSheet();
  s.parties[0].words = 'two hundred and ten';
  const f = find(s, 'B1');
  assert.ok(f);
  assert.strictEqual(f.severity, 'warning');
  assert.strictEqual(f.details.mismatches[0].party, 'A');
  assert.strictEqual(f.details.mismatches[0].wordsValue, 210);
});
test('B1 passes when figures and words match', () => {
  const s = cleanSheet();
  s.parties[0].words = 'TWO HUNDRED';
  s.parties[5].words = 'five';
  assert.ok(!codes(s).includes('B1'));
});
test('B1 is skipped when words are missing or not understood', () => {
  const s = cleanSheet();
  s.parties[0].words = null;
  s.parties[1].words = 'banana';
  assert.ok(!codes(s).includes('B1'));
});
test('B1 also checks the total row when its words are given', () => {
  const s = cleanSheet();
  s.totalValidRowWords = 'four hundred and eighty';
  const f = find(s, 'B1');
  assert.ok(f);
  assert.strictEqual(f.details.mismatches[0].party, 'TOTAL');
});

// ---------- B2 ----------
test('B2 lists rows whose words are missing', () => {
  const s = cleanSheet();
  s.parties[2].words = null;
  s.parties[3].words = '';
  const f = find(s, 'B2');
  assert.ok(f);
  assert.strictEqual(f.severity, 'info');
  assert.deepStrictEqual(f.details.missing, ['C', 'D']);
});
test('B2 lists words that were not understood', () => {
  const s = cleanSheet();
  s.parties[0].words = 'twoo hundrd';
  const f = find(s, 'B2');
  assert.ok(f);
  assert.strictEqual(f.details.notUnderstood[0].party, 'A');
});
test('B2 says nothing when no words were provided at all', () => {
  assert.ok(!codes(cleanSheet()).includes('B2'));
});

// ---------- D1 ----------
test('D1 lists a count that could not be read', () => {
  const s = cleanSheet();
  s.counts.rejected = null;
  const f = find(s, 'D1');
  assert.ok(f);
  assert.strictEqual(f.severity, 'warning');
  assert.deepStrictEqual(f.details.unreadable, ['rejected']);
});
test('D1 lists a party figure that could not be read', () => {
  const s = cleanSheet();
  s.parties[2].figures = null;
  assert.deepStrictEqual(find(s, 'D1').details.unreadable, ['party:C']);
});
test('D1 separates illegible from unclear', () => {
  const s = cleanSheet();
  s.readability = { accredited: 'illegible', registered: 'unclear' };
  const f = find(s, 'D1');
  assert.deepStrictEqual(f.details.unreadable, ['accredited']);
  assert.deepStrictEqual(f.details.unclear, ['registered']);
});
test('D1 stays quiet on a clean sheet', () => {
  assert.ok(!codes(cleanSheet()).includes('D1'));
});
test('D1 stays quiet on a blank sheet (D3 reports it)', () => {
  const s = cleanSheet();
  s.imageQuality = 'blank';
  s.counts.registered = null;
  assert.ok(!codes(s).includes('D1'));
});

// ---------- D2 ----------
test('D2 fires on a poor image', () => {
  const s = cleanSheet();
  s.imageQuality = 'poor';
  const f = find(s, 'D2');
  assert.ok(f);
  assert.strictEqual(f.severity, 'warning');
});
test('D2 does not fire on a good image', () => {
  const s = cleanSheet();
  s.imageQuality = 'ok';
  assert.ok(!codes(s).includes('D2'));
});

// ---------- D3 ----------
test('D3 fires when the AI says the sheet is blank', () => {
  const s = cleanSheet();
  s.imageQuality = 'blank';
  assert.ok(find(s, 'D3'));
});
test('D3 fires when no number could be read at all', () => {
  const s = cleanSheet();
  s.parties = [];
  s.totalValidRow = null;
  Object.keys(s.counts).forEach((k) => { s.counts[k] = null; });
  assert.ok(find(s, 'D3'));
});
test('D3 does not fire on a normal sheet', () => {
  assert.ok(!codes(cleanSheet()).includes('D3'));
});
