import { useCallback, useEffect, useRef, useState } from 'react'
import { Ban, Camera, Check, FileWarning, KeyRound, Radar, Siren, Waves } from 'lucide-react'
import { api } from '../../api'
import { Button, EmptyState, StatusPill } from '../../components/ui'
import { fmtTime } from '../police/common'

export const KIND = {
  canary: { label: 'Decoy case opened', icon: FileWarning },
  decoy: { label: 'Decoy endpoint hit', icon: Radar },
  honey_login: { label: 'Honey credentials used', icon: KeyRound },
  idor: { label: 'Wrong-case attempt', icon: Ban },
  rate_limit: { label: 'Request flood', icon: Waves },
  camera: { label: 'Camera guard', icon: Camera },
}
export const SEVERITY = { critical: 'alert', high: 'danger', medium: 'warn', low: 'neutral' }

/** Polls an endpoint every `ms` while the page is open. */
export function usePoll(path, ms = 2000) {
  const [data, setData] = useState(null)
  const timer = useRef(null)
  const load = useCallback(() => api(path).then(setData).catch(() => {}), [path])
  useEffect(() => {
    load()
    timer.current = setInterval(load, ms)
    return () => clearInterval(timer.current)
  }, [load, ms])
  return [data, load]
}

export function AlertFeed({ alerts, onResolve, limit }) {
  if (!alerts) return null
  const shown = limit ? alerts.slice(0, limit) : alerts
  if (!shown.length) return <EmptyState icon={Siren} title="All quiet">No decoy has been touched and no account is locked. Alerts appear here within two seconds of a tripwire firing.</EmptyState>
  return (
    <ul className="flex flex-col">
      {shown.map((a) => {
        const k = KIND[a.kind] ?? { label: a.kind, icon: Siren }
        const serious = !a.resolved && (a.severity === 'critical' || a.severity === 'high')
        return (
          <li key={a.id} className={`flex flex-wrap items-start gap-4 border-b border-line-soft px-6 py-4 last:border-0 ${serious ? 'bg-danger/[.06]' : ''} ${a.resolved ? 'opacity-55' : ''}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${serious ? 'border-danger/50 bg-danger/15 text-[#FFB4B5]' : 'border-line bg-white/[.03] text-gold'}`}><k.icon size={19} aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text">{k.label}</span>
                <StatusPill tone={SEVERITY[a.severity]}>{a.severity}</StatusPill>
                {a.resolved && <StatusPill tone="ok">resolved</StatusPill>}
              </p>
              <p className="mt-1 text-sm text-muted">{a.detail}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
                {a.target && <span>Target <span className="font-mono text-muted">{a.target}</span></span>}
                {a.actor && <span>Account <span className="text-muted">{a.actor.display_name}{a.actor.badge ? ` (${a.actor.badge})` : ''}</span></span>}
                {a.ip && <span>From <span className="font-mono text-muted">{a.ip}</span>{a.ua ? ` · ${a.ua.slice(0, 48)}` : ''}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs whitespace-nowrap text-faint">{fmtTime(a.ts)}</span>
              {!a.resolved && onResolve && <Button size="sm" variant="secondary" icon={Check} onClick={() => onResolve(a)}>Resolve</Button>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
