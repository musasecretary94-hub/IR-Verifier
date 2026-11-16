// Step "CHECK + ROUTE": runs all checks on a sheet and decides its status.
//   'clean'        -> no error and no warning (info alone is fine)
//   'needs_review' -> at least one error or warning: a person must look
//
// This is also where the old gap is closed: a sheet with unreadable fields
// gets a D1 warning, so it can never look "clean" by accident.
const { runChecks } = require('../rules');

function validateSheet(sheet) {
  const findings = runChecks(sheet);
  const needsReview = findings.some((f) => f.severity === 'error' || f.severity === 'warning');
  return { status: needsReview ? 'needs_review' : 'clean', findings };
}

module.exports = { validateSheet };
