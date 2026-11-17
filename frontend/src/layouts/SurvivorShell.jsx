import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { DoorOpen, LogOut } from 'lucide-react'
import { getToken } from '../api'
import { useAuth } from '../auth'
import { LogoTile } from '../components/Logo'
import { LANGS, LangContext, STRINGS } from '../i18n'

// Leaves at once for a harmless page: ends the session, wipes this tab's storage, and replaces history
// so the back button does not return here.
export function quickExit() {
  const token = getToken()
  if (token) {
    try { fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, keepalive: true }) } catch { /* leave anyway */ }
  }
  try { sessionStorage.clear() } catch { /* ignore */ }
  window.location.replace('https://www.google.com/search?q=weather+today')
}

export default function SurvivorShell() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [lang, setLang] = useState('en')
  const t = STRINGS[lang]
  const ctx = useMemo(() => ({ lang, setLang, t }), [lang, t])

  // Neutral tab title while the survivor portal is open.
  useEffect(() => {
    const previous = document.title
    document.title = 'Notes'
    return () => { document.title = previous }
  }, [])

  const onKey = useCallback((e) => { if (e.key === 'Escape') quickExit() }, [])
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return (
    <LangContext.Provider value={ctx}>
      <div className="flex min-h-full flex-col" lang={lang}>
        <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/85 backdrop-blur">
          <div className="flex h-[76px] items-center gap-4 px-5 sm:px-10 lg:px-16">
            <LogoTile size={52} className="!rounded-xl !p-1" />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div role="group" aria-label="Language" className="flex rounded-xl border border-line p-1">
                {LANGS.map((l) => (
                  <button key={l.id} onClick={() => setLang(l.id)} aria-pressed={lang === l.id} title={l.name}
                    className={`h-9 min-w-10 rounded-lg px-2.5 text-sm transition-colors ${lang === l.id ? 'bg-maroon text-text' : 'text-muted hover:text-text'}`}>
                    {l.label}
                  </button>
                ))}
              </div>
              <button onClick={async () => { await signOut(); navigate('/', { replace: true }) }}
                className="hidden h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-white/[.04] hover:text-text sm:flex">
                <LogOut size={17} aria-hidden />{t.signOut}
              </button>
              <button onClick={quickExit}
                className="flex h-11 items-center gap-2 rounded-xl border border-danger/70 bg-danger/10 px-4 text-sm font-semibold text-[#FFB4B5] hover:bg-danger/20">
                <DoorOpen size={18} aria-hidden />{t.quickExit}
              </button>
            </div>
          </div>
          <div className="tricolour-line opacity-80" />
        </header>
        <main className="flex-1 px-5 py-8 sm:px-10 lg:px-16 lg:py-12">
          <Outlet />
        </main>
      </div>
    </LangContext.Provider>
  )
}
