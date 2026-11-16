// Turns number words written on a result sheet into a number.
//   "TWO HUNDRED AND TWENTY FIVE" -> 225
//   "NIL" -> 0
// Returns null when the words cannot be understood (never guesses).

const UNITS = new Map(Object.entries({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }));
const TEENS = new Map(Object.entries({ ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }));
const TENS = new Map(Object.entries({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }));
const ZERO_WORDS = ['nil', 'zero', 'none', 'nought'];

// Understands a group below 1000, e.g. ['two','hundred','twenty','five'] -> 225
function parseGroup(tokens) {
  let i = 0;
  let value = 0;

  // optional "<unit> hundred" at the start
  if (UNITS.has(tokens[i]) && tokens[i + 1] === 'hundred') {
    value = UNITS.get(tokens[i]) * 100;
    i += 2;
  }

  const rest = tokens.slice(i);
  if (rest.length === 0) return value > 0 ? value : null;

  if (rest.length === 1) {
    const w = rest[0];
    const n = UNITS.get(w) ?? TEENS.get(w) ?? TENS.get(w);
    return n === undefined ? null : value + n;
  }

  if (rest.length === 2 && TENS.has(rest[0]) && UNITS.has(rest[1])) {
    return value + TENS.get(rest[0]) + UNITS.get(rest[1]);
  }

  return null;
}

function parseWords(text) {
  if (typeof text !== 'string') return null;

  const tokens = text
    .toLowerCase()
    .replace(/[-,.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && t !== 'and');

  if (tokens.length === 0) return null;
  if (tokens.length === 1 && ZERO_WORDS.includes(tokens[0])) return 0;

  const thousandAt = tokens.indexOf('thousand');
  if (thousandAt === -1) return parseGroup(tokens);
  if (tokens.indexOf('thousand', thousandAt + 1) !== -1) return null; // two "thousand" words

  const before = parseGroup(tokens.slice(0, thousandAt));
  if (before === null) return null;

  const afterTokens = tokens.slice(thousandAt + 1);
  const after = afterTokens.length === 0 ? 0 : parseGroup(afterTokens);
  if (after === null) return null;

  return before * 1000 + after;
}

module.exports = { parseWords };
