// Shared Kavach components. One maroon primary action per screen; statuses always pair colour with an icon and text.
import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, CircleX, Clock, Hourglass, Info, X } from 'lucide-react'
import { Chakra } from './art'

export function Button({ variant = 'primary', size = 'md', className = '', icon: Icon, iconRight: IconRight, children, ...props }) {
  const sizes = { sm: 'h-9 px-3.5 text-sm gap-2', md: 'h-11 px-5 text-[15px] gap-2.5', lg: 'h-12 px-6 text-base gap-3' }
  const variants = {
    primary: 'bg-gradient-to-b from-maroon-hi to-maroon text-text border border-[#C2545A]/50 shadow-[0_8px_24px_-12px_rgba(163,52,58,.9)] hover:from-[#B03C42] hover:to-maroon-hi',
    secondary: 'border border-text/25 text-text hover:border-gold/70 hover:text-gold-soft bg-white/[.02]',
    ghost: 'text-muted hover:text-text hover:bg-white/[.04]',
    danger: 'border border-danger/60 text-[#FF8A8D] hover:bg-danger/10',
    gold: 'bg-gradient-to-b from-gold-soft to-gold text-ink font-semibold hover:brightness-105',
  }
  return (
    <button className={`inline-flex items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {Icon && <Icon size={size === 'sm' ? 16 : 18} aria-hidden />}
      {children}
      {IconRight && <IconRight size={size === 'sm' ? 16 : 18} aria-hidden />}
    </button>
  )
}

export function Card({ className = '', children, ...props }) {
  return <section className={`card-glow rounded-2xl border border-line ${className}`} {...props}>{children}</section>
}

export function CardHeader({ icon: Icon, title, action, subtitle }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line-soft px-6 py-4">
      <div className="flex items-center gap-3">
        {Icon && <Icon size={20} className="text-gold" aria-hidden />}
        <div>
          <h2 className="text-[17px] font-semibold text-text">{title}</h2>
          {subtitle && <p className="text-xs text-faint">{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  )
}

const STAT_TONES = {
  coral: { glow: 'rgba(229,96,90,.28)', icon: 'text-coral bg-coral/10 border-coral/25' },
  gold: { glow: 'rgba(212,175,55,.26)', icon: 'text-gold bg-gold/10 border-gold/25' },
  saffron: { glow: 'rgba(255,153,51,.26)', icon: 'text-saffron bg-saffron/10 border-saffron/25' },
  green: { glow: 'rgba(63,185,80,.24)', icon: 'text-ok bg-ok/10 border-ok/25' },
}

export function StatCard({ icon: Icon, label, value, caption, tone = 'gold' }) {
  const t = STAT_TONES[tone]
  return (
    <div className="card-glow relative overflow-hidden rounded-2xl border border-line p-5">
      <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-12 h-36 w-36 rounded-full blur-2xl" style={{ background: t.glow }} />
      <div className="relative flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${t.icon}`}><Icon size={22} aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="font-display text-4xl leading-tight font-semibold text-text">{value}</p>
          {caption && <p className="mt-1 text-xs text-faint">{caption}</p>}
        </div>
      </div>
    </div>
  )
}

const PILL = {
  ok: { icon: CircleCheck, cls: 'border-ok/35 bg-ok/10 text-[#7EE08A]' },
  warn: { icon: Hourglass, cls: 'border-warn/40 bg-warn/10 text-[#F3C27A]' },
  danger: { icon: CircleX, cls: 'border-danger/40 bg-danger/10 text-[#FF9C9E]' },
  info: { icon: Info, cls: 'border-gold/35 bg-gold/10 text-gold-soft' },
  neutral: { icon: Clock, cls: 'border-line bg-white/[.03] text-muted' },
  alert: { icon: CircleAlert, cls: 'border-danger/50 bg-danger/15 text-[#FFB4B5]' },
}

export function StatusPill({ tone = 'neutral', children }) {
  const p = PILL[tone]
  const Icon = p.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${p.cls}`}>
      <Icon size={13} aria-hidden />{children}
    </span>
  )
}

export function Table({ columns, rows, empty }) {
  if (!rows.length) return empty
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs tracking-wide text-faint uppercase">
            {columns.map((c) => <th key={c.key} className="px-6 py-3 font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className="border-t border-line-soft hover:bg-white/[.025]">
              {columns.map((c) => <td key={c.key} className="px-6 py-3.5">{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden px-6 py-14 text-center">
      <Chakra className="pointer-events-none absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 opacity-[.07]" />
      <span className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-gold/25 bg-gold/10 text-gold"><Icon size={26} aria-hidden /></span>
      <h3 className="relative text-base font-semibold text-text">{title}</h3>
      {children && <p className="relative mt-1.5 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  )
}

export function Modal({ open, title, children, onClose, actions }) {
  const panel = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    panel.current?.querySelector('button, input, textarea, select')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/65 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="card-glow w-full max-w-lg rounded-2xl border border-gold/30">
        <header className="flex items-center justify-between border-b border-line-soft px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-gold-soft">{title}</h2>
          <button onClick={onClose} className="text-faint hover:text-text" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="px-6 py-5 text-sm text-muted">{children}</div>
        {actions && <footer className="flex justify-end gap-3 border-t border-line-soft px-6 py-4">{actions}</footer>}
      </div>
    </div>
  )
}

export function CountdownChip({ expiresAt, onExpire }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000)))
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) { clearInterval(t); onExpire?.() }
    }, 500)
    return () => clearInterval(t)
  }, [expiresAt, onExpire])
  const urgent = left <= 10
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs ${urgent ? 'border-danger/50 bg-danger/10 text-[#FF9C9E]' : 'border-warn/40 bg-warn/10 text-[#F3C27A]'}`}>
      <Clock size={13} aria-hidden />{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
    </span>
  )
}

export function Field({ label, hint, error, children, id }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && <p className="text-xs text-[#FF9C9E]">{error}</p>}
    </div>
  )
}

export const inputClass = 'h-11 w-full rounded-xl border border-line bg-ink/60 px-4 text-[15px] text-text placeholder:text-faint outline-none transition-colors focus:border-gold/70 focus:bg-ink/80'

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-lg bg-white/[.05] ${className}`} />
}

export function PageHeader({ eyebrow, title, children, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-[.2em] text-gold uppercase">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-semibold text-text">{title}</h1>
        {children && <p className="mt-1.5 max-w-3xl text-sm text-muted">{children}</p>}
      </div>
      {actions && <div className="flex gap-3">{actions}</div>}
    </div>
  )
}

export function CaseId({ children }) {
  return <span className="font-mono text-[13px] tracking-wide whitespace-nowrap text-text">{children}</span>
}
