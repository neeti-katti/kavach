import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, Check, ClipboardList, Eye, FileCheck, History, KeyRound, Lock, LockKeyhole, MapPin,
  Phone, PhoneCall, RotateCcw, ScanLine, Send, ShieldCheck, Siren, UserCheck, Users,
} from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { TokenText } from '../../components/TokenText'
import { useToast } from '../../components/toast'
import { Button, Card, CardHeader, CaseId, CountdownChip, EmptyState, Field, Modal, Skeleton, StatusPill, inputClass } from '../../components/ui'
import { Watermark } from '../../components/Watermark'
import { CaseStatus, EVENT_LABELS, ROLE_NAMES, fmtTime, useClock } from './common'

const textarea = inputClass.replace('h-11', 'min-h-[110px] py-3')
const NEXT_STEP = {
  statement_scheduled: { label: 'Mark statement scheduled', icon: CalendarClock },
  investigating: { label: 'Start investigation', icon: ScanLine },
}
const LANG_NAME = { en: 'English', hi: 'Hindi', kn: 'Kannada' }

function RevealModal({ reveal, onClose, user }) {
  const clock = useClock()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!reveal) return
    setData(null)
    setError('')
    api(`/police/reveals/${reveal.id}/value`).then(setData).catch((e) => setError(e.message))
  }, [reveal])
  if (!reveal) return null
  return (
    <Modal open title={reveal.label} onClose={onClose}
      actions={<Button variant="secondary" onClick={onClose}>Close now</Button>}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">For: <span className="text-text">{reveal.task_label}</span></span>
        {data && <CountdownChip expiresAt={data.expires_at} onExpire={onClose} />}
      </div>
      <div data-sensitive onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}
        className="relative min-h-[140px] overflow-hidden rounded-xl border border-gold/40 bg-ink/80 p-6 select-none">
        <Watermark text={`${user.badge} · ${user.display_name} · ${clock}`} />
        {!data && !error && <Skeleton className="h-8 w-2/3" />}
        {error && <p className="relative text-[#FFB4B5]">{error}</p>}
        {data?.value && <p className="relative text-2xl leading-snug font-semibold whitespace-pre-wrap text-text">{data.value}</p>}
        {data?.data_url && <img src={data.data_url} alt="Original complaint photo" className="relative max-h-[60vh] w-full object-contain" draggable="false" />}
      </div>
      <p className="mt-4 text-xs text-faint">Copying, right-click and printing are blocked. This view is logged and closes automatically.</p>
    </Modal>
  )
}

export default function CaseSheet() {
  const { caseId } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const officer = user.role === 'officer'
  const [c, setC] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(null) // 'reveal' | 'report' | 'call' | 'reassign' | 'reopen'
  const [openReveal, setOpenReveal] = useState(null)
  const [form, setForm] = useState({})
  const [callInfo, setCallInfo] = useState(null)
  const [officers, setOfficers] = useState([])

  const load = useCallback(() => api(`/police/cases/${caseId}`).then(setC).catch((e) => setError(e.message)), [caseId])
  useEffect(() => { load() }, [load])

  async function act(fn, success) {
    setBusy(true)
    try { await fn(); if (success) toast(success, 'success'); setModal(null); await load() } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  async function placeCall() {
    setBusy(true)
    try {
      setCallInfo(await api(`/police/cases/${caseId}/call`, { method: 'POST', body: {} }))
      setModal('call')
      await load()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  if (error) return <Card><EmptyState icon={Lock} title="Case not available">This case does not exist or is not assigned to you. The attempt has been recorded.</EmptyState></Card>
  if (!c) return <div className="flex flex-col gap-6"><Skeleton className="h-40" /><Skeleton className="h-72" /></div>

  const active = c.accepted && !c.sealed
  const liveReveal = (field) => c.reveals.find((r) => r.field === field && (r.status === 'approved' || r.status === 'pending'))
  const next = { assigned: 'statement_scheduled', statement_scheduled: 'investigating' }[c.status]

  let primary = null
  if (officer && !c.accepted) primary = <Button icon={UserCheck} disabled={busy} onClick={() => act(() => api(`/police/cases/${c.id}/accept`, { method: 'POST', body: {} }), 'Case accepted.')}>Accept case</Button>
  else if (officer && active && next) {
    const s = NEXT_STEP[next]
    primary = <Button icon={s.icon} disabled={busy} onClick={() => act(() => api(`/police/cases/${c.id}/status`, { method: 'POST', body: { status: next } }), `${s.label.replace('Mark ', '')}.`)}>{s.label}</Button>
  } else if (officer && active && c.status === 'investigating') primary = <Button icon={FileCheck} onClick={() => { setForm({ summary: '' }); setModal('report') }}>File final report</Button>
  else if (!officer && c.sealed) primary = <Button icon={RotateCcw} onClick={() => { setForm({ reason: '' }); setModal('reopen') }}>Reopen case</Button>
  else if (!officer) primary = <Button icon={Users} onClick={async () => { setOfficers(await api('/police/officers')); setForm({ officer_id: '', reason: '' }); setModal('reassign') }}>Reassign</Button>

  return (
    <div className="flex flex-col gap-6">
      <Link to={officer ? '/police/cases' : '/police/allocation'} className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />Back to cases</Link>

      <Card className="p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[.2em] text-gold uppercase">Case sheet</p>
            <p className="font-mono text-3xl tracking-wider text-text">{c.id}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CaseStatus c={c} />
              {c.urgent && <StatusPill tone="alert">Urgent</StatusPill>}
              {c.is_child && <StatusPill tone="info">Child survivor</StatusPill>}
              <StatusPill tone="neutral">{LANG_NAME[c.language] ?? c.language} · {c.source === 'scan' ? 'from a photo' : 'typed'}</StatusPill>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {officer && active && <Button variant="secondary" icon={Phone} disabled={busy} onClick={placeCall}>Call survivor</Button>}
            {primary}
          </div>
        </div>
        <div className="gold-divider my-6" />
        <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="flex items-center gap-2 text-faint"><MapPin size={15} aria-hidden />Area</dt><dd className="mt-1 text-text">{c.area}</dd></div>
          <div><dt className="flex items-center gap-2 text-faint"><CalendarClock size={15} aria-hidden />Incident</dt><dd className="mt-1 text-text">{c.incident?.date ?? 'Date not given'}{c.incident?.time ? `, ${c.incident.time}` : ''}</dd></div>
          <div><dt className="flex items-center gap-2 text-faint"><ShieldCheck size={15} aria-hidden />Category</dt><dd className="mt-1 text-text">{c.category === 'child_victim' ? 'Sexual offence, child victim' : 'Sexual offence'} · {c.age_group}</dd></div>
          <div><dt className="flex items-center gap-2 text-faint"><UserCheck size={15} aria-hidden />Assigned</dt>
            <dd className="mt-1 text-text">{c.officer ? `${c.officer.display_name} (${c.officer.badge})` : 'Nobody yet'}</dd>
            <dd className="mt-0.5 text-xs text-faint">{c.allocation_reason}</dd>
            {officer && !c.accepted && c.accept_by && <dd className="mt-2 flex items-center gap-2 text-xs text-muted">Accept within {c.escalated ? <StatusPill tone="alert">Escalated</StatusPill> : <CountdownChip expiresAt={c.accept_by} onExpire={load} />}</dd>}
          </div>
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Card>
            <CardHeader icon={ClipboardList} title="Complaint, as police see it" subtitle="The survivor's identity was replaced when she filed it" />
            <div className="flex flex-col gap-5 p-6 text-[15px] leading-relaxed text-text">
              <TokenText text={c.narrative} />
              <div className="gold-divider" />
              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-[11rem_1fr]">
                {c.incident?.place && (<><dt className="text-faint">Where it happened</dt><dd><TokenText text={c.incident.place} /></dd></>)}
                {c.accused && (<><dt className="text-faint">Person responsible</dt><dd><TokenText text={c.accused} /></dd></>)}
              </dl>
            </div>
          </Card>

          {c.report_summary && (
            <Card className="border-gold/30">
              <CardHeader icon={FileCheck} title="Final report" subtitle={`Filed ${fmtTime(c.sealed_at)}`} />
              <div className="p-6 text-[15px] leading-relaxed text-text"><TokenText text={c.report_summary} /></div>
            </Card>
          )}

          <Card>
            <CardHeader icon={History} title="Case timeline" subtitle="From the tamper-evident audit log" />
            <ol className="flex flex-col gap-0 px-6 py-4">
              {c.timeline.map((e, i) => (
                <li key={i} className="flex gap-4 border-l border-line-soft py-2.5 pl-5 text-sm" style={{ marginLeft: 6 }}>
                  <span className="-ml-[27px] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gold/80 ring-4 ring-surface" aria-hidden />
                  <span className="w-32 shrink-0 text-faint">{fmtTime(e.ts)}</span>
                  <span className="text-text">{EVENT_LABELS[e.action] ?? e.action}</span>
                  <span className="ml-auto text-xs text-faint">{e.actor_role ? ROLE_NAMES[e.actor_role] : 'Kavach'}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          <Card className={c.sealed ? 'border-line' : 'border-gold/30'}>
            <CardHeader icon={LockKeyhole} title="Identity, sealed" subtitle={officer ? 'Open one detail for one task, for 60 seconds' : 'Officers request; you approve under Approvals'} />
            <div className="flex flex-col gap-2 p-4">
              {c.sealed && <p className="mb-2 rounded-xl border border-line bg-white/[.03] px-4 py-3 text-sm text-muted">Sealed on {fmtTime(c.sealed_at)}. Only a supervisor can reopen it.</p>}
              {c.revealable.map((f) => {
                const r = liveReveal(f.field)
                return (
                  <div key={f.field} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-white/[.02] px-4 py-3">
                    <span className="flex items-center gap-2.5 text-sm text-text"><Lock size={15} className="text-gold" aria-hidden />{f.label}</span>
                    {officer && r?.status === 'approved' && (
                      <span className="flex items-center gap-2">
                        <CountdownChip expiresAt={r.expires_at} onExpire={load} />
                        <Button size="sm" variant="gold" icon={Eye} onClick={() => setOpenReveal(r)}>Open</Button>
                      </span>
                    )}
                    {officer && r?.status === 'pending' && <StatusPill tone="warn">With supervisor</StatusPill>}
                    {officer && !r && !c.sealed && <Button size="sm" variant="secondary" icon={KeyRound} disabled={!active}
                      onClick={() => { setForm({ field: f.field, task: 'record_statement', reason: '' }); setModal('reveal') }}>Request</Button>}
                  </div>
                )
              })}
              {c.masked.map((f) => (
                <div key={f.field} className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-2.5 text-muted"><Phone size={15} aria-hidden />{f.label}</span>
                  <span className="text-xs text-faint">Never shown · masked call</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader icon={PhoneCall} title="Masked calls" subtitle="Neither side sees the other's number" />
            {c.calls.length === 0 ? <p className="px-6 py-5 text-sm text-faint">No calls yet.</p> : (
              <ul className="flex flex-col px-6 py-3 text-sm">
                {c.calls.map((k, i) => <li key={i} className="flex justify-between border-b border-line-soft py-2 last:border-0"><span className="font-mono text-text">{k.relay_number}</span><span className="text-faint">{fmtTime(k.created_at)}</span></li>)}
              </ul>
            )}
          </Card>

          {officer && c.reveals.length > 0 && (
            <Card>
              <CardHeader icon={Eye} title="My requests on this case" />
              <ul className="flex flex-col gap-2 p-4 text-sm">
                {c.reveals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                    <span><span className="text-text">{r.label}</span><span className="block text-xs text-faint">{r.task_label}</span></span>
                    <StatusPill tone={{ approved: 'ok', pending: 'warn', denied: 'danger', expired: 'neutral' }[r.status]}>{r.status}</StatusPill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <RevealModal reveal={openReveal} onClose={() => { setOpenReveal(null); load() }} user={user} />

      <Modal open={modal === 'reveal'} title="Request one identity detail" onClose={() => setModal(null)}
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
          <Button icon={Send} disabled={busy || (form.reason ?? '').trim().length < 10}
            onClick={() => act(async () => {
              const r = await api(`/police/cases/${c.id}/reveals`, { method: 'POST', body: form })
              toast(r.status === 'approved' ? 'Approved. Open it within 60 seconds.' : 'Sent to your supervisor for approval.', 'success')
            })}>Send request</Button></>}>
        <div className="flex flex-col gap-4">
          <p>Detail: <span className="font-semibold text-text">{c.revealable.find((f) => f.field === form.field)?.label}</span></p>
          <Field label="What is it for?" id="rv-task">
            <select id="rv-task" className={inputClass} value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })}>
              {c.tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Reason" id="rv-reason" hint="At least 10 characters. Recorded with your badge number.">
            <textarea id="rv-reason" className={textarea} value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <p className="text-xs text-faint">Statement, medical examination and court papers open at once for 60 seconds. Anything else goes to your supervisor first.</p>
        </div>
      </Modal>

      <Modal open={modal === 'report'} title="File the final report" onClose={() => setModal(null)}
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
          <Button icon={Lock} disabled={busy || (form.summary ?? '').trim().length < 10}
            onClick={() => act(() => api(`/police/cases/${c.id}/submit-report`, { method: 'POST', body: { summary: form.summary } }), 'Report filed. The survivor\'s identity is now sealed.')}>File and seal</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[#F3C27A]">Filing the report seals the survivor's identity. You will lose access to every identity detail on this case. Only a supervisor can reopen it.</p>
          <Field label="Summary of the investigation" id="rp-summary" hint="Any of the survivor's details you type here are replaced automatically.">
            <textarea id="rp-summary" className={textarea} value={form.summary ?? ''} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={modal === 'call'} title="Masked call" onClose={() => setModal(null)} actions={<Button onClick={() => setModal(null)} icon={Check}>Done</Button>}>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-ok/15 text-ok"><PhoneCall size={26} aria-hidden /></span>
          <p className="text-text">Connected through relay</p>
          <p className="font-mono text-2xl text-gold-soft">{callInfo?.relay_number}</p>
          <p className="text-xs text-faint">Simulated in this demo. The survivor's number never reaches your phone or this screen.</p>
        </div>
      </Modal>

      <Modal open={modal === 'reassign'} title="Reassign case" onClose={() => setModal(null)}
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
          <Button icon={Users} disabled={busy || !form.officer_id || (form.reason ?? '').trim().length < 10}
            onClick={() => act(() => api(`/police/cases/${c.id}/reassign`, { method: 'POST', body: { officer_id: Number(form.officer_id), reason: form.reason } }), 'Case reassigned.')}>Reassign</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="New officer" id="ra-officer">
            <select id="ra-officer" className={inputClass} value={form.officer_id ?? ''} onChange={(e) => setForm({ ...form, officer_id: e.target.value })}>
              <option value="">Choose an officer</option>
              {officers.filter((o) => o.on_duty && !o.locked).map((o) => <option key={o.id} value={o.id}>{o.display_name} · {o.open_cases} open{o.gender === 'F' ? ' · woman officer' : ''}{o.child_trained ? ' · child-trained' : ''}</option>)}
            </select>
          </Field>
          <Field label="Reason" id="ra-reason" hint="At least 10 characters. Recorded in the audit log.">
            <textarea id="ra-reason" className={textarea} value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={modal === 'reopen'} title="Reopen sealed case" onClose={() => setModal(null)}
        actions={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
          <Button icon={RotateCcw} disabled={busy || (form.reason ?? '').trim().length < 10}
            onClick={() => act(() => api(`/police/cases/${c.id}/reopen`, { method: 'POST', body: { reason: form.reason } }), 'Case reopened.')}>Reopen</Button></>}>
        <Field label="Reason" id="ro-reason" hint="At least 10 characters. Recorded in the audit log.">
          <textarea id="ro-reason" className={textarea} value={form.reason ?? ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
      </Modal>
    </div>
  )
}
