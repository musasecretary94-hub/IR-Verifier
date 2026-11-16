// Checks the shape of what an agent sends and turns it into the "AI output" shape
// that the normalizer already understands. Anything unknown is thrown away.
const { HttpError } = require('../middleware/errors');

const COUNT_FIELDS = ['registered', 'accredited', 'issued', 'unused', 'spoiled', 'rejected', 'validTotal', 'usedTotal'];
const AI_KEYS = { validTotal: 'valid_total', usedTotal: 'used_total' };

const bad = (msg) => new HttpError(400, 'bad_values', msg);

function cleanCell(v, field) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0 || v > 5000000) throw bad(`${field}: number out of range`);
    return v;
  }
  if (typeof v === 'string') {
    if (v.length > 12) throw bad(`${field}: too long`);
    return v;
  }
  throw bad(`${field}: must be a number`);
}

function cleanText(v, max, field) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') throw bad(`${field}: must be text`);
  const t = v.trim();
  if (t.length > max) throw bad(`${field}: too long`);
  return t;
}

function sanitizeValues(values, parties) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw bad('values are missing');
  const header = values.header && typeof values.header === 'object' ? values.header : {};
  const counts = values.counts && typeof values.counts === 'object' ? values.counts : {};

  const out = {
    header: {
      puCode: cleanText(header.puCode, 30, 'puCode'),
      serialNo: cleanText(header.serialNo, 30, 'serialNo'),
    },
    counts: {},
    parties: [],
    totalValidRow: cleanCell(values.totalValidRow, 'totalValidRow'),
    totalValidRowWords: cleanText(values.totalValidRowWords, 120, 'totalValidRowWords'),
  };
  COUNT_FIELDS.forEach((f) => { out.counts[f] = cleanCell(counts[f], f); });

  const given = Array.isArray(values.parties) ? values.parties : [];
  if (given.length > 60) throw bad('too many parties');
  const byName = new Map();
  given.forEach((p) => {
    if (p && typeof p === 'object' && typeof p.party === 'string') byName.set(p.party, p);
  });
  parties.forEach((name) => {
    const p = byName.get(name) || {};
    out.parties.push({
      party: name,
      figures: cleanCell(p.figures, 'party ' + name),
      words: cleanText(p.words, 120, 'words ' + name),
    });
  });
  return out;
}

// Same shape the AI reader returns (see data/sample-extraction.json).
function toRaw(clean, imageQuality) {
  const raw = {
    header: { pu_code: clean.header.puCode, serial_no: clean.header.serialNo },
    counts: {},
    parties: clean.parties.map((p) => {
      const row = { party: p.party, figures: p.figures };
      if (p.words) row.words = p.words;
      return row;
    }),
    total_valid_row: { figures: clean.totalValidRow },
  };
  if (clean.totalValidRowWords) raw.total_valid_row.words = clean.totalValidRowWords;
  COUNT_FIELDS.forEach((f) => { raw.counts[AI_KEYS[f] || f] = clean.counts[f]; });
  if (imageQuality) raw.image_quality = imageQuality;
  return raw;
}

// The other direction: a normalized sheet back to what the form shows.
function sheetToValues(sheet) {
  return {
    header: { puCode: sheet.header.puCode || '', serialNo: sheet.header.serialNo || '' },
    counts: { ...sheet.counts },
    parties: sheet.parties.map((p) => ({ party: p.party, figures: p.figures, words: p.words || '' })),
    totalValidRow: sheet.totalValidRow,
    totalValidRowWords: sheet.totalValidRowWords || '',
  };
}

module.exports = { sanitizeValues, toRaw, sheetToValues, COUNT_FIELDS };
