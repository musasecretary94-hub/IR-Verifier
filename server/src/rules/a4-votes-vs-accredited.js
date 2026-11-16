// A4: valid votes (#7) and used ballots (#8) cannot be higher than
// the number of accredited voters (#2).
const { isNum } = require('./helpers');

module.exports = function a4(sheet) {
  const { accredited, validTotal, usedTotal } = sheet.counts;
  if (!isNum(accredited)) return null;

  const problems = [];
  if (isNum(validTotal) && validTotal > accredited) {
    problems.push({ field: 'validTotal', value: validTotal, excess: validTotal - accredited });
  }
  if (isNum(usedTotal) && usedTotal > accredited) {
    problems.push({ field: 'usedTotal', value: usedTotal, excess: usedTotal - accredited });
  }
  if (problems.length === 0) return null;

  return {
    code: 'A4',
    severity: 'error',
    details: { accredited, problems },
  };
};
