// A5: accredited voters (#2) cannot be higher than registered voters (#1).
const { allNumbers } = require('./helpers');

module.exports = function a5(sheet) {
  const { registered, accredited } = sheet.counts;
  if (!allNumbers([registered, accredited])) return null;
  if (accredited <= registered) return null;

  return {
    code: 'A5',
    severity: 'error',
    details: { registered, accredited, excess: accredited - registered },
  };
};
