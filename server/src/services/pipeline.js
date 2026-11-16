// Steps 2, 3 and 4 in one call: NORMALIZE -> CHECK -> ROUTE.
// Input: what the AI reader returned. Output: the clean sheet, its status,
// the findings, and notes about anything the normalizer changed.
const { normalizeSheet } = require('./normalize');
const { validateSheet } = require('./validation');

function analyzeExtraction(raw) {
  const { sheet, notes } = normalizeSheet(raw);
  const { status, findings } = validateSheet(sheet);
  return { sheet, status, findings, notes };
}

module.exports = { analyzeExtraction };
