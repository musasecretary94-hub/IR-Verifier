import { useState } from 'react'
import { api } from '../api.js'
import { L } from '../i18n.js'

export default function Login({ lang, onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } })
      onLogin({ token: data.token, user: data.user })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>{L(lang, 'Log in', 'Shiga')}</h2>
      <label>
        {L(lang, 'Username', 'Sunan mai amfani')}
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>
      <label>
        {L(lang, 'Password', 'Kalmar sirri')}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? '…' : L(lang, 'Log in', 'Shiga')}
      </button>
    </form>
  )
}
