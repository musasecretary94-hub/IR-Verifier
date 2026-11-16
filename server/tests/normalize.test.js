const test = require('node:test');
const assert = require('node:assert');
const { normalizeSheet, toNumber } = require('../src/services/normalize');
const sample = () => JSON.parse(JSON.stringify(require('../data/sample-extraction.json')));

// ---------- toNumber ----------
test('toNumber keeps good numbers', () => {
  assert.strictEqual(toNumber(3, 'x', []), 3);
  assert.strictEqual(toNumber(0, 'x', []), 0);
  assert.strictEqual(toNumber('45', 'x', []), 45);
  assert.strictEqual(toNumber('  45 ', 'x', []), 45);
  assert.strictEqual(toNumber('003', 'x', []), 3);
});

test('toNumber removes dashes around a number', () => {
  assert.strictEqual(toNumber('-03-', 'x', []), 3);
  assert.strictEqual(toNumber('-0-', 'x', []), 0);
  assert.strictEqual(toNumber('\u201305\u2013', 'x', []), 5); // en dash
  assert.strictEqual(toNumber('-225-', 'x', []), 225);
});

test('toNumber turns a lone dash into 0 (none)', () => {
  ['-', '--', '\u2014', '\u2013', ' - '].forEach((d) => assert.strictEqual(toNumber(d, 'x', []), 0, d));
});

test('toNumber understands thousands commas', () => {
  assert.strictEqual(toNumber('1,200', 'x', []), 1200);
});

test('toNumber never guesses: unreadable things give null', () => {
  [null, undefined, '', '   ', 'abc', '12.5', '4l5', '2 25', -3, 3.5, NaN, {}, [], true]
    .forEach((v) => assert.strictEqual(toNumber(v, 'x', []), null, String(v)));
});

test('toNumber writes a note when it changes something', () => {
  const notes = [];
  toNumber('-03-', 'spoiled', notes);
  toNumber('-', 'rejected', notes);
  toNumber('abc', 'accredited', notes);
  toNumber(45, 'registered', notes); // no change, no note
  assert.deepStrictEqual(notes.map((n) => [n.field, n.reason, n.to]), [
    ['spoiled', 'cleaned', 3],
    ['rejected', 'dash_to_zero', 0],
    ['accredited', 'not_a_number', null],
  ]);
});

// ---------- normalizeSheet ----------
test('a good AI result becomes a sheet the checks understand', () => {
  const { sheet } = normalizeSheet(sample());
  assert.deepStrictEqual(sheet.counts, {
    registered: 800, accredited: 500, issued: 800, unused: 300,
    spoiled: 2, rejected: 8, validTotal: 490, usedTotal: 500,
  });
  assert.strictEqual(sheet.parties.length, 7);
  assert.deepStrictEqual(sheet.parties[0], { party: 'A', figures: 200, words: 'TWO HUNDRED', readability: 'clear' });
  assert.strictEqual(sheet.totalValidRow, 490);
  assert.strictEqual(sheet.totalValidRowWords, 'FOUR HUNDRED AND NINETY');
  assert.strictEqual(sheet.imageQuality, 'ok');
  assert.strictEqual(sheet.readability.validTotal, 'clear');
  assert.strictEqual(sheet.header.puCode, '003');
});

test('dashes in the sample are recorded in notes', () => {
  const { notes } = normalizeSheet(sample());
  const fields = notes.map((n) => n.field);
  assert.ok(fields.includes('spoiled'));
  assert.ok(fields.includes('party:A'));
  assert.ok(fields.includes('party:E'));
});

test('an unreadable field stays null and keeps its readability', () => {
  const raw = sample();
  raw.counts.accredited = { v: null, l: 'illegible' };
  const { sheet } = normalizeSheet(raw);
  assert.strictEqual(sheet.counts.accredited, null);
  assert.strictEqual(sheet.readability.accredited, 'illegible');
});

test('an unknown readability word is treated as unclear (the careful choice)', () => {
  const raw = sample();
  raw.counts.registered = { v: 800, l: 'maybe' };
  raw.parties[1].l = 'fuzzy';
  const { sheet } = normalizeSheet(raw);
  assert.strictEqual(sheet.readability.registered, 'unclear');
  assert.strictEqual(sheet.parties[1].readability, 'unclear');
});

test('image quality: known words are accepted, others ignored', () => {
  const a = sample(); a.image_quality = 'POOR';
  assert.strictEqual(normalizeSheet(a).sheet.imageQuality, 'poor');
  const b = sample(); b.image_quality = 'blurry-ish';
  assert.strictEqual(normalizeSheet(b).sheet.imageQuality, undefined);
});

test('words: missing key stays undefined, empty text becomes null, text is trimmed', () => {
  const raw = sample();
  delete raw.parties[0].words;
  raw.parties[1].words = '   ';
  raw.parties[2].words = '  NINETY ';
  const { sheet } = normalizeSheet(raw);
  assert.strictEqual('words' in sheet.parties[0], false);
  assert.strictEqual(sheet.parties[1].words, null);
  assert.strictEqual(sheet.parties[2].words, 'NINETY');
});

test('counts may also arrive as plain values, not { v, l }', () => {
  const raw = sample();
  raw.counts.registered = 800;
  raw.counts.rejected = '-8-';
  const { sheet } = normalizeSheet(raw);
  assert.strictEqual(sheet.counts.registered, 800);
  assert.strictEqual(sheet.counts.rejected, 8);
});

test('missing or strange input does not crash', () => {
  [undefined, null, 'text', 5, [], {}].forEach((raw) => {
    const { sheet } = normalizeSheet(raw);
    assert.strictEqual(sheet.counts.registered, null);
    assert.deepStrictEqual(sheet.parties, []);
    assert.strictEqual(sheet.totalValidRow, null);
  });
});

test('a party without a name gets a placeholder name', () => {
  const raw = sample();
  raw.parties.push({ figures: 1 });
  const { sheet } = normalizeSheet(raw);
  assert.strictEqual(sheet.parties[7].party, '?8');
});
