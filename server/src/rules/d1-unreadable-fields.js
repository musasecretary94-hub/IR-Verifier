// D1 (warning): some fields could not be read, or were hard to read.
//   unreadable = value is null, or the AI said "illegible"
//   unclear    = value was read, but the AI said "unclear"
// A blank sheet is reported by D3, so D1 stays quiet for it.
const { isNum } = require('./helpers');
const { COUNT_FIELDS, isBlankSheet } = require('./sheetState');

module.exports = function d1(sheet) {
  if (isBlankSheet(sheet)) return null;

  const readability = sheet.readability || {};
  const counts = sheet.counts || {};
  const unreadable = [];
  const unclear = [];

  function look(name, value, level) {
    if (!isNum(value) || level === 'illegible') unreadable.push(name);
    else if (level === 'unclear') unclear.push(name);
  }

  COUNT_FIELDS.forEach((f) => look(f, counts[f], readability[f]));
  (sheet.parties || []).forEach((p) => look('party:' + p.party, p.figures, p.readability));
  look('totalValidRow', sheet.totalValidRow, readability.totalValidRow);

  if (unreadable.length === 0 && unclear.length === 0) return null;
  return { code: 'D1', severity: 'warning', details: { unreadable, unclear } };
};
