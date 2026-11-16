import { L, num, pct, COUNT_ORDER, countLabel } from '../i18n.js'

// The numbers of one polling unit: the 8 boxes and the votes of each party.
export default function ResultTable({ counts, votes, lang }) {
  const total = counts.validTotal
  return (
    <div className="two-tables">
      <table>
        <tbody>
          {COUNT_ORDER.map((k) => (
            <tr key={k}>
              <th>{countLabel(lang, k)}</th>
              <td className="right">{num(counts[k])}</td>
            </tr>
          ))}
          {counts.totalValidRow !== undefined && (
            <tr>
              <th>{L(lang, 'Total valid votes (bottom line)', 'Jimillar ƙuri’u masu inganci (layin ƙasa)')}</th>
              <td className="right">{num(counts.totalValidRow)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>{L(lang, 'Party', 'Jam’iyya')}</th>
            <th className="right">{L(lang, 'Votes', 'Ƙuri’u')}</th>
            <th className="right">%</th>
          </tr>
        </thead>
        <tbody>
          {votes.map((v) => (
            <tr key={v.party}>
              <td>{v.party}</td>
              <td className="right">{num(v.votes)}</td>
              <td className="right">{pct(v.votes, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
