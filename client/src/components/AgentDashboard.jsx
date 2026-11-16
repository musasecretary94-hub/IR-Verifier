import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { L, when, COUNT_ORDER, countLabel } from '../i18n.js'
import { resizeImage } from '../utils/image.js'
import FindingsList from './FindingsList.jsx'
import AuthedImage from './AuthedImage.jsx'
import ResultTable from './ResultTable.jsx'

const STATUS = {
  pending: ['Waiting for review', 'Ana jiran dubawa'],
  approved: ['Approved and public', 'An amince, yana nan a bayyane'],
  rejected: ['Rejected', 'An ƙi'],
}

function emptyValues(parties) {
  return {
    header: { puCode: '', serialNo: '' },
    counts: Object.fromEntries(COUNT_ORDER.map((k) => [k, ''])),
    parties: parties.map((p) => ({ party: p, figures: '', words: '' })),
    totalValidRow: '',
    totalValidRowWords: '',
  }
}

function SubmissionForm({ token, config, lang, unit, onDone, onUnauthorized }) {
  const [values, setValues] = useState(() => emptyValues(config.parties))
  const [image, setImage] = useState(null)
  const [check, setCheck] = useState(null)
  const [note, setNote] = useState('')
  const [attested, setAttested] = useState(false)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [serverFindings, setServerFindings] = useState(null)
  const [aiNote, setAiNote] = useState('')
  const seq = useRef(0)
  const unauth = useRef(onUnauthorized)
  unauth.current = onUnauthorized

  // The server checks the numbers as you type (after a short pause).
  useEffect(() => {
    const mine = ++seq.current
    const timer = setTimeout(async () => {
      try {
        const r = await api('/api/agent/check', { method: 'POST', token, body: { values } })
        if (mine === seq.current) setCheck(r)
      } catch (e) {
        if (e.status === 401) unauth.current()
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [values, token])

  const setHeader = (k, v) => setValues((s) => ({ ...s, header: { ...s.header, [k]: v } }))
  const setCount = (k, v) => setValues((s) => ({ ...s, counts: { ...s.counts, [k]: v } }))
  const setParty = (i, k, v) => setValues((s) => ({ ...s, parties: s.parties.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }))

  async function onFile(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setMessage('')
    setBusy('photo')
    try {
      setImage(await resizeImage(file))
    } catch (err) {
      setImage(null)
      setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function readWithAI() {
    setBusy('ai')
    setMessage('')
    setAiNote('')
    try {
      const r = await api('/api/agent/extract', { method: 'POST', token, body: { image } })
      const v = r.values
      setValues({
        header: { puCode: v.header.puCode || '', serialNo: v.header.serialNo || '' },
        counts: Object.fromEntries(COUNT_ORDER.map((k) => [k, v.counts[k] ?? ''])),
        parties: config.parties.map((p) => {
          const f = v.parties.find((x) => x.party === p)
          return { party: p, figures: f && f.figures !== null ? f.figures : '', words: (f && f.words) || '' }
        }),
        totalValidRow: v.totalValidRow ?? '',
        totalValidRowWords: v.totalValidRowWords || '',
      })
      setAiNote(L(lang, 'The AI filled the form. Compare EVERY number with the photo and fix any mistake.', 'AI ya cike fom ɗin. Ka kwatanta KOWACE lamba da hoton, ka gyara kowane kuskure.'))
    } catch (err) {
      if (err.status === 401) onUnauthorized()
      else setMessage(err.message)
    } finally {
      setBusy('')
    }
  }

  async function submit() {
    setBusy('submit')
    setMessage('')
    setServerFindings(null)
    try {
      await api('/api/agent/submissions', { method: 'POST', token, body: { values, image, note, attested } })
      onDone()
    } catch (err) {
      if (err.status === 401) return onUnauthorized()
      setMessage(err.message)
      if (err.findings) setServerFindings(err.findings)
    } finally {
      setBusy('')
    }
  }

  const needsNote = check && check.needsNote
  const ready = check && check.canSubmit && image && attested && (!needsNote || note.trim().length >= 10)

  return (
    <div className="agent-grid">
      <div className="card photo-col">
        <h3>{L(lang, '1. Photo of the result sheet (EC8A)', '1. Hoton fom ɗin sakamako (EC8A)')}</h3>
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onFile} />
        {busy === 'photo' && <p className="muted">…</p>}
        {image && <img className="sheet-photo" src={image} alt="sheet" />}
        {image && config.aiAvailable && (
          <button type="button" onClick={readWithAI} disabled={busy === 'ai'}>
            {busy === 'ai' ? '…' : L(lang, 'Read the photo with AI (optional)', 'Karanta hoton da AI (zaɓi)')}
          </button>
        )}
        {aiNote && <p className="warn-box">{aiNote}</p>}
        <p className="muted">
          {L(lang, 'Take the photo in front of the voters. Make sure every number can be read.', 'Ɗauki hoton a gaban masu kaɗa ƙuri’a. Ka tabbata ana iya karanta kowace lamba.')}
        </p>
      </div>

      <div className="card form-col">
        <h3>{L(lang, '2. Type what is on the sheet', '2. Rubuta abin da ke kan fom')}</h3>
        <div className="row2">
          <label>
            {L(lang, 'Polling unit code', 'Lambar rumfa')}
            <input value={values.header.puCode} onChange={(e) => setHeader('puCode', e.target.value)} placeholder={unit.code} />
          </label>
          <label>
            {L(lang, 'Serial number (S/N)', 'Lambar S/N')}
            <input value={values.header.serialNo} onChange={(e) => setHeader('serialNo', e.target.value)} />
          </label>
        </div>
        <p className="muted">{L(lang, 'Your polling unit: ', 'Rumfarka: ')}<strong>{unit.code}</strong></p>

        <div className="count-grid">
          {COUNT_ORDER.map((k) => (
            <label key={k}>
              {countLabel(lang, k)}
              <input inputMode="numeric" value={values.counts[k]} onChange={(e) => setCount(k, e.target.value)} />
            </label>
          ))}
        </div>

        <table className="party-table">
          <thead>
            <tr>
              <th>{L(lang, 'Party', 'Jam’iyya')}</th>
              <th>{L(lang, 'Votes (figures)', 'Ƙuri’u (lamba)')}</th>
              <th>{L(lang, 'Votes (words)', 'Ƙuri’u (kalmomi)')}</th>
            </tr>
          </thead>
          <tbody>
            {values.parties.map((p, i) => (
              <tr key={p.party}>
                <td>{p.party}</td>
                <td><input inputMode="numeric" value={p.figures ?? ''} onChange={(e) => setParty(i, 'figures', e.target.value)} /></td>
                <td><input value={p.words ?? ''} onChange={(e) => setParty(i, 'words', e.target.value)} placeholder={L(lang, 'optional', 'zaɓi')} /></td>
              </tr>
            ))}
            <tr>
              <td><strong>{L(lang, 'Total valid votes (bottom line)', 'Jimillar ƙuri’u masu inganci (layin ƙasa)')}</strong></td>
              <td><input inputMode="numeric" value={values.totalValidRow ?? ''} onChange={(e) => setValues((s) => ({ ...s, totalValidRow: e.target.value }))} /></td>
              <td><input value={values.totalValidRowWords ?? ''} onChange={(e) => setValues((s) => ({ ...s, totalValidRowWords: e.target.value }))} placeholder={L(lang, 'optional', 'zaɓi')} /></td>
            </tr>
          </tbody>
        </table>
        <p className="muted">{L(lang, 'Write 0 where the sheet shows none or a dash.', 'Ka rubuta 0 inda fom ɗin ya nuna babu komai ko dash.')}</p>

        <h3>{L(lang, '3. Checks', '3. Bincike')}</h3>
        {check ? <FindingsList findings={check.findings} lang={lang} /> : <p className="muted">{L(lang, 'Checking…', 'Ana dubawa…')}</p>}

        {needsNote && (
          <label>
            {L(lang, 'There are warnings. Explain them for the reviewer (at least 10 letters):', 'Akwai gargaɗi. Ka yi bayani ga mai dubawa (aƙalla haruffa 10):')}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
          </label>
        )}

        <label className="check-line">
          <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
          <span>{L(lang, 'I compared every number with the photo.', 'Na kwatanta kowace lamba da hoton.')}</span>
        </label>

        {message && <p className="error-text" role="alert">{message}</p>}
        {serverFindings && <FindingsList findings={serverFindings} lang={lang} />}

        <button className="primary" disabled={!ready || busy === 'submit'} onClick={submit}>
          {busy === 'submit' ? '…' : L(lang, 'Send for review', 'Aika don dubawa')}
        </button>
        {!ready && <p className="muted">{L(lang, 'To send: add the photo, fix every "Must fix" item and tick the box.', 'Don aikawa: saka hoto, ka gyara duk abin da ya ce "Dole a gyara", ka saka alama a akwatin.')}</p>}
      </div>
    </div>
  )
}

function SubmissionView({ token, id, lang, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    api('/api/agent/submissions/' + id, { token }).then(setD).catch((e) => setErr(e.message))
  }, [id, token])
  if (err) return <p className="error-text">{err}</p>
  if (!d) return <p className="muted">…</p>
  return (
    <div className="card">
      <button onClick={onClose}>{L(lang, 'Close', 'Rufe')}</button>
      <h3>Version {d.version}: {L(lang, ...STATUS[d.status])}</h3>
      {d.reviewReason && <p className="error-text">{L(lang, 'Reason: ', 'Dalili: ')}{d.reviewReason}</p>}
      <div className="agent-grid">
        <AuthedImage path={`/api/agent/submissions/${id}/image`} token={token} alt="sheet" />
        <div>
          <ResultTable counts={d.counts} votes={d.votes} lang={lang} />
          <FindingsList findings={d.findings} lang={lang} />
        </div>
      </div>
    </div>
  )
}

export default function AgentDashboard({ session, config, lang, onLogout }) {
  const token = session.token
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    try {
      setOverview(await api('/api/agent/unit', { token }))
    } catch (e) {
      if (e.status === 401) onLogout()
      else setError(e.message)
    }
  }, [token, onLogout])
  useEffect(() => { load() }, [load])

  if (error) return <p className="error-text">{error}</p>
  if (!overview) return <p className="muted">…</p>
  const { unit, latest, history, canSubmit } = overview

  return (
    <div>
      <div className="card">
        <h2>{L(lang, 'Agent: polling unit', 'Wakili: rumfa')} {unit.code}</h2>
        <p>{unit.name} · {unit.ward} · {unit.lga} · {unit.state}</p>
        <p className="muted">{L(lang, 'Registered voters in the registry: ', 'Masu rajista a rajista: ')}{unit.registered}</p>
        {latest && (
          <p className={'status ' + latest.status}>
            {L(lang, 'Latest result: ', 'Sakamakon ƙarshe: ')}<strong>{L(lang, ...STATUS[latest.status])}</strong>
            {latest.review_reason && <> · {L(lang, 'Reason: ', 'Dalili: ')}{latest.review_reason}</>}
          </p>
        )}
      </div>

      {open && <SubmissionView token={token} id={open} lang={lang} onClose={() => setOpen(null)} />}

      {canSubmit ? (
        <SubmissionForm token={token} config={config} lang={lang} unit={unit} onDone={load} onUnauthorized={onLogout} />
      ) : (
        <p className="ok-box">
          {latest && latest.status === 'approved'
            ? L(lang, 'This polling unit is finished. The result is approved and public.', 'An gama da wannan rumfa. An amince da sakamakon kuma yana nan a bayyane.')
            : L(lang, 'Your result is waiting for the admin to review it.', 'Sakamakonka yana jiran admin ya duba shi.')}
        </p>
      )}

      {history.length > 0 && (
        <div className="card">
          <h3>{L(lang, 'History', 'Tarihi')}</h3>
          <table>
            <thead><tr><th>Version</th><th>{L(lang, 'Status', 'Matsayi')}</th><th>{L(lang, 'Sent', 'An aika')}</th><th /></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.version}</td>
                  <td>{L(lang, ...STATUS[h.status])}</td>
                  <td>{when(h.submitted_at)}</td>
                  <td><button onClick={() => setOpen(h.id)}>{L(lang, 'View', 'Duba')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
