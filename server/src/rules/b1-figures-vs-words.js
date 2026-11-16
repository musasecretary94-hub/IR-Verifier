// B1 (warning): the number in figures does not match the number in words.
// Only rows where BOTH figures and words are readable are compared.
// Words that cannot be understood are reported by B2, not here.
const { isNum } = require('./helpers');
const { getWordRows } = require('./sheetState');
const { parseWords } = require('../services/wordsParser');

module.exports = function b1(sheet) {
  const mismatches = [];

  getWordRows(sheet).forEach((row) => {
    if (!isNum(row.figures)) return;
    if (typeof row.words !== 'string' || row.words.trim() === '') return;

    const wordsValue = parseWords(row.words);
    if (wordsValue === null) return; // not understood: B2
    if (wordsValue !== row.figures) {
      mismatches.push({ party: row.name, figures: row.figures, words: row.words, wordsValue });
    }
  });

  if (mismatches.length === 0) return null;
  return { code: 'B1', severity: 'warning', details: { mismatches } };
};
