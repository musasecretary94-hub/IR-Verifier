import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { L, num, pct, when } from '../i18n.js'
import AuthedImage from './AuthedImage.jsx'
import ResultTable from './ResultTable.jsx'

function UnitPanel({ code, lang, onClose }) {
  const [u, setU] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setU(null)
    api('/api/public/units/' + encodeURIComponent(code)).then(setU).catch((e) => setErr(e.message))
  }, [code])
  if (err) return <p className="error-text">{err}</p>
  if (!u) return <p className="muted">…</p>
  return (
    <div className="card">
      <button onClick={onClose}>{L(lang, 'Close', 'Rufe')}</button>
      <h3>{u.unit.code} · {u.unit.name}</h3>
      <p className="muted">{u.unit.ward} · {u.unit.lga} · {u.unit.state}</p>
      {!u.approved ? (
        <p className="warn-box">{L(lang, 'No approved result for this polling unit yet.', 'Ba a riga an amince da sakamakon wannan rumfa ba.')}</p>
      ) : (
        <div className="agent-grid">
          <div>
            <ResultTable counts={u.counts} votes={u.parties} lang={lang} />
            <p className="muted">{L(lang, 'Approved on ', 'An amince a ')}{when(u.approvedAt)}</p>
          </div>
          <div>
            <h4>{L(lang, 'Photo of the result sheet', 'Hoton fom ɗin sakamako')}</h4>
            <AuthedImage path={`/api/public/units/${encodeURIComponent(code)}/image`} alt="sheet" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function PublicPage({ lang }) {
  const [path, setPath] = useState({})
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [unit, setUnit] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    setData(null)
    setError('')
    const q = new URLSearchParams(Object.entries(path).filter(([, v]) => v)).toString()
    api('/api/public/results' + (q ? '?' + q : ''))
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => { live = false }
  }, [path, tick])

  const crumbs = [{ label: L(lang, 'Nigeria (demo)', 'Najeriya (gwaji)'), path: {} }]
  if (path.state) crumbs.push({ label: path.state, path: { state: path.state } })
  if (path.lga) crumbs.push({ label: path.lga, path: { state: path.state, lga: path.lga } })
  if (path.ward) crumbs.push({ label: path.ward, path })

  function open(child) {
    if (child.type === 'unit') setUnit(child.code)
    else setPath({ ...path, [child.type]: child.name })
  }

  if (error) return <p className="error-text">{error}</p>
  if (!data) return <p className="muted">…</p>

  const t = data.totals
  const LEVEL = { state: ['State', 'Jiha'], lga: ['LGA', 'Ƙaramar hukuma'], ward: ['Ward', 'Mazaɓa'], unit: ['Polling unit', 'Rumfa'] }

  return (
    <div>
      <div className="card">
        <nav className="crumbs" aria-label="breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && ' › '}
              {i < crumbs.length - 1 ? <a href="#/" onClick={(e) => { e.preventDefault(); setUnit(null); setPath(c.path) }}>{c.label}</a> : <strong>{c.label}</strong>}
            </span>
          ))}
          <button className="small" onClick={() => setTick(tick + 1)}>{L(lang, 'Refresh', 'Sabunta')}</button>
        </nav>

        <div className="stats">
          <div>
            <strong>{data.coverage.approvedUnits} / {data.coverage.units}</strong>
            <span>{L(lang, 'polling units approved', 'rumfuna da aka amince')} ({pct(data.coverage.approvedUnits, data.coverage.units)})</span>
          </div>
          <div><strong>{num(t.validTotal)}</strong><span>{L(lang, 'valid votes counted', 'ƙuri’u masu inganci da aka ƙirga')}</span></div>
          <div><strong>{num(t.accredited)}</strong><span>{L(lang, 'accredited voters', 'waɗanda aka tantance')}</span></div>
        </div>
        {data.coverage.approvedUnits < data.coverage.units && (
          <p className="warn-box">
            {L(lang, 'These are PARTIAL totals: only approved polling units are counted.', 'Waɗannan jimillar BAYAN WANI ƊAN ɓangare ne kawai: rumfunan da aka amince da su ne kaɗai aka ƙirga.')}
          </p>
        )}
      </div>

      {unit && <UnitPanel code={unit} lang={lang} onClose={() => setUnit(null)} />}

      <div className="card">
        <h3>{L(lang, 'Votes by party', 'Ƙuri’u ta jam’iyya')}</h3>
        <table>
          <thead><tr><th>{L(lang, 'Party', 'Jam’iyya')}</th><th className="right">{L(lang, 'Votes', 'Ƙuri’u')}</th><th>%</th></tr></thead>
          <tbody>
            {data.parties.map((p) => (
              <tr key={p.party}>
                <td>{p.party}</td>
                <td className="right">{num(p.votes)}</td>
                <td className="barcell">
                  <div className="bar"><span style={{ width: pct(p.votes, t.validTotal) }} /></div>
                  {pct(p.votes, t.validTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>{L(lang, ...LEVEL[data.childLevel])}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L(lang, 'Name', 'Suna')}</th>
                <th>{L(lang, 'Approved', 'An amince')}</th>
                <th className="right">{L(lang, 'Valid votes', 'Ƙuri’u masu inganci')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.children.map((c) => (
                <tr key={c.code || c.name}>
                  <td>{c.type === 'unit' ? <>{c.code}<br /><span className="muted">{c.name}</span></> : c.name}</td>
                  <td>{c.type === 'unit' ? (c.approved ? '✔' : '—') : `${c.approvedUnits} / ${c.units}`}</td>
                  <td className="right">{c.type === 'unit' && !c.approved ? '' : num(c.validTotal)}</td>
                  <td><button className="small" onClick={() => open(c)}>{L(lang, 'Open', 'Buɗe')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
