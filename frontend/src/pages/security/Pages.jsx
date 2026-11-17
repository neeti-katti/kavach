import { useMemo, useState } from 'react'
import { Ban, FileWarning, KeyRound, Lock, Radar, ScrollText, ShieldCheck, Siren, Unlock } from 'lucide-react'
import { api } from '../../api'
import { useToast } from '../../components/toast'
import { Button, Card, CardHeader, CaseId, EmptyState, Modal, PageHeader, Skeleton, StatusPill, Table, inputClass } from '../../components/ui'
import { ROLE_NAMES, fmtTime } from '../police/common'
import { AlertFeed, KIND, usePoll } from './common'

export function AlertsPage() {
  const toast = useToast()
  const [alerts, reload] = usePoll('/security/alerts')
  const [kind, setKind] = useState('all')
  const shown = (alerts ?? []).filter((a) => kind === 'all' || a.kind === kind)
  async function resolve(a) {
    try { await api(`/security/alerts/${a.id}/resolve`, { method: 'POST', body: {} }); toast('Alert resolved.', 'success'); reload() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Security" title="Alerts">Every tripwire that fired, newest first. Refreshes every 2 seconds.</PageHeader>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line-soft px-6 py-4" role="tablist">
          {[['all', 'All'], ...Object.entries(KIND).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm ${kind === k ? 'bg-maroon text-text' : 'text-muted hover:bg-white/[.04] hover:text-text'}`}>
              {label}<span className="ml-1.5 text-xs opacity-70">{(alerts ?? []).filter((a) => k === 'all' || a.kind === k).length}</span>
            </button>
          ))}
        </div>
        {!alerts ? <div className="p-6"><Skeleton className="h-16" /></div> : <AlertFeed alerts={shown} onResolve={resolve} />}
      </Card>
    </div>
  )
}

export function LockedPage() {
  const toast = useToast()
  const [rows, reload] = usePoll('/security/locked', 4000)
  const [blocked, reloadBlocked] = usePoll('/security/blocked', 4000)
  const [confirm, setConfirm] = useState(null)
  async function unlock() {
    try { await api(`/security/users/${confirm.id}/unlock`, { method: 'POST', body: {} }); toast(`${confirm.display_name} can sign in again.`, 'success'); setConfirm(null); reload() } catch (e) { toast(e.message, 'error') }
  }
  async function unblock(b) {
    try { await api('/security/blocked/unblock', { method: 'POST', body: { key: b.key } }); toast('Client unblocked.', 'success'); reloadBlocked() } catch (e) { toast(e.message, 'error') }
  }
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Security" title="Locked accounts">
        Accounts locked automatically by a tripwire. Every open session ended at the moment of the lock. Unlock only after you have checked the alert.
      </PageHeader>
      <Card>
        <CardHeader icon={Lock} title="Locked accounts" />
        {!rows ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table rows={rows} empty={<EmptyState icon={ShieldCheck} title="No locked accounts" />} columns={[
            { key: 'name', label: 'Account', render: (u) => <span className="text-text">{u.display_name}</span> },
            { key: 'badge', label: 'Badge', render: (u) => <span className="font-mono text-muted">{u.badge ?? '—'}</span> },
            { key: 'role', label: 'Role', render: (u) => <span className="text-muted">{ROLE_NAMES[u.role]}</span> },
            { key: 'station', label: 'Station', render: (u) => <span className="text-muted">{u.station ?? '—'}</span> },
            { key: 'reason', label: 'Why', render: (u) => <span className="text-[#FFB4B5]">{u.locked_reason}</span> },
            { key: 'act', label: '', render: (u) => <Button size="sm" variant="secondary" icon={Unlock} onClick={() => setConfirm(u)}>Unlock</Button> },
          ]} />
        )}
      </Card>
      <Card>
        <CardHeader icon={Ban} title="Blocked clients" subtitle="Clients that requested a decoy endpoint" />
        {!blocked ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table rows={blocked} empty={<p className="px-6 py-5 text-sm text-faint">No blocked clients.</p>} columns={[
            { key: 'ip', label: 'Address', render: (b) => <span className="font-mono text-text">{b.ip}</span> },
            { key: 'ua', label: 'Client', render: (b) => <span className="text-xs text-muted">{b.ua?.slice(0, 70)}</span> },
            { key: 'reason', label: 'Why', render: (b) => <span className="text-[#FFB4B5]">{b.reason}</span> },
            { key: 'at', label: 'Since', render: (b) => <span className="text-faint">{fmtTime(b.created_at)}</span> },
            { key: 'act', label: '', render: (b) => <Button size="sm" variant="ghost" onClick={() => unblock(b)}>Unblock</Button> },
          ]} />
        )}
      </Card>
      <Modal open={!!confirm} title="Unlock account" onClose={() => setConfirm(null)}
        actions={<><Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button><Button icon={Unlock} onClick={unlock}>Unlock</Button></>}>
        <p>Unlock <span className="font-semibold text-text">{confirm?.display_name}</span>? They were locked because: <span className="text-[#FFB4B5]">{confirm?.locked_reason}</span>.</p>
        <p className="mt-3">The unlock is recorded in the audit log with your badge number.</p>
      </Modal>
    </div>
  )
}

export function DecoysPage() {
  const [d] = usePoll('/security/decoys', 4000)
  const hits = (n) => (n ? <StatusPill tone="alert">{n} hit{n > 1 ? 's' : ''}</StatusPill> : <StatusPill tone="ok">Untouched</StatusPill>)
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Security" title="Decoys">
        Tripwires that no honest workflow ever touches. Decoy cases are never listed or linked; decoy endpoints are never called by the app; the honey account's password sits in a planted old config file.
      </PageHeader>
      {!d ? <Skeleton className="h-64" /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader icon={FileWarning} title="Decoy cases" subtitle="Realistic records among real case numbers" />
            <ul className="flex flex-col gap-2 p-4">
              {d.canaries.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-white/[.02] px-4 py-3">
                  <span><CaseId>{c.id}</CaseId><span className="block text-xs text-faint">{c.area}</span></span>{hits(c.hits)}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader icon={Radar} title="Decoy endpoints" subtitle="Paths an attacker would probe" />
            <ul className="flex flex-col gap-2 p-4">
              {d.endpoints.map((e) => (
                <li key={e.path} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-white/[.02] px-4 py-2.5">
                  <span className="font-mono text-[13px] text-text">{e.path}</span>{hits(e.hits)}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader icon={KeyRound} title="Honey credentials" subtitle="A login that only an intruder would know" />
            <ul className="flex flex-col gap-2 p-4">
              {d.honey_accounts.map((h) => (
                <li key={h.username} className="flex flex-col gap-2 rounded-xl border border-line-soft bg-white/[.02] px-4 py-3">
                  <span className="flex items-center justify-between"><span className="font-mono text-text">{h.username}</span>{hits(h.hits)}</span>
                  <span className="text-xs text-faint">Password planted in <span className="font-mono text-muted">{h.planted_in}</span>. Signing in opens an empty view and raises a critical alert.</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

const ACTION_LABEL = {
  alert_raised: 'Alert raised', account_locked: 'Account locked', account_unlocked: 'Account unlocked', client_blocked: 'Client blocked',
  client_unblocked: 'Client unblocked', honey_activity: 'Honey account activity', case_access_denied: 'Case access denied', login: 'Signed in',
  login_failed: 'Failed sign-in', password_ok: 'Password accepted', logout: 'Signed out', complaint_filed: 'Complaint filed',
  case_assigned: 'Case assigned', case_accepted: 'Case accepted', case_viewed: 'Case sheet viewed', reveal_requested: 'Reveal requested',
  reveal_viewed: 'Identity detail viewed', reveal_approved: 'Reveal approved', reveal_denied: 'Reveal denied', case_sealed: 'Case sealed',
  case_reopened: 'Case reopened', masked_call: 'Masked call', copy_previewed: 'Copy previewed', copy_released: 'Public copy released',
  copy_sent_for_review: 'Copy sent for review', copy_blocked: 'Copy blocked', copy_viewed: 'Public copy opened', alert_resolved: 'Alert resolved',
  system_seeded: 'System set up', survivor_account_created: 'Survivor account created', allocation_escalated: 'Escalated',
}

export function AuditPage() {
  const [data] = usePoll('/security/audit?limit=300', 5000)
  const [q, setQ] = useState('')
  const rows = useMemo(() => (data?.entries ?? []).filter((e) => !q || `${e.action} ${e.case_id ?? ''} ${e.detail ?? ''} ${e.actor?.display_name ?? ''}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Security" title="Audit log"
        actions={data && <StatusPill tone={data.chain_ok ? 'ok' : 'alert'}>{data.chain_ok ? 'Hash chain intact' : `Chain broken at entry ${data.first_bad}`}</StatusPill>}>
        Every action in Kavach. Each entry carries a hash of the one before it, so an edited or deleted entry shows up as a break in the chain. No personal data is ever written here.
      </PageHeader>
      <Card>
        <div className="border-b border-line-soft px-6 py-4">
          <input className={`${inputClass} max-w-md`} placeholder="Filter by action, case number or account" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter the audit log" />
        </div>
        {!data ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table rows={rows} empty={<EmptyState icon={ScrollText} title="No entries match" />} columns={[
            { key: 'id', label: '#', render: (e) => <span className="font-mono text-faint">{e.id}</span> },
            { key: 'ts', label: 'Time', render: (e) => <span className="whitespace-nowrap text-faint">{fmtTime(e.ts)}</span> },
            { key: 'action', label: 'Action', render: (e) => <span className={e.action === 'alert_raised' || e.action === 'account_locked' ? 'text-[#FFB4B5]' : 'text-text'}>{ACTION_LABEL[e.action] ?? e.action}</span> },
            { key: 'actor', label: 'Account', render: (e) => <span className="text-muted">{e.actor ? `${e.actor.display_name}${e.actor.badge ? ` (${e.actor.badge})` : ''}` : 'Kavach'}</span> },
            { key: 'case', label: 'Case', render: (e) => (e.case_id ? <CaseId>{e.case_id}</CaseId> : <span className="text-faint">—</span>) },
            { key: 'detail', label: 'Detail', render: (e) => <span className="font-mono text-xs text-faint">{e.detail}</span> },
            { key: 'hash', label: 'Hash', render: (e) => <span className="font-mono text-xs text-faint">{e.hash.slice(0, 10)}…</span> },
          ]} />
        )}
      </Card>
    </div>
  )
}


