import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleCheck, FilePlus, ListChecks, ShieldCheck, Siren } from 'lucide-react'
import { api } from '../../api'
import { Button, Card, EmptyState, Skeleton } from '../../components/ui'
import { useLang } from '../../i18n'

function Tracker({ stages, index, nowLabel }) {
  return (
    <ol className="grid grid-cols-1 gap-3 sm:grid-cols-5" aria-label="Progress">
      {stages.map((s, i) => {
        const done = i < index
        const current = i === index
        return (
          <li key={s} aria-current={current ? 'step' : undefined}
            className={`flex flex-col gap-2 rounded-2xl border px-4 py-4 ${current ? 'border-gold/50 bg-gold/[.07]' : done ? 'border-ok/30 bg-ok/[.04]' : 'border-line bg-white/[.02]'}`}>
            <span className={`h-1.5 rounded-full ${current ? 'bg-gradient-to-r from-saffron to-gold' : done ? 'bg-ok/70' : 'bg-line'}`} aria-hidden />
            <span className="flex items-center justify-between text-xs">
              <span className={done ? 'text-ok' : current ? 'text-gold-soft' : 'text-faint'}>{done ? <CircleCheck size={15} aria-hidden /> : i + 1}</span>
              {current && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold-soft">{nowLabel}</span>}
            </span>
            <span className={`text-sm ${current ? 'font-medium text-text' : done ? 'text-text' : 'text-muted'}`}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}

export default function ComplaintStatus() {
  const { t, lang } = useLang()
  const navigate = useNavigate()
  const [cases, setCases] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/survivor/complaints').then(setCases).catch((e) => setError(e.message))
  }, [])

  const locale = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' }[lang]
  const fmt = (iso) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">{t.statusTitle}</h1>
        <Link to="/survivor" className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />{t.back}</Link>
      </div>

      {error && <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-[#FFB4B5]">{error}</p>}

      {!cases && !error && <div className="flex flex-col gap-4"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>}

      {cases?.length === 0 && (
        <Card>
          <EmptyState icon={ListChecks} title={t.noComplaint}
            action={<Button icon={FilePlus} onClick={() => navigate('/survivor/new')}>{t.file}</Button>} />
        </Card>
      )}

      {cases?.map((c) => (
        <Card key={c.id} className="p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-faint">{t.caseNumber}</p>
              <p className="font-mono text-2xl tracking-wider text-gold-soft">{c.id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {c.urgent && <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/50 bg-danger/15 px-3 py-1 font-semibold text-[#FFB4B5]"><Siren size={14} aria-hidden />{t.urgentBadge}</span>}
              <span className="text-muted">{t.filedOn}: <span className="text-text">{fmt(c.created_at)}</span></span>
            </div>
          </div>
          <Tracker stages={t.stages} index={c.stage_index} nowLabel={t.current} />
          <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <p className="text-muted">{t.station}: <span className="text-text">{c.station}</span></p>
            <p className="flex items-center gap-2 text-muted"><ShieldCheck size={16} className="text-gold" aria-hidden />
              {c.officer ? <>{t.officer}: <span className="text-text">{c.officer.display_name}</span></> : t.awaitingOfficer}
            </p>
          </div>
        </Card>
      ))}
    </div>
  )
}
