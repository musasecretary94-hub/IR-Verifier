const test = require('node:test');
const assert = require('node:assert');
const { explain, decorate } = require('../src/services/explain');

const SAMPLES = [
  { code: 'A1', details: { partiesSum: 500, validTotal: 490, difference: 10 } },
  { code: 'A2', details: { validTotal: 490, totalValidRow: 480 } },
  { code: 'A3', details: { usedTotal: 495, expectedUsed: 500 } },
  { code: 'A4', details: { accredited: 400, problems: [{ field: 'validTotal', value: 490, excess: 90 }, { field: 'usedTotal', value: 500, excess: 100 }] } },
  { code: 'A5', details: { registered: 450, accredited: 500 } },
  { code: 'A6', details: { issued: 790, unused: 300, usedTotal: 500, expectedIssued: 800 } },
  { code: 'A7', details: { accredited: 520, usedTotal: 500 } },
  { code: 'B1', details: { mismatches: [{ party: 'PA', figures: 200, wordsValue: 210, words: 'two hundred and ten' }] } },
  { code: 'B2', details: { missing: ['PC'], notUnderstood: [{ party: 'PA', words: 'x' }] } },
  { code: 'D1', details: { unreadable: ['rejected', 'party:PC'], unclear: ['registered'] } },
  { code: 'D2', details: {} },
  { code: 'D3', details: {} },
  { code: 'C1', details: { entered: 'XX-01', expected: 'KN-01-01-001' } },
  { code: 'C2', details: { version: 1, status: 'rejected' } },
  { code: 'C3', details: { kind: 'image', otherUnit: 'LA-01-01-001' } },
  { code: 'C3', details: { kind: 'serial', otherUnit: 'LA-01-01-001' } },
  { code: 'C4', details: { entered: 700, registry: 650 } },
  { code: 'F1', details: { missing: ['registered', 'party:PB', 'serialNo'] } },
];

test('every finding code has an English and a Hausa message with real numbers', () => {
  SAMPLES.forEach((f) => {
    const m = explain(f);
    assert.ok(m.en && m.en.length > 10, f.code + ' en');
    assert.ok(m.ha && m.ha.length > 10, f.code + ' ha');
    [m.en, m.ha].forEach((t) => assert.ok(!/undefined|NaN|\[object/.test(t), f.code + ' has a hole: ' + t));
  });
});

test('A1 message contains both numbers in both languages', () => {
  const m = explain(SAMPLES[0]);
  ['500', '490'].forEach((n) => { assert.ok(m.en.includes(n)); assert.ok(m.ha.includes(n)); });
});

test('A4 mentions every problem field', () => {
  const m = explain(SAMPLES[3]);
  assert.ok(m.en.includes('#7') && m.en.includes('#8'));
  assert.ok(m.ha.includes('#7') && m.ha.includes('#8'));
});

test('A6 works with the correct spelling and with the old misspelled key', () => {
  const ok = explain({ code: 'A6', details: { issued: 1, expectedIssued: 2 } });
  const old = explain({ code: 'A6', details: { issued: 1, expectedIsssued: 2 } });
  assert.ok(ok.en.includes('= 2') && old.en.includes('= 2'));
});

test('D1 uses readable field names, not code names', () => {
  const m = explain(SAMPLES[9]);
  assert.ok(m.en.includes('Rejected ballots (#6)') && m.en.includes('Party PC'));
  assert.ok(m.ha.includes('Jam’iyya PC'));
});

test('an unknown code gets a safe message', () => {
  const m = explain({ code: 'ZZ', details: {} });
  assert.ok(m.en.includes('ZZ') && m.ha.includes('ZZ'));
});

test('decorate hides the other polling unit from agents but keeps it for admins', () => {
  const f = [{ code: 'C3', severity: 'error', details: { kind: 'image', otherUnit: 'LA-01-01-001' } }];
  assert.strictEqual(decorate(f, { forAgent: true })[0].details.otherUnit, undefined);
  assert.strictEqual(decorate(f, { forAgent: false })[0].details.otherUnit, 'LA-01-01-001');
  assert.ok(!JSON.stringify(decorate(f, { forAgent: true })).includes('LA-01-01-001'));
});

test('no message accuses anyone', () => {
  SAMPLES.forEach((f) => {
    const m = explain(f);
    assert.ok(!/\b(fraud|fraudulent|cheat|cheating|rig|rigged|rigging|steal|stole|stolen|magudi|sata)\b/i.test(m.en + ' ' + m.ha), f.code);
  });
});
