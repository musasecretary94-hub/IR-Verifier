// B2 (info): the words are missing, or the words could not be understood.
// If a row has no "words" property at all (undefined), the AI gave us no
// information about words, so we say nothing.
// null or empty text means the AI looked and found nothing.
const { isNum } = require('./helpers');
const { getWordRows } = require('./sheetState');
const { parseWords } = require('../services/wordsParser');

module.exports = function b2(sheet) {
  const missing = [];
  const notUnderstood = [];

  getWordRows(sheet).forEach((row) => {
    if (!isNum(row.figures)) return;
    if (row.words === undefined) return;

    const isEmpty = row.words === null || (typeof row.words === 'string' && row.words.trim() === '');
    if (isEmpty) {
      missing.push(row.name);
    } else if (parseWords(row.words) === null) {
      notUnderstood.push({ party: row.name, words: row.words });
    }
  });

  if (missing.length === 0 && notUnderstood.length === 0) return null;
  return { code: 'B2', severity: 'info', details: { missing, notUnderstood } };
};
