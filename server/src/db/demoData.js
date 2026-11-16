// Synthetic data for the demo: a small registry and made-up (but consistent) result sheets.
// Everything here is invented. Nothing is real.
const crypto = require('node:crypto');
const { PARTIES } = require('../config/elections');

const STATES = [['Kano', 'KN'], ['Lagos', 'LA'], ['Oyo', 'OY']];

function seedRegistry(db, { lgasPerState = 2, wardsPerLga = 3, unitsPerWard = 4 } = {}) {
  const insert = db.prepare('INSERT OR IGNORE INTO polling_units (code, name, ward, lga, state, registered) VALUES (?, ?, ?, ?, ?, ?)');
  let n = 0;
  STATES.forEach(([state, sc]) => {
    for (let l = 1; l <= lgasPerState; l++) {
      for (let w = 1; w <= wardsPerLga; w++) {
        for (let u = 1; u <= unitsPerWard; u++) {
          n++;
          const p2 = (x) => String(x).padStart(2, '0');
          const code = `${sc}-${p2(l)}-${p2(w)}-${String(u).padStart(3, '0')}`;
          const registered = 420 + ((n * 137) % 380);
          insert.run(code, `Demo Primary School ${n}`, `${state} Ward ${p2(w)}`, `${state} LGA ${p2(l)}`, state, registered);
        }
      }
    }
  });
  return db.prepare('SELECT COUNT(*) AS n FROM polling_units').get().n;
}

function rng(seedText) {
  let a = crypto.createHash('sha256').update(seedText).digest().readUInt32LE(0);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Consistent numbers for one polling unit: every check passes.
function makeSheetNumbers(pu) {
  const r = rng('sheet:' + pu.code);
  const registered = pu.registered;
  const accredited = Math.floor(registered * (0.45 + r() * 0.25));
  const spoiled = Math.floor(r() * 4);
  const rejected = Math.floor(accredited * (0.005 + r() * 0.02));
  const usedTotal = accredited;
  const validTotal = usedTotal - spoiled - rejected;
  const weights = PARTIES.map(() => Math.pow(r(), 2) + 0.05);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const votes = weights.map((w) => Math.floor((w / sumW) * validTotal));
  votes[0] += validTotal - votes.reduce((a, b) => a + b, 0); // make the total exact
  return {
    counts: { registered, accredited, issued: registered, unused: registered - usedTotal, spoiled, rejected, validTotal, usedTotal },
    parties: PARTIES.map((p, i) => ({ party: p, figures: votes[i] })),
    totalValidRow: validTotal,
    serialNo: String(1000000 + (pu.id || 0)),
  };
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
function below1000(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h ? ONES[h] + ' hundred' + (rest ? ' and ' : '') : '') + (rest ? below100(rest) : '');
}
function numberToWords(n) {
  if (n === 0) return 'nil';
  const th = Math.floor(n / 1000);
  const rest = n % 1000;
  return (th ? below1000(th) + ' thousand' + (rest ? (rest < 100 ? ' and ' : ' ') : '') : '') + (rest ? below1000(rest) : '');
}

// Builds the "values" an agent would type for a demo sheet.
function sheetToAgentValues(pu, s, { withWords = true } = {}) {
  return {
    header: { puCode: pu.code, serialNo: s.serialNo },
    counts: { ...s.counts },
    parties: s.parties.map((p) => ({ party: p.party, figures: p.figures, words: withWords ? numberToWords(p.figures) : '' })),
    totalValidRow: s.totalValidRow,
    totalValidRowWords: withWords ? numberToWords(s.totalValidRow) : '',
  };
}

module.exports = { STATES, seedRegistry, makeSheetNumbers, numberToWords, sheetToAgentValues, rng };
