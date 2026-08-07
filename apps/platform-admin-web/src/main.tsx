import { StrictMode, useMemo, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { Globe2 } from 'lucide-react'
import { PlatformAdminPage, type PlatformSession } from '../../institute-admin-web/src/features/platform-admin/PlatformAdminPage'
import '../../institute-admin-web/src/features/platform-admin/platform-admin.css'
import './platform-login.css'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')

function PlatformAdminApp() {
  const session = useMemo(() => {
    try {
      const stored = localStorage.getItem('campusone.session')
      return stored ? JSON.parse(stored) as PlatformSession : null
    } catch { return null }
  }, [])

  const [activeSession, setActiveSession] = useState<PlatformSession | null>(session)

  if (!activeSession) return <PlatformLogin onAuthenticated={setActiveSession} />

  return <PlatformAdminPage session={activeSession} onSignOut={async () => { localStorage.removeItem('campusone.session'); setActiveSession(null) }} />
}

function PlatformLogin({ onAuthenticated }: { onAuthenticated: (session: PlatformSession) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const response = await fetch(`${apiBase}/api/v1/identity/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, client: 'platform-admin' }) }); const payload = await response.json(); if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? 'Platform administrator access denied.'); localStorage.setItem('campusone.session', JSON.stringify(payload.data)); onAuthenticated(payload.data) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to sign in.') } finally { setBusy(false) } }
  return <main className="platform-login"><div className="platform-login-card"><div className="platform-brand"><span className="platform-brand-mark"><Globe2 /></span><span>CampusOne<span>CONTROL</span></span></div><p className="platform-eyebrow">Restricted workspace</p><h1>Platform control center</h1><p>Sign in to review institutes, manage subscriptions, and control the CampusOne network.</p><form onSubmit={submit}><label>Email<input type="email" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required /></label>{error && <div className="platform-login-error" role="alert">{error}</div>}<button className="platform-button platform-button--dark" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form></div></main>
}

createRoot(document.getElementById('root')!).render(<StrictMode><PlatformAdminApp /></StrictMode>)
