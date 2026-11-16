// Small helpers shared by the checks.
// A value that could not be read is stored as null. A check that needs a
// null value does NOT fail: it is skipped, because "could not read" is
// a photo/reading problem (check D1), not a problem with the sheet itself.

function isNum(v) {
  return Number.isInteger(v) && v >= 0;
}

function allNumbers(values) {
  return values.every(isNum);
}

module.exports = { isNum, allNumbers };
