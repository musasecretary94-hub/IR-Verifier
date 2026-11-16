// A1: the party votes must add up to box #7 (total valid votes).
const { allNumbers } = require('./helpers');

module.exports = function a1(sheet) {
  const parties = sheet.parties || [];
  if (parties.length === 0) return null; // blank sheet is handled by D3
  const figures = parties.map((p) => p.figures);
  const { validTotal } = sheet.counts;
  if (!allNumbers([...figures, validTotal])) return null; // unreadable, skip

  const partiesSum = figures.reduce((a, b) => a + b, 0);
  if (partiesSum === validTotal) return null;

  return {
    code: 'A1',
    severity: 'error',
    details: { partiesSum, validTotal, difference: partiesSum - validTotal },
  };
};
