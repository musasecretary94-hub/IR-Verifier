// A7 (info): used ballots (#8) are LOWER than accredited voters (#2).
// This can be normal (a person may be accredited and then not vote),
// so it is only information, not a problem.
const { allNumbers } = require('./helpers');

module.exports = function a7(sheet) {
  const { accredited, usedTotal } = sheet.counts;
  if (!allNumbers([accredited, usedTotal])) return null;
  if (usedTotal >= accredited) return null;

  return {
    code: 'A7',
    severity: 'info',
    details: { accredited, usedTotal, difference: accredited - usedTotal },
  };
};
