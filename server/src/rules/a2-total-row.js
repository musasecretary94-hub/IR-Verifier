// A2: the "Total valid votes" line at the bottom must match box #7.
const { allNumbers } = require('./helpers');

module.exports = function a2(sheet) {
  const { validTotal } = sheet.counts;
  const totalValidRow = sheet.totalValidRow;
  if (!allNumbers([validTotal, totalValidRow])) return null;
  if (validTotal === totalValidRow) return null;

  return {
    code: 'A2',
    severity: 'error',
    details: { validTotal, totalValidRow, difference: totalValidRow - validTotal },
  };
};
