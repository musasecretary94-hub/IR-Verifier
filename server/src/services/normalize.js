// Step 2 of the algorithm: NORMALIZE.
//
// Takes what the AI reader returned (raw JSON, written exactly as on the sheet)
// and turns it into the "sheet" shape that the checks understand.
//
//   "-03-"  -> 3        (dashes around a number are decoration)
//   "-"     -> 0        (a lone dash means none)
//   "1,200" -> 1200
//   null    -> null     (could not be read: the checks skip it, D1 reports it)
//   "abc"   -> null     (never a guess)
//
// It never fixes or invents numbers. Every change it makes is written to `notes`
// so a person can see what was changed.

// AI json key -> sheet key
const COUNT_KEYS = [
  ['registered', 'registered'],
  ['accredited', 'accredited'],
  ['issued', 'issued'],
  ['unused', 'unused'],
  ['spoiled', 'spoiled'],
  ['rejected', 'rejected'],
  ['valid_total', 'validTotal'],
  ['used_total', 'usedTotal'],
];

const HEADER_KEYS = [
  ['state_code', 'stateCode'],
  ['lga_code', 'lgaCode'],
  ['ra_code', 'raCode'],
  ['pu_code', 'puCode'],
  ['serial_no', 'serialNo'],
];

// hyphen, several kinds of dash, and the minus sign
const DASHES = '-\u2010\u2011\u2012\u2013\u2014\u2212';
const ONLY_DASHES = new RegExp('^[' + DASHES + '\\s]+$');
const EDGE_DASHES = new RegExp('^[' + DASHES + '\\s]+|[' + DASHES + '\\s]+$', 'g');

const LEVELS = ['clear', 'unclear', 'illegible'];
const QUALITIES = ['ok', 'poor', 'blank'];

function toNumber(value, field, notes) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    if (Number.isInteger(value) && value >= 0) return value;
    notes.push({ field, from: value, to: null, reason: 'not_a_number' });
    return null;
  }

  if (typeof value !== 'string') {
    notes.push({ field, from: value, to: null, reason: 'not_a_number' });
    return null;
  }

  const text = value.trim();
  if (text === '') return null;

  if (ONLY_DASHES.test(text)) {
    notes.push({ field, from: value, to: 0, reason: 'dash_to_zero' });
    return 0;
  }

  let cleaned = text.replace(EDGE_DASHES, '');
  if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/,/g, '');

  if (/^\d+$/.test(cleaned)) {
    const n = parseInt(cleaned, 10);
    if (cleaned !== text) notes.push({ field, from: value, to: n, reason: 'cleaned' });
    return n;
  }

  notes.push({ field, from: value, to: null, reason: 'not_a_number' });
  return null;
}

// A field can arrive as { v: 966, l: 'clear' } or as a plain value.
function readField(x) {
  if (x && typeof x === 'object' && !Array.isArray(x) && 'v' in x) {
    return { value: x.v, level: x.l };
  }
  return { value: x, level: undefined };
}

// Missing -> undefined. Known word -> itself. Anything else -> 'unclear' (the careful choice).
function normalizeLevel(l) {
  if (l === undefined || l === null) return undefined;
  const text = String(l).trim().toLowerCase();
  return LEVELS.includes(text) ? text : 'unclear';
}

function normalizeQuality(q) {
  if (typeof q !== 'string') return undefined;
  const text = q.trim().toLowerCase();
  return QUALITIES.includes(text) ? text : undefined;
}

function cleanWords(w) {
  if (typeof w !== 'string') return null;
  const text = w.trim();
  return text === '' ? null : text;
}

function cleanText(t) {
  if (t === null || t === undefined) return null;
  const text = String(t).trim();
  return text === '' ? null : text;
}

function normalizeSheet(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const notes = [];
  const readability = {};

  const header = {};
  const rawHeader = input.header || {};
  HEADER_KEYS.forEach(([aiKey, key]) => { header[key] = cleanText(rawHeader[aiKey]); });

  const counts = {};
  const rawCounts = input.counts || {};
  COUNT_KEYS.forEach(([aiKey, key]) => {
    const { value, level } = readField(rawCounts[aiKey]);
    counts[key] = toNumber(value, key, notes);
    const lv = normalizeLevel(level);
    if (lv) readability[key] = lv;
  });

  const parties = (Array.isArray(input.parties) ? input.parties : []).map((item, i) => {
    const p = item && typeof item === 'object' ? item : {};
    const name = cleanText(p.party) || '?' + (i + 1);
    const out = { party: name, figures: toNumber(p.figures, 'party:' + name, notes) };
    if ('words' in p) out.words = cleanWords(p.words);
    const lv = normalizeLevel(p.l);
    if (lv) out.readability = lv;
    return out;
  });

  const row = input.total_valid_row && typeof input.total_valid_row === 'object' ? input.total_valid_row : {};
  const sheet = {
    header,
    counts,
    parties,
    totalValidRow: toNumber(row.figures, 'totalValidRow', notes),
    readability,
  };
  if ('words' in row) sheet.totalValidRowWords = cleanWords(row.words);
  const rowLevel = normalizeLevel(row.l);
  if (rowLevel) readability.totalValidRow = rowLevel;

  const quality = normalizeQuality(input.image_quality);
  if (quality) sheet.imageQuality = quality;

  return { sheet, notes };
}

module.exports = { normalizeSheet, toNumber };
