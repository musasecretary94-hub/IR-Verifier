const test = require('node:test');
const assert = require('node:assert');
const { parseWords } = require('../src/services/wordsParser');

test('words from a real sheet are understood', () => {
  const cases = [
    ['TWO HUNDRED AND TWENTY FIVE', 225],
    ['THREE', 3],
    ['NIL', 0],
    ['FIVE', 5],
    ['TWO', 2],
    ['ONE HUNDRED AND SEVENTY', 170],
    ['ONE', 1],
    ['FOUR', 4],
    ['FOUR HUNDRED AND THIRTEEN', 413],
  ];
  cases.forEach(([words, expected]) => assert.strictEqual(parseWords(words), expected, words));
});

test('zero words', () => {
  ['nil', 'Nil', 'ZERO', 'none', 'nought'].forEach((w) => assert.strictEqual(parseWords(w), 0, w));
});

test('numbers 1 to 99, with and without hyphen', () => {
  assert.strictEqual(parseWords('fifteen'), 15);
  assert.strictEqual(parseWords('twenty'), 20);
  assert.strictEqual(parseWords('twenty five'), 25);
  assert.strictEqual(parseWords('twenty-five'), 25);
  assert.strictEqual(parseWords('ninety nine'), 99);
});

test('hundreds and thousands', () => {
  assert.strictEqual(parseWords('one hundred'), 100);
  assert.strictEqual(parseWords('nine hundred and ninety nine'), 999);
  assert.strictEqual(parseWords('one thousand'), 1000);
  assert.strictEqual(parseWords('one thousand two hundred and five'), 1205);
  assert.strictEqual(parseWords('eleven thousand five hundred'), 11500);
});

test('extra spaces and capital letters do not matter', () => {
  assert.strictEqual(parseWords('  Two   Hundred  '), 200);
});

test('words that cannot be understood give null (never a guess)', () => {
  ['', '   ', 'banana', 'twenty twenty', 'hundred', 'five twenty', 'two hundred hundred', 'nil five', 'constructor']
    .forEach((w) => assert.strictEqual(parseWords(w), null, JSON.stringify(w)));
  assert.strictEqual(parseWords(null), null);
  assert.strictEqual(parseWords(undefined), null);
  assert.strictEqual(parseWords(225), null);
});
