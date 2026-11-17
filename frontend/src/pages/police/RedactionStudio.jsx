import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, FileCheck, Layers, Scale, ScanEye, Send, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '../../api'
import { TokenText } from '../../components/TokenText'
import { useToast } from '../../components/toast'
import { Button, Card, PageHeader, Skeleton } from '../../components/ui'

const DECISION = {
  released: { label: 'Can be released', tone: 'text-[#8BE69A]', bar: 'bg-ok' },
  needs_review: { label: 'Needs supervisor review', tone: 'text-[#F3C27A]', bar: 'bg-warn' },
  blocked: { label: 'Blocked', tone: 'text-[#FF9C9E]', bar: 'bg-danger' },
}

export function RiskMeter({ score, decision }) {
  const d = DECISION[decision]
  const pos = Math.min(score, 12) / 12
  return (
    <div className="flex items-center gap-5">
      <div className="text-center">
        <p className={`font-display text-5xl leading-none font-semibold ${d.tone}`}>{score}</p>
        <p className="mt-1 text-[11px] tracking-wider text-faint uppercase">risk score</p>
      </div>
      <div className="flex-1">
        <p className={`mb-2 text-sm font-semibold ${d.tone}`}>{d.label}</p>
        <div className="relative flex h-2.5 gap-1" aria-hidden>
          <span className="flex-[3] rounded-l-full bg-ok/60" /><span className="flex-[3] bg-warn/60" /><span className="flex-[6] rounded-r-full bg-danger/60" />
          <span className="absolute -top-1.5 h-5.5 w-1.5 rounded-full bg-text shadow" style={{ left: `calc(${pos * 100}% - 3px)` }} />
        </div>
        <div className="mt-1.5 flex text-[11px] text-faint"><span className="flex-[3]">0–2 release</span><span className="flex-[3]">3–5 review</span><span className="flex-[6]">6+ blocked</span></div>
      </div>
    </div>
  )
}

export function CopyDocument({ header, sections, plain = false }) {
  return (
    <div className={plain ? '' : 'rounded-xl border border-line-soft bg-ink/50 p-5'}>
      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
        {header.map(([k, v]) => (<div key={k} className="contents"><dt className={plain ? 'text-[#7A6A64]' : 'text-faint'}>{k}</dt><dd><TokenText as="span" text={v} plain={plain} /></dd></div>))}
      </dl>
      {sections.map((s) => (
        <div key={s.key} className="mt-5">
          <p className={`mb-1.5 text-xs font-semibold tracking-wider uppercase ${plain ? 'text-[#7A1F24]' : 'text-gold'}`}>{s.label}</p>
          <TokenText text={s.text} plain={plain} className="text-[14.5px] leading-relaxed" />
        </div>
      ))}
    </div>
  )
}

function Side({ kind, data }) {
  const naive = kind === 'naive'
  return (
    <Card className={naive ? 'border-danger/35' : 'border-ok/35'}>
      <header className={`flex items-center gap-3 border-b border-line-soft px-6 py-4 ${naive ? 'bg-danger/[.06]' : 'bg-ok/[.05]'}`}>
        {naive ? <ShieldAlert size={22} className="text-[#FF9C9E]" aria-hidden /> : <ShieldCheck size={22} className="text-ok" aria-hidden />}
        <div>
          <h2 className="text-[17px] font-semibold text-text">{naive ? 'Name-only redaction' : 'Kavach redaction'}</h2>
          <p className="text-xs text-faint">{naive ? 'What a find-and-replace on her full name leaves behind' : `${data.redactions} details removed across four layers, then re-checked`}</p>
        </div>
      </header>
      <div className="flex flex-col gap-5 p-6">
        <RiskMeter score={data.score} decision={data.decision} />
        {naive ? (
          <ul className="flex flex-wrap gap-2">
            {data.findings.map((f) => <li key={f.kind} className="rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1 text-xs text-[#FFB4B5]">{f.label}{f.count > 1 ? ` ×${f.count}` : ''} · +{f.points}{f.count > 1 ? ' each' : ''}</li>)}
          </ul>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.applied.map((a) => <li key={a.layer} className="flex items-center justify-between rounded-lg bg-white/[.03] px-3 py-1.5"><span className="text-muted">Layer {a.layer} · {a.label}</span><span className="font-mono text-gold-soft">{a.count}</span></li>)}
            <li className="flex items-center justify-between rounded-lg bg-white/[.03] px-3 py-1.5"><span className="text-muted">Layer 5 · Re-check of the result</span><span className="font-mono text-gold-soft">{data.findings.length ? `${data.findings.length} left` : 'clean'}</span></li>
            <li className="flex items-center justify-between rounded-lg bg-white/[.03] px-3 py-1.5"><span className="text-muted">Layer 6 · Rebuilt from clean text only</span><span className="font-mono text-gold-soft">yes</span></li>
          </ul>
        )}
        <CopyDocument header={data.header} sections={data.sections} />
      </div>
    </Card>
  )
}

export default function RedactionStudio() {
  const { caseId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [profile, setProfile] = useState('public')
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    setData(null)
    api(`/police/cases/${caseId}/copies/preview`, { method: 'POST', body: { profile } }).then(setData).catch((e) => toast(e.message, 'error'))
  }, [caseId, profile, toast])
  useEffect(() => { load() }, [load])

  async function release() {
    setBusy(true)
    try {
      const c = await api(`/police/cases/${caseId}/copies`, { method: 'POST', body: { profile } })
      if (c.status === 'released') { toast('Public copy released.', 'success'); navigate(`/print/copy/${c.id}`) }
      else if (c.status === 'needs_review') { toast('Sent to your supervisor for review.', 'success'); navigate('/police/copies') }
      else toast('Blocked: identity would still be exposed.', 'error')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const k = data?.kavach
  return (
    <div className="flex flex-col gap-8">
      <Link to={`/police/cases/${caseId}`} className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />Back to case sheet</Link>
      <PageHeader eyebrow="Redaction Studio" title={<>Public copy · <span className="font-mono text-2xl tracking-wide">{caseId}</span></>}
        actions={(
          <div role="group" aria-label="Copy profile" className="flex rounded-xl border border-line p-1">
            {[['public', 'Public', ScanEye], ['court', 'Court', Scale]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setProfile(id)} aria-pressed={profile === id}
                className={`flex h-9 items-center gap-2 rounded-lg px-4 text-sm ${profile === id ? 'bg-maroon text-text' : 'text-muted hover:text-text'}`}><Icon size={16} aria-hidden />{label}</button>
            ))}
          </div>
        )}>
        {profile === 'public'
          ? 'Public: the strictest copy, for websites, the press and anyone who asks. Area becomes the city, the date becomes the month, age becomes minor or adult.'
          : 'Court: names, contacts and relatives removed; facts such as the exact date, area and age kept for the court.'}
      </PageHeader>

      {!data ? <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><Skeleton className="h-[520px]" /><Skeleton className="h-[520px]" /></div> : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Side kind="naive" data={data.naive} />
            <Side kind="kavach" data={k} />
          </div>
          <Card className={`flex flex-wrap items-center justify-between gap-5 p-6 ${k.decision === 'blocked' ? 'border-danger/40' : 'border-gold/35'}`}>
            <div className="flex items-center gap-4">
              <Layers size={26} className="text-gold" aria-hidden />
              <div>
                <p className="font-semibold text-text">Release gate</p>
                <p className="text-sm text-muted">
                  {k.decision === 'released' && 'Risk 0–2: this copy can be released now. It is built only from the redacted text, with no hidden layers or metadata.'}
                  {k.decision === 'needs_review' && 'Risk 3–5: a supervisor must review this copy before it can be released.'}
                  {k.decision === 'blocked' && 'Risk 6 or more: identity would still be exposed. This copy cannot be released.'}
                </p>
              </div>
            </div>
            {k.decision === 'released' && <Button icon={FileCheck} size="lg" disabled={busy} onClick={release}>Release public copy</Button>}
            {k.decision === 'needs_review' && <Button icon={Send} size="lg" disabled={busy} onClick={release}>Send for supervisor review</Button>}
            {k.decision === 'blocked' && <Button icon={Ban} size="lg" disabled>Blocked</Button>}
          </Card>
        </>
      )}
    </div>
  )
}
