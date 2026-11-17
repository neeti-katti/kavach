import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, ChevronDown, ClipboardCheck, Eye, FileCheck, FolderOpen, LayoutDashboard, Lock, LogOut, Menu, Radar,
  ScrollText, Search, Siren, Users, X,
} from 'lucide-react'
import { useAuth } from '../auth'
import { LogoTile } from '../components/Logo'
import { Skyline } from '../components/art'
import { useToast } from '../components/toast'

const NAV = {
  officer: [
    { to: '/police', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/police/cases', label: 'My cases', icon: FolderOpen },
    { to: '/police/reveals', label: 'Reveal requests', icon: Eye },
    { to: '/police/copies', label: 'Public copies', icon: FileCheck },
  ],
  supervisor: [
    { to: '/police', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/police/allocation', label: 'Allocation', icon: Users },
    { to: '/police/approvals', label: 'Approvals', icon: ClipboardCheck },
    { to: '/police/copies', label: 'Public copies', icon: FileCheck },
  ],
  security: [
    { to: '/security', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/security/alerts', label: 'Alerts', icon: Siren },
    { to: '/security/locked', label: 'Locked accounts', icon: Lock },
    { to: '/security/decoys', label: 'Decoys', icon: Radar },
    { to: '/security/audit', label: 'Audit log', icon: ScrollText },
  ],
}

const ROLE_LABEL = { officer: 'Officer', supervisor: 'Supervisor', security: 'Security admin' }

function initials(name) {
  return name.replace(/^(Insp\.|SI|SHO)\s+/, '').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex h-11 items-center gap-3 rounded-xl border border-line bg-white/[.02] pr-3 pl-1.5 hover:border-gold/50">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-b from-maroon-hi to-maroon-deep text-xs font-semibold text-gold-soft ring-1 ring-gold/40">{initials(user.display_name)}</span>
        <span className="hidden max-w-[190px] text-left leading-tight md:block">
          <span className="block truncate text-sm font-medium text-text">{user.display_name}</span>
          <span className="block text-[11px] text-faint">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown size={16} className="text-faint" aria-hidden />
      </button>
      {open && (
        <div className="card-glow absolute right-0 z-50 mt-2 w-72 rounded-xl border border-line p-2 text-sm">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1.5 px-3 py-2">
            {user.badge && (<><dt className="text-faint">Badge</dt><dd className="font-mono text-text">{user.badge}</dd></>)}
            <dt className="text-faint">Station</dt><dd className="text-text">{user.station?.name ?? 'Cyber Cell HQ'}</dd>
          </dl>
          <div className="gold-divider my-2" />
          <button onClick={onSignOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted hover:bg-white/[.04] hover:text-text">
            <LogOut size={16} aria-hidden />Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function StaffShell({ area }) {
  const { user, signOut } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const nav = NAV[user.role] ?? []
  const current = nav.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? nav[0]

  useEffect(() => { setDrawer(false) }, [pathname])
  useEffect(() => { document.title = `${current?.label ?? 'Overview'} · Kavach` }, [current])

  async function handleSignOut() {
    await signOut()
    toast('You have signed out.', 'success')
    navigate('/', { replace: true })
  }

  function search(e) {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')?.toString().trim().toUpperCase()
    if (!q) return
    navigate(`${area === 'security' ? '/security/audit' : '/police/cases'}?q=${encodeURIComponent(q)}`)
  }

  return (
    <div className="min-h-full">
      {drawer && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-line-soft bg-[#150B0D]/95 backdrop-blur transition-transform lg:translate-x-0 ${drawer ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-center px-6 pt-7 pb-6">
          <LogoTile size={124} />
          <button onClick={() => setDrawer(false)} className="absolute top-4 right-4 text-faint lg:hidden" aria-label="Close menu"><X size={20} /></button>
        </div>
        <div className="gold-divider mx-6" />
        <nav className="flex flex-1 flex-col gap-1.5 px-4 pt-6" aria-label="Main">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `group relative flex h-12 items-center gap-3.5 rounded-xl px-4 text-[15px] transition-colors ${isActive
                ? 'bg-gradient-to-r from-maroon/80 to-maroon-deep/40 text-text ring-1 ring-[#C2545A]/40'
                : 'text-muted hover:bg-white/[.035] hover:text-text'}`}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-full bg-gold" aria-hidden />}
                  <item.icon size={20} className={isActive ? 'text-gold-soft' : 'text-faint group-hover:text-muted'} aria-hidden />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="pointer-events-none relative h-[190px] overflow-hidden">
          <Skyline className="absolute inset-x-0 bottom-0 h-full w-full" />
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-4 border-b border-line-soft bg-bg/80 px-6 backdrop-blur lg:px-10">
          <button onClick={() => setDrawer(true)} className="text-muted lg:hidden" aria-label="Open menu"><Menu size={22} /></button>
          <p className="hidden items-center gap-2 text-[13px] tracking-[.16em] text-muted uppercase sm:flex">
            <span className="text-text">Kavach</span><span className="text-saffron">/</span>
            <span>{area === 'security' ? 'Security' : 'Police'}</span><span className="text-india-white/80">/</span>
            <span className="text-gold-soft">{current?.label}</span><span className="text-india-green font-bold tracking-tighter">///</span>
          </p>
          <form onSubmit={search} className="ml-auto hidden w-full max-w-[460px] md:block" role="search">
            <label className="relative block">
              <span className="sr-only">Search by case number</span>
              <Search size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-faint" aria-hidden />
              <input name="q" placeholder="Search by case number, e.g. KV-2026-BLR-0007"
                className="h-11 w-full rounded-xl border border-line bg-white/[.03] pr-4 pl-11 text-sm text-text placeholder:text-faint outline-none focus:border-gold/60" />
            </label>
          </form>
          <button onClick={() => toast('No new notifications.', 'info')} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-muted hover:border-gold/50 hover:text-text md:ml-0" aria-label="Notifications">
            <Bell size={19} />
          </button>
          <UserMenu user={user} onSignOut={handleSignOut} />
        </header>
        <main className="px-6 py-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
