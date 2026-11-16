import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { L, when } from '../i18n.js'
import FindingsList from './FindingsList.jsx'
import AuthedImage from './AuthedImage.jsx'
import ResultTable from './ResultTable.jsx'

const TABS = [
  ['pending', 'Waiting', 'Ana jira'],
  ['approved', 'Approved', 'An amince'],
  ['rejected', 'Rejected', 'An ƙi'],
]

function Detail({ token, id, lang, onBack, onDecided, onUnauthorized }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setD(null)
    api('/api/admin/submissions/' + id, { token })
      .then(setD)
      .catch((e) => (e.status === 401 ? onUnauthorized() : setError(e.message)))
  }, [id, token, onUnauthorized])

  async function decide(kind) {
    if (kind === 'approve' && !window.confirm(L(lang, 'Approve this result? It will become public.', 'A amince da wannan sakamakon? Zai bayyana ga jama’a.'))) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/submissions/${id}/${kind}`, { method: 'POST', token, body: kind === 'reject' ? { reason } : {} })
      onDecided()
    } catch (e) {
      if (e.status === 401) onUnauthorized()
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!d) return <p className="muted">{error || '…'}</p>
  const counts = { ...d.counts }
  return (
    <div className="card">
      <button onClick={onBack}>← {L(lang, 'Back to the list', 'Koma jeri')}</button>
      <h2>{d.unit.code} · {d.unit.name}</h2>
      <p>{d.unit.ward} · {d.unit.lga} · {d.unit.state} · Version {d.version} · {L(lang, 'Agent', 'Wakili')}: {d.agent} · S/N {d.serialNo}</p>
      <p className="warn-box">
        {L(lang, 'You can only approve or reject. You cannot change the numbers.', 'Za ka iya amincewa ko ƙi kawai. Ba ka da ikon canza lambobin.')}
      </p>
      <div className="agent-grid">
        <div>
          <h3>{L(lang, 'Photo of the sheet', 'Hoton fom')}</h3>
          <AuthedImage path={`/api/admin/submissions/${id}/image`} token={token} alt="sheet" />
        </div>
        <div>
          <h3>{L(lang, 'Numbers typed by the agent', 'Lambobin da wakili ya rubuta')}</h3>
          <ResultTable counts={counts} votes={d.votes} lang={lang} />
          <h3>{L(lang, 'Checks', 'Bincike')}</h3>
          <FindingsList findings={d.findings} lang={lang} />
          {d.agentNote && <p className="card note"><strong>{L(lang, 'Agent note: ', 'Bayanin wakili: ')}</strong>{d.agentNote}</p>}
        </div>
      </div>

      {d.history.length > 1 && (
        <>
          <h3>{L(lang, 'Earlier attempts for this polling unit', 'Ƙoƙarin da aka yi a baya don wannan rumfa')}</h3>
          <ul>
            {d.history.map((h) => (
              <li key={h.id}>Version {h.version}: {h.status}{h.review_reason ? ' (' + h.review_reason + ')' : ''}</li>
            ))}
          </ul>
        </>
      )}

      {d.status === 'pending' ? (
        <div className="decision">
          {error && <p className="error-text" role="alert">{error}</p>}
          <button className="primary" disabled={busy} onClick={() => decide('approve')}>{L(lang, 'Approve', 'Amince')}</button>
          <label>
            {L(lang, 'Reason for rejecting (at least 10 letters)', 'Dalilin ƙi (aƙalla haruffa 10)')}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          </label>
          <button className="danger" disabled={busy || reason.trim().length < 10} onClick={() => decide('reject')}>{L(lang, 'Reject', 'Ƙi')}</button>
        </div>
      ) : (
        <p className={'status ' + d.status}>
          {d.status === 'approved' ? L(lang, 'Approved', 'An amince') : L(lang, 'Rejected', 'An ƙi')} · {when(d.reviewedAt)} · {d.reviewer}
          {d.reviewReason && <> · {d.reviewReason}</>}
        </p>
      )}
    </div>
  )
}

export default function AdminDashboard({ session, lang, onLogout }) {
  const token = session.token
  const [tab, setTab] = useState('pending')
  const [list, setList] = useState(null)
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([
        api('/api/admin/submissions?status=' + tab, { token }),
        api('/api/admin/stats', { token }),
      ])
      setList(l)
      setStats(s)
      setError('')
    } catch (e) {
      if (e.status === 401) onLogout()
      else setError(e.message)
    }
  }, [tab, token, onLogout])
  useEffect(() => { load() }, [load])

  if (selected) {
    return (
      <Detail
        token={token}
        id={selected}
        lang={lang}
        onUnauthorized={onLogout}
        onBack={() => { setSelected(null); load() }}
        onDecided={() => { setSelected(null); load() }}
      />
    )
  }

  return (
    <div>
      <div className="card">
        <h2>{L(lang, 'Admin: review results', 'Admin: duba sakamako')}</h2>
        {stats && (
          <div className="stats">
            <div><strong>{stats.pending}</strong><span>{L(lang, 'waiting', 'ana jira')}</span></div>
            <div><strong>{stats.approved}</strong><span>{L(lang, 'approved', 'an amince')}</span></div>
            <div><strong>{stats.rejected}</strong><span>{L(lang, 'rejected', 'an ƙi')}</span></div>
            <div><strong>{stats.totalUnits}</strong><span>{L(lang, 'polling units', 'rumfuna')}</span></div>
          </div>
        )}
        <div className="tabs">
          {TABS.map(([key, en, ha]) => (
            <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>{L(lang, en, ha)}</button>
          ))}
        </div>
        {error && <p className="error-text">{error}</p>}
        {!list ? <p className="muted">…</p> : list.items.length === 0 ? (
          <p className="muted">{L(lang, 'Nothing here.', 'Babu komai a nan.')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{L(lang, 'Unit', 'Rumfa')}</th><th>{L(lang, 'Ward / LGA / State', 'Mazaɓa / ƙaramar hukuma / Jiha')}</th>
                  <th>{L(lang, 'Sent', 'An aika')}</th><th>{L(lang, 'Warnings', 'Gargaɗi')}</th><th />
                </tr>
              </thead>
              <tbody>
                {list.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.code}<br /><span className="muted">{i.name}</span></td>
                    <td>{i.ward} / {i.lga} / {i.state}</td>
                    <td>{when(i.submitted_at)}</td>
                    <td>{i.warnings}</td>
                    <td><button onClick={() => setSelected(i.id)}>{L(lang, 'Open', 'Buɗe')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list && list.total > list.items.length && <p className="muted">{L(lang, 'Showing the first ', 'Ana nuna na farko ')}{list.items.length} / {list.total}</p>}
      </div>
    </div>
  )
}
