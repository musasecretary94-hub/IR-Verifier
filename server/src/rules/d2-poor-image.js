// D2 (warning): the photo is poor (blurry, cut off, stamp over the numbers).
// Blank sheets are reported by D3.
module.exports = function d2(sheet) {
  if (sheet.imageQuality !== 'poor') return null;
  return { code: 'D2', severity: 'warning', details: { imageQuality: sheet.imageQuality } };
};
