// Small shared helpers for the D checks and the word checks.
const { isNum } = require('./helpers');

const COUNT_FIELDS = ['registered', 'accredited', 'issued', 'unused', 'spoiled', 'rejected', 'validTotal', 'usedTotal'];

// A sheet is blank when the AI says so, or when it found no numbers at all.
function isBlankSheet(sheet) {
  if (sheet.imageQuality === 'blank') return true;
  const counts = sheet.counts || {};
  const anyCount = COUNT_FIELDS.some((f) => isNum(counts[f]));
  const anyParty = (sheet.parties || []).some((p) => isNum(p.figures));
  return !anyCount && !anyParty && !isNum(sheet.totalValidRow);
}

// Rows that have "figures" and "words": one per party, plus the bottom total
// row when its words were provided.
function getWordRows(sheet) {
  const rows = (sheet.parties || []).map((p) => ({ name: p.party, figures: p.figures, words: p.words }));
  if (sheet.totalValidRowWords !== undefined) {
    rows.push({ name: 'TOTAL', figures: sheet.totalValidRow, words: sheet.totalValidRowWords });
  }
  return rows;
}

module.exports = { COUNT_FIELDS, isBlankSheet, getWordRows };
