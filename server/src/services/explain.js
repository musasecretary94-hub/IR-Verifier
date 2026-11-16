// Step 9: EXPLAIN. Turns a finding into plain English and Hausa.
// Every message is a template filled with the numbers from the finding's details.
// It describes what does not add up. It never says anyone cheated.

const FIELD_LABELS = {
  registered: ['Registered voters (#1)', 'Masu rajista (#1)'],
  accredited: ['Accredited voters (#2)', 'Waɗanda aka tantance (#2)'],
  issued: ['Ballot papers issued (#3)', 'Takardun zaɓe da aka bayar (#3)'],
  unused: ['Unused ballot papers (#4)', 'Takardun da ba a yi amfani da su ba (#4)'],
  spoiled: ['Spoiled ballots (#5)', 'Takardun da suka lalace (#5)'],
  rejected: ['Rejected ballots (#6)', 'Takardun da aka ƙi (#6)'],
  validTotal: ['Total valid votes (#7)', 'Jimillar ƙuri’u masu inganci (#7)'],
  usedTotal: ['Total used ballots (#8)', 'Jimillar takardun da aka yi amfani da su (#8)'],
  totalValidRow: ['Total valid votes (bottom line)', 'Jimillar ƙuri’u masu inganci (layin ƙasa)'],
  serialNo: ['Serial number (S/N)', 'Lambar S/N'],
};

function label(field, i) {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field][i];
  if (String(field).startsWith('party:')) return (i === 0 ? 'Party ' : 'Jam’iyya ') + String(field).slice(6);
  return String(field);
}
const list = (items, i) => items.map((f) => label(f, i)).join(', ');

const T = {
  A1: (d) => ({
    en: `The party votes add up to ${d.partiesSum}, but box #7 (total valid votes) says ${d.validTotal}. Compare each party’s figure with the photo.`,
    ha: `Jimillar ƙuri’un jam’iyyu ita ce ${d.partiesSum}, amma akwati #7 (total valid votes) ya ce ${d.validTotal}. Ka kwatanta lambar kowace jam’iyya da hoton fom.`,
  }),
  A2: (d) => ({
    en: `The “Total valid votes” line at the bottom (${d.totalValidRow}) does not match box #7 (${d.validTotal}).`,
    ha: `Layin “Total valid votes” na ƙasan fom (${d.totalValidRow}) bai yi daidai da akwati #7 (${d.validTotal}) ba.`,
  }),
  A3: (d) => ({
    en: `Box #8 (total used ballots) is ${d.usedTotal}, but #5 + #6 + #7 = ${d.expectedUsed}.`,
    ha: `Akwati #8 (total used ballots) shi ne ${d.usedTotal}, amma #5 + #6 + #7 = ${d.expectedUsed}.`,
  }),
  A4: (d) => ({
    en: (d.problems || []).map((p) => `${label(p.field, 0)} is ${p.value}, which is ${p.excess} more than the accredited voters (${d.accredited}).`).join(' '),
    ha: (d.problems || []).map((p) => `${label(p.field, 1)} shi ne ${p.value}, ya fi waɗanda aka tantance (${d.accredited}) da ${p.excess}.`).join(' '),
  }),
  A5: (d) => ({
    en: `Accredited voters (${d.accredited}) are more than registered voters (${d.registered}).`,
    ha: `Waɗanda aka tantance (${d.accredited}) sun fi masu rajista (${d.registered}).`,
  }),
  A6: (d) => {
    const expected = d.expectedIssued ?? d.expectedIsssued;
    return {
      en: `Ballot papers issued (#3) is ${d.issued}, but unused (#4) + used (#8) = ${expected}.`,
      ha: `Takardun da aka bayar (#3) su ne ${d.issued}, amma waɗanda ba a yi amfani da su ba (#4) + waɗanda aka yi amfani da su (#8) = ${expected}.`,
    };
  },
  A7: (d) => ({
    en: `Used ballots (${d.usedTotal}) are fewer than accredited voters (${d.accredited}). This can be normal.`,
    ha: `Takardun da aka yi amfani da su (${d.usedTotal}) ba su kai waɗanda aka tantance (${d.accredited}) ba. Wannan na iya zama daidai.`,
  }),
  B1: (d) => ({
    en: (d.mismatches || []).map((m) => `${m.party}: figures say ${m.figures}, but the words say ${m.wordsValue}.`).join(' '),
    ha: (d.mismatches || []).map((m) => `${m.party}: lamba ta ce ${m.figures}, amma kalmomi sun ce ${m.wordsValue}.`).join(' '),
  }),
  B2: (d) => ({
    en: [
      (d.missing || []).length ? `The words are missing for: ${d.missing.join(', ')}.` : '',
      (d.notUnderstood || []).length ? `The words could not be understood for: ${d.notUnderstood.map((x) => x.party).join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    ha: [
      (d.missing || []).length ? `Babu kalmomi a: ${d.missing.join(', ')}.` : '',
      (d.notUnderstood || []).length ? `Ba a fahimci kalmomin: ${d.notUnderstood.map((x) => x.party).join(', ')} ba.` : '',
    ].filter(Boolean).join(' '),
  }),
  D1: (d) => ({
    en: [
      (d.unreadable || []).length ? `Could not be read: ${list(d.unreadable, 0)}.` : '',
      (d.unclear || []).length ? `Hard to read, please check: ${list(d.unclear, 0)}.` : '',
    ].filter(Boolean).join(' '),
    ha: [
      (d.unreadable || []).length ? `Ba a iya karanta: ${list(d.unreadable, 1)}.` : '',
      (d.unclear || []).length ? `Yana da wuyar karantawa, ka duba: ${list(d.unclear, 1)}.` : '',
    ].filter(Boolean).join(' '),
  }),
  D2: () => ({
    en: 'The photo is poor (blurry, cut off, or covered). Retake it if you can.',
    ha: 'Hoton ba shi da kyau (ya dushe, an yanke shi, ko wani abu ya rufe shi). Ka sake ɗaukarsa idan za ka iya.',
  }),
  D3: () => ({
    en: 'The sheet looks blank: no numbers could be read.',
    ha: 'Fom ɗin yana kama da babu komai a cikinsa: ba a iya karanta wata lamba ba.',
  }),
  C1: (d) => ({
    en: `The polling unit code entered (${d.entered || 'empty'}) does not match your polling unit (${d.expected}).`,
    ha: `Lambar rumfar da ka shigar (${d.entered || 'babu'}) ba ta yi daidai da rumfarka (${d.expected}) ba.`,
  }),
  C2: (d) => ({
    en: `An earlier submission for this polling unit (version ${d.version}) was ${d.status}.`,
    ha: `An taɓa aika sakamako don wannan rumfa a baya (version ${d.version}), matsayinsa: ${d.status}.`,
  }),
  C3: (d) => ({
    en: d.kind === 'serial'
      ? 'This serial number (S/N) was already used for another polling unit.'
      : 'This exact photo was already used for another polling unit.',
    ha: d.kind === 'serial'
      ? 'An riga an yi amfani da wannan lambar S/N don wata rumfa.'
      : 'An riga an yi amfani da wannan hoton don wata rumfa.',
  }),
  C4: (d) => ({
    en: `Registered voters on the sheet (${d.entered}) differ from the registry (${d.registry}).`,
    ha: `Masu rajista da ke kan fom (${d.entered}) sun bambanta da na rajista (${d.registry}).`,
  }),
  F1: (d) => ({
    en: `Please fill in every number (use 0 if the box shows none). Missing: ${list(d.missing || [], 0)}.`,
    ha: `Ka cike kowace lamba (ka sa 0 idan akwatin ba shi da komai). Abin da ya ɓace: ${list(d.missing || [], 1)}.`,
  }),
};

function explain(finding) {
  const make = T[finding.code];
  if (!make) return { en: `Check ${finding.code} needs a person to look.`, ha: `Binciken ${finding.code} yana buƙatar a duba shi.` };
  return make(finding.details || {});
}

// Adds a "message" to each finding. For agents we hide details that point to other polling units.
function decorate(findings, { forAgent = false } = {}) {
  return findings.map((f) => {
    const details = { ...(f.details || {}) };
    if (forAgent) delete details.otherUnit;
    return { code: f.code, severity: f.severity, details, message: explain({ ...f, details: f.details }) };
  });
}

module.exports = { explain, decorate, FIELD_LABELS };
