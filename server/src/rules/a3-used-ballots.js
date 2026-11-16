// A3: box #8 (total used ballots) must equal #5 + #6 + #7.
// Note: a dash in box #5 means none, so the normalizer should turn it into 0
// BEFORE this check runs. A real null (unreadable) is skipped.
const { allNumbers } = require('./helpers');

module.exports = function a3(sheet) {
  const { spoiled, rejected, validTotal, usedTotal } = sheet.counts;
  if (!allNumbers([spoiled, rejected, validTotal, usedTotal])) return null;

  const expectedUsed = spoiled + rejected + validTotal;
  if (usedTotal === expectedUsed) return null;

  return {
    code: 'A3',
    severity: 'error',
    details: { usedTotal, spoiled, rejected, validTotal, expectedUsed, difference: usedTotal - expectedUsed },
  };
};
