import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { api } from './api.js'
import { L } from './i18n.js'
import Banner from './components/Banner.jsx'
import Login from './components/Login.jsx'
import PublicPage from './components/PublicPage.jsx'
import AgentDashboard from './components/AgentDashboard.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem('irv_session'))
  } catch {
    return null
  }
}

export default function App() {
  const route = useHashRoute()
  const [session, setSession] = useState(loadSession)
  const [lang, setLang] = useState(() => localStorage.getItem('irv_lang') || 'en')
  const [config, setConfig] = useState(null)
  const [configError, setConfigError] = useState('')

  useEffect(() => {
    api('/api/public/config').then(setConfig).catch((e) => setConfigError(e.message))
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem('irv_session')
    setSession(null)
    window.location.hash = '#/login'
  }, [])

  function login(s) {
    sessionStorage.setItem('irv_session', JSON.stringify(s))
    setSession(s)
    window.location.hash = s.user.role === 'admin' ? '#/admin' : '#/agent'
  }

  function changeLang(l) {
    localStorage.setItem('irv_lang', l)
    setLang(l)
  }

  let page
  if (configError) {
    page = <p className="error-text">{configError}</p>
  } else if (!config) {
    page = <p className="muted">…</p>
  } else if (route === '/agent' && session && session.user.role === 'agent') {
    page = <AgentDashboard session={session} config={config} lang={lang} onLogout={logout} />
  } else if (route === '/admin' && session && session.user.role === 'admin') {
    page = <AdminDashboard session={session} lang={lang} onLogout={logout} />
  } else if (route === '/agent' || route === '/admin' || route === '/login') {
    page = <Login lang={lang} onLogin={login} />
  } else {
    page = <PublicPage lang={lang} />
  }

  return (
    <div className="app">
      {config && <Banner lang={lang} demoMode={config.demoMode} />}
      <header className="top">
        <strong className="brand">IR Verifier</strong>
        <nav>
          <a href="#/">{L(lang, 'Public results', 'Sakamako na jama’a')}</a>
          {session ? (
            <>
              <a href={session.user.role === 'admin' ? '#/admin' : '#/agent'}>{session.user.username}</a>
              <button className="small" onClick={logout}>{L(lang, 'Log out', 'Fita')}</button>
            </>
          ) : (
            <a href="#/login">{L(lang, 'Log in', 'Shiga')}</a>
          )}
          <button className="small" onClick={() => changeLang(lang === 'en' ? 'ha' : 'en')}>{lang === 'en' ? 'Hausa' : 'English'}</button>
        </nav>
      </header>
      <main>{page}</main>
      <footer className="foot">
        {L(lang, 'Unofficial independent analysis, not official results.', 'Bincike mai zaman kansa ne, ba sakamakon hukuma ba.')}
      </footer>
    </div>
  )
}
