import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { ROLE_HOME, useAuth } from '../auth'

// Phase 1: working sign-in flow with placeholder styling. Phase 2 applies the Kavach design.
const TABS = [
  { id: 'survivor', label: 'Survivor' },
  { id: 'police', label: 'Police' },
  { id: 'security', label: 'Security' },
]

const input = 'w-full rounded-md border border-[#3A2427] bg-[#1C1012] px-3 py-2 outline-none focus:border-[#D4AF37]'
const button = 'rounded-md bg-[#8E2A2E] px-4 py-2 font-medium hover:bg-[#A3343A] disabled:opacity-50'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('survivor')
  const [demo, setDemo] = useState(null)
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/demo/accounts').then(setDemo).catch(() => {})
  }, [])

  if (loading) return null
  if (user) return <Navigate to={ROLE_HOME[user.role] ?? '/'} replace />

  function switchTab(id) {
    setTab(id)
    setChallenge(null)
    setCode('')
    setError('')
  }

  async function run(fn) {
    setBusy(true)
    setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const startSurvivor = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await api('/auth/survivor/start', { method: 'POST', body: { phone } })
      setChallenge({ id: r.challenge_id, hint: `We sent a 6-digit code to ${r.sent_to}.`, demoCode: r.demo_code })
    })
  }

  const startStaff = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await api('/auth/staff/login', { method: 'POST', body: { username, password } })
      setChallenge({ id: r.challenge_id, hint: 'Enter the 6-digit code from your authenticator app.', demoCode: r.demo_code })
    })
  }

  const verify = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await api('/auth/verify', { method: 'POST', body: { challenge_id: challenge.id, code } })
      signIn(r.token, r.user)
      navigate(ROLE_HOME[r.user.role] ?? '/', { replace: true })
    })
  }

  const staff = (demo?.staff ?? []).filter((s) => (tab === 'security' ? s.role === 'security' : s.role !== 'security'))

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-wide text-[#D4AF37]">Kavach</h1>

      <div role="tablist" className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === t.id ? 'bg-[#8E2A2E]' : 'border border-[#3A2427]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!challenge && tab === 'survivor' && (
        <form onSubmit={startSurvivor} className="flex flex-col gap-3">
          <label className="text-sm" htmlFor="phone">Mobile number</label>
          <input id="phone" className={input} inputMode="numeric" autoComplete="tel" value={phone}
            onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" />
          <button className={button} disabled={busy}>Send code</button>
          {demo && <p className="text-xs opacity-70">Demo number: {demo.survivor_phone}</p>}
        </form>
      )}

      {!challenge && tab !== 'survivor' && (
        <form onSubmit={startStaff} className="flex flex-col gap-3">
          <label className="text-sm" htmlFor="username">Username</label>
          <input id="username" className={input} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label className="text-sm" htmlFor="password">Password</label>
          <input id="password" type="password" className={input} autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          <button className={button} disabled={busy}>Continue</button>
          {staff.length > 0 && (
            <div className="mt-2 text-xs">
              <p className="mb-1 opacity-70">Demo accounts (password {demo.password}):</p>
              <ul className="flex flex-col gap-1">
                {staff.map((s) => (
                  <li key={s.username}>
                    <button type="button" className="underline decoration-dotted hover:text-[#D4AF37]"
                      onClick={() => { setUsername(s.username); setPassword(demo.password) }}>
                      {s.display_name} · {s.role} · {s.station ?? 'HQ'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}

      {challenge && (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <p className="text-sm">{challenge.hint}</p>
          <input className={input} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" aria-label="Verification code" />
          <button className={button} disabled={busy || code.length !== 6}>Verify and sign in</button>
          {challenge.demoCode && (
            <p className="text-xs opacity-70">
              Demo mode, simulated code: <b className="font-mono">{challenge.demoCode}</b>{' '}
              <button type="button" className="underline" onClick={() => setCode(challenge.demoCode)}>Use it</button>
            </p>
          )}
          <button type="button" className="text-left text-xs underline opacity-70" onClick={() => switchTab(tab)}>Start over</button>
        </form>
      )}

      {error && <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
    </main>
  )
}
