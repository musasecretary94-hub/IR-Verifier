// Runs every check on one sheet and returns the list of findings.
// Each check returns null (passed or skipped) or a finding object.
//
// sheet shape (after the AI reading has been normalized):
// {
//   counts: { registered, accredited, issued, unused, spoiled, rejected, validTotal, usedTotal },
//   parties: [{ party: 'A', figures: 225, words: 'two hundred and twenty five', readability: 'clear' }],
//   totalValidRow: 413,
//   totalValidRowWords: 'four hundred and thirteen',   (optional)
//   readability: { accredited: 'clear', ... },          (optional)
//   imageQuality: 'ok' | 'poor' | 'blank'               (optional)
// }
// Any value that could not be read is null.

const RULES = [
  require('./a1-parties-sum'),
  require('./a2-total-row'),
  require('./a3-used-ballots'),
  require('./a4-votes-vs-accredited'),
  require('./a5-accredited-vs-registered'),
  require('./a6-issued-ballots'),
  require('./a7-used-below-accredited'),
  require('./b1-figures-vs-words'),
  require('./b2-words-missing'),
  require('./d1-unreadable-fields'),
  require('./d2-poor-image'),
  require('./d3-blank-sheet'),
];

function runChecks(sheet) {
  return RULES.map((rule) => rule(sheet)).filter(Boolean);
}

module.exports = { runChecks, RULES };
