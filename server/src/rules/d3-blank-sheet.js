// D3 (warning): the sheet is blank (nothing could be read from it).
const { isBlankSheet } = require('./sheetState');

module.exports = function d3(sheet) {
  if (!isBlankSheet(sheet)) return null;
  return { code: 'D3', severity: 'warning', details: { imageQuality: sheet.imageQuality ?? null } };
};
