// Tiny language helper: L(lang, 'English text', 'Hausa text')
export const L = (lang, en, ha) => (lang === 'ha' ? ha : en)

export const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-NG'))
export const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) + '%' : '0%')
export const when = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '')

export const COUNT_LABELS = {
  registered: ['Registered voters (#1)', 'Masu rajista (#1)'],
  accredited: ['Accredited voters (#2)', 'Waɗanda aka tantance (#2)'],
  issued: ['Ballot papers issued (#3)', 'Takardun zaɓe da aka bayar (#3)'],
  unused: ['Unused ballot papers (#4)', 'Takardun da ba a yi amfani da su ba (#4)'],
  spoiled: ['Spoiled ballots (#5)', 'Takardun da suka lalace (#5)'],
  rejected: ['Rejected ballots (#6)', 'Takardun da aka ƙi (#6)'],
  validTotal: ['Total valid votes (#7)', 'Jimillar ƙuri’u masu inganci (#7)'],
  usedTotal: ['Total used ballots (#8)', 'Jimillar takardun da aka yi amfani da su (#8)'],
}
export const COUNT_ORDER = ['registered', 'accredited', 'issued', 'unused', 'spoiled', 'rejected', 'validTotal', 'usedTotal']
export const countLabel = (lang, key) => COUNT_LABELS[key][lang === 'ha' ? 1 : 0]
