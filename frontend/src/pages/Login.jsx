import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Fingerprint, HeartHandshake, LockKeyhole, Radar, ShieldCheck, Smartphone, UserCheck } from 'lucide-react'
import { api } from '../api'
import { ROLE_HOME, useAuth } from '../auth'
import { HeroScene } from '../components/art'
import { LogoTile } from '../components/Logo'
import { useToast } from '../components/toast'
import { Button, Field, inputClass } from '../components/ui'

const ROLES = [
  { id: 'survivor', label: 'Survivor', desc: 'File or track a complaint', icon: HeartHandshake },
  { id: 'police', label: 'Police', desc: 'Officers and supervisors', icon: ShieldCheck },
  { id: 'security', label: 'Security', desc: 'Cyber cell', icon: Radar },
]

const PROMISES = [
  { icon: LockKeyhole, title: 'Encrypted identity vault', text: 'Names and contact details are sealed field by field.' },
  { icon: UserCheck, title: 'Need-to-know officer access', text: 'Officers work with a case number, not a name.' },
  { icon: Fingerprint, title: 'Every action on record', text: 'A tamper-evident log, watched by a honeypot layer.' },
]

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [role, setRole] = useState('survivor')
  const [demo, setDemo] = useState(null)
  const [phone, setPhone] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api('/demo/accounts').then(setDemo).catch(() => {}) }, [])
  const params = new URLSearchParams(window.location.search)
  const notice = params.has('locked') ? 'This account has been locked by Kavach\'s security system. Contact the security admin.'
    : params.has('ended') ? 'Your session has ended. Please sign in again.' : null
  useEffect(() => { document.title = 'Kavach' }, [])

  if (loading) return null
  if (user) return <Navigate to={ROLE_HOME[user.role] ?? '/'} replace />

  function pickRole(id) {
    setRole(id)
    setChallenge(null)
    setCode('')
    setError('')
    setUsername('')
    setPassword('')
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
      if (r.token) { // some accounts sign straight in
        signIn(r.token, r.user)
        navigate(ROLE_HOME[r.user.role] ?? '/', { replace: true })
        return
      }
      setChallenge({ id: r.challenge_id, hint: 'Enter the 6-digit code from your authenticator app.', demoCode: r.demo_code })
    })
  }

  const verify = (e) => {
    e.preventDefault()
    run(async () => {
      const r = await api('/auth/verify', { method: 'POST', body: { challenge_id: challenge.id, code } })
      signIn(r.token, r.user)
      if (r.user.role !== 'survivor') toast(`Signed in as ${r.user.display_name}.`, 'success')
      navigate(ROLE_HOME[r.user.role] ?? '/', { replace: true })
    })
  }

  const staff = (demo?.staff ?? []).filter((s) => (role === 'security' ? s.role === 'security' : s.role !== 'security'))

  return (
    <div className="relative min-h-full overflow-hidden">
      <HeroScene className="absolute inset-0 h-full w-full" height={900} chakraX={0.6} chakraY={0.3} chakraSize={1.55} />
      {/* Dark fade behind the text that clears toward the bottom, so the crowd stays visible. */}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/80 to-bg/25 [mask-image:linear-gradient(to_bottom,black_50%,transparent_82%)]" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-[14%] bg-gradient-to-t from-bg/55 to-transparent" aria-hidden />

      <div className="relative z-10 grid min-h-full grid-cols-1 gap-10 px-6 py-10 sm:px-10 lg:grid-cols-12 lg:gap-12 lg:px-16 xl:px-24">
        <section className="flex flex-col justify-center gap-8 lg:col-span-7 lg:pb-40">
          <LogoTile size={150} className="max-lg:!h-24 max-lg:!w-24" />
          <div>
            <p className="mb-3 flex items-center gap-3 text-sm tracking-[.22em] text-gold-soft uppercase">
              <span className="h-[3px] w-10 rounded-full bg-gradient-to-r from-saffron via-india-white to-india-green" aria-hidden />
              Survivor identity protection
            </p>
            <h1 className="font-display text-[clamp(2.4rem,4.4vw,4.4rem)] leading-[1.04] font-semibold text-text">
              Justice without <span className="text-coral">exposure.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">
              File a complaint, investigate and release records for sexual-offence cases without revealing who the survivor is.
            </p>
          </div>
          <ul className="hidden max-w-3xl gap-4 sm:grid sm:grid-cols-3">
            {PROMISES.map((p) => (
              <li key={p.title} className="rounded-2xl border border-line/80 bg-bg/50 p-4 backdrop-blur-sm">
                <p.icon size={22} className="mb-2 text-gold" aria-hidden />
                <p className="text-sm font-semibold text-text">{p.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-center pb-40 lg:col-span-5 lg:pb-24">
          <div className="card-glow w-full max-w-[520px] rounded-3xl border border-gold/25 p-7 backdrop-blur-md sm:p-9 lg:ml-auto">
            <h2 className="font-display text-2xl font-semibold text-text">Sign in</h2>
            <p className="mt-1 text-sm text-muted">Choose who you are.</p>
            {notice && <p role="alert" className="mt-4 rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-[#FFB4B5]">{notice}</p>}

            <div role="tablist" aria-label="Sign in as" className="mt-6 grid grid-cols-3 gap-3">
              {ROLES.map((r) => (
                <button key={r.id} role="tab" aria-selected={role === r.id} onClick={() => pickRole(r.id)}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-colors ${role === r.id
                    ? 'border-[#C2545A]/70 bg-gradient-to-b from-maroon/70 to-maroon-deep/40'
                    : 'border-line bg-white/[.02] hover:border-gold/40'}`}>
                  <r.icon size={22} className={role === r.id ? 'text-gold-soft' : 'text-faint'} aria-hidden />
                  <span className="text-sm font-semibold text-text">{r.label}</span>
                  <span className="hidden text-[11px] leading-snug text-muted sm:block">{r.desc}</span>
                </button>
              ))}
            </div>

            <div className="gold-divider my-7" />

            {!challenge && role === 'survivor' && (
              <form onSubmit={startSurvivor} className="flex flex-col gap-4">
                <Field label="Mobile number" id="phone" hint="We send a one-time code. No password needed.">
                  <input id="phone" className={inputClass} inputMode="numeric" autoComplete="tel" value={phone}
                    onChange={(e) => setPhone(e.target.value)} placeholder="10-digit number" />
                </Field>
                <Button icon={Smartphone} iconRight={ArrowRight} disabled={busy || phone.replace(/\D/g, '').length < 10}>Send code</Button>
                {demo && (
                  <p className="text-xs text-faint">
                    Demo number <span className="font-mono text-muted">{demo.survivor_phone}</span>{' '}
                    <button type="button" className="text-gold-soft underline-offset-2 hover:underline" onClick={() => setPhone(demo.survivor_phone)}>Use it</button>
                  </p>
                )}
              </form>
            )}

            {!challenge && role !== 'survivor' && (
              <form onSubmit={startStaff} className="flex flex-col gap-4">
                <Field label="Username" id="username">
                  <input id="username" className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                </Field>
                <Field label="Password" id="password">
                  <input id="password" type="password" className={inputClass} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button iconRight={ArrowRight} disabled={busy || !username || !password}>Continue</Button>
                {staff.length > 0 && (
                  <details className="group rounded-xl border border-line-soft bg-white/[.02] px-4 py-3 text-sm">
                    <summary className="cursor-pointer text-muted marker:text-gold">Demo accounts</summary>
                    <ul className="mt-3 flex max-h-44 flex-col gap-1 overflow-y-auto">
                      {staff.map((s) => (
                        <li key={s.username}>
                          <button type="button" onClick={() => { setUsername(s.username); setPassword(demo.password) }}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/[.04]">
                            <span className="text-text">{s.display_name}</span>
                            <span className="text-xs text-faint capitalize">{s.role} · {s.station?.replace(' Police Station', '') ?? 'HQ'}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </form>
            )}

            {challenge && (
              <form onSubmit={verify} className="flex flex-col gap-4">
                <Field label="Verification code" id="code" hint={challenge.hint}>
                  <input id="code" className={`${inputClass} text-center font-mono text-xl tracking-[.5em]`} inputMode="numeric" autoComplete="one-time-code"
                    maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" autoFocus />
                </Field>
                <Button icon={ShieldCheck} disabled={busy || code.length !== 6}>Verify and sign in</Button>
                <div className="flex items-center justify-between text-xs">
                  {challenge.demoCode ? (
                    <span className="text-faint">Demo code <span className="font-mono text-muted">{challenge.demoCode}</span>{' '}
                      <button type="button" className="text-gold-soft hover:underline" onClick={() => setCode(challenge.demoCode)}>Use it</button>
                    </span>
                  ) : <span />}
                  <button type="button" className="text-muted hover:text-text" onClick={() => pickRole(role)}>Start over</button>
                </div>
              </form>
            )}

            {error && <p role="alert" className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#FFB4B5]">{error}</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
