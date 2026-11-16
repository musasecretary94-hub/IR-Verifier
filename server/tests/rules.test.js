// Run with:  node --test
// (uses Node's built-in test runner, nothing to install)

const test = require('node:test');
const assert = require('node:assert');
const { runChecks } = require('../src/rules');

// A clean SYNTHETIC sheet. Every check should pass on it.
// used (500) = spoiled 2 + rejected 8 + valid 490
// issued (800) = unused 300 + used 500
function cleanSheet() {
  return {
    counts: {
      registered: 800,
      accredited: 500,
      issued: 800,
      unused: 300,
      spoiled: 2,
      rejected: 8,
      validTotal: 490,
      usedTotal: 500,
    },
    parties: [
      { party: 'A', figures: 200 },
      { party: 'B', figures: 150 },
      { party: 'C', figures: 90 },
      { party: 'D', figures: 30 },
      { party: 'E', figures: 10 },
      { party: 'F', figures: 5 },
      { party: 'G', figures: 5 },
    ],
    totalValidRow: 490,
  };
}

const codes = (sheet) => runChecks(sheet).map((f) => f.code);

test('clean sheet passes every check', () => {
  assert.deepStrictEqual(runChecks(cleanSheet()), []);
});

test('A1 fails when the party votes do not add up to box #7', () => {
  const s = cleanSheet();
  s.parties[0].figures = 210; // sum becomes 500, box #7 says 490
  const found = runChecks(s).find((f) => f.code === 'A1');
  assert.ok(found);
  assert.strictEqual(found.severity, 'error');
  assert.strictEqual(found.details.partiesSum, 500);
  assert.strictEqual(found.details.difference, 10);
});

test('A1 is skipped when a party figure could not be read', () => {
  const s = cleanSheet();
  s.parties[2].figures = null;
  assert.ok(!codes(s).includes('A1'));
});

test('A1 is skipped on a blank sheet with no party rows', () => {
  const s = cleanSheet();
  s.parties = [];
  assert.ok(!codes(s).includes('A1'));
});

test('A2 fails when the bottom total does not match box #7', () => {
  const s = cleanSheet();
  s.totalValidRow = 480;
  const found = runChecks(s).find((f) => f.code === 'A2');
  assert.ok(found);
  assert.strictEqual(found.details.difference, -10);
});

test('A2 is skipped when the bottom total could not be read', () => {
  const s = cleanSheet();
  s.totalValidRow = null;
  assert.ok(!codes(s).includes('A2'));
});

test('A3 fails when box #8 is not #5 + #6 + #7', () => {
  const s = cleanSheet();
  s.counts.usedTotal = 495;
  const found = runChecks(s).find((f) => f.code === 'A3');
  assert.ok(found);
  assert.strictEqual(found.details.expectedUsed, 500);
  assert.strictEqual(found.details.difference, -5);
});

test('A3 passes when spoiled ballots are 0 (a dash on the sheet)', () => {
  const s = cleanSheet();
  s.counts.spoiled = 0;
  s.counts.usedTotal = 498; // 0 + 8 + 490
  s.counts.unused = 302;
  assert.ok(!codes(s).includes('A3'));
});

test('A3 is skipped when a count could not be read', () => {
  const s = cleanSheet();
  s.counts.rejected = null;
  assert.ok(!codes(s).includes('A3'));
});

test('A4 fails when valid votes are higher than accredited voters', () => {
  const s = cleanSheet();
  s.counts.accredited = 400; // valid 490 and used 500 are now both too high
  const found = runChecks(s).find((f) => f.code === 'A4');
  assert.ok(found);
  assert.strictEqual(found.details.problems.length, 2);
});

test('A4 reports only the field that is too high', () => {
  const s = cleanSheet();
  s.counts.accredited = 495; // valid 490 is fine, used 500 is too high
  const found = runChecks(s).find((f) => f.code === 'A4');
  assert.ok(found);
  assert.deepStrictEqual(found.details.problems.map((p) => p.field), ['usedTotal']);
  assert.strictEqual(found.details.problems[0].excess, 5);
});

test('A4 is skipped when accredited voters could not be read', () => {
  const s = cleanSheet();
  s.counts.accredited = null;
  assert.ok(!codes(s).includes('A4'));
});

test('A5 fails when accredited voters exceed registered voters', () => {
  const s = cleanSheet();
  s.counts.registered = 450;
  const found = runChecks(s).find((f) => f.code === 'A5');
  assert.ok(found);
  assert.strictEqual(found.details.excess, 50);
});

test('A5 passes when accredited equals registered', () => {
  const s = cleanSheet();
  s.counts.registered = 500;
  assert.ok(!codes(s).includes('A5'));
});

test('a sheet with several problems returns several findings', () => {
  const s = cleanSheet();
  s.counts.registered = 450; // A5
  s.totalValidRow = 480; // A2
  const c = codes(s);
  assert.ok(c.includes('A5') && c.includes('A2'));
});

test('A6 fails when issued ballots do not equal unused + usedTotal ballots', () =>{
  const s = cleanSheet();
  s.counts.issued = 790; // should be 800
  const found = runChecks(s).find((f) => f.code === 'A6'); 
  console.log(found);
  assert.ok(found);
  assert.strictEqual(found.details.expectedIsssued, 800);
  assert.strictEqual(found.details.difference, -10);
});

test('A6 is skipped when a count could not be read', () => {
  const s = cleanSheet();
  s.counts.issued = null;
  assert.ok(!codes(s).includes('A6'));
});

test('A6 catches a difference of 1 but not an exact match', () => {
  const s = cleanSheet();
  s.counts.issued = 799;         
  assert.ok(codes(s).includes('A6'));

  s.counts.issued = 800;          
  assert.ok(!codes(s).includes('A6'));
});
