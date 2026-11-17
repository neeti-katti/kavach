import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardCheck, FileText, KeyRound, X } from 'lucide-react'
import { api } from '../../api'
import { TokenText } from '../../components/TokenText'
import { useToast } from '../../components/toast'
import { Button, Card, CardHeader, CaseId, EmptyState, PageHeader, Skeleton, StatusPill, Table } from '../../components/ui'
import { fmtTime } from './common'

const TONE = { approved: 'ok', pending: 'warn', denied: 'danger', expired: 'neutral' }

export default function Approvals() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const [copies, setCopies] = useState([])
  const load = useCallback(() => {
    api('/police/reveals').then(setRows).catch(() => setRows([]))
    api('/police/copies').then((c) => setCopies(c.filter((x) => x.status === 'needs_review'))).catch(() => setCopies([]))
  }, [])
  useEffect(() => { load() }, [load])

  async function decideCopy(c, approve) {
    try {
      await api(`/police/copies/${c.id}/decide`, { method: 'POST', body: { approve } })
      toast(approve ? 'Public copy released.' : 'Public copy blocked.', 'success')
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function decide(r, approve) {
    setBusy(r.id)
    try {
      await api(`/police/reveals/${r.id}/decide`, { method: 'POST', body: { approve } })
      toast(approve ? `Approved: ${r.label} opens for 60 seconds.` : 'Request denied.', 'success')
      await load()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(null) }
  }

  const pending = (rows ?? []).filter((r) => r.status === 'pending')
  const decided = (rows ?? []).filter((r) => r.status !== 'pending').slice(0, 10)
  const base = [
    { key: 'case', label: 'Case number', render: (r) => <Link to={`/police/cases/${r.case_id}`} className="hover:text-gold-soft"><CaseId>{r.case_id}</CaseId></Link> },
    { key: 'officer', label: 'Officer', render: (r) => <span className="text-muted">{r.officer?.display_name}</span> },
    { key: 'label', label: 'Detail', render: (r) => <span className="text-text">{r.label}</span> },
    { key: 'task', label: 'For', render: (r) => <span className="text-muted">{r.task_label}</span> },
  ]
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Supervisor" title="Approvals">
        Reveal requests that are not routine wait here. Approving opens that one detail to that one officer for 60 seconds, on record.
      </PageHeader>
      <Card>
        <CardHeader icon={KeyRound} title="Waiting for your decision" subtitle={`${pending.length} request${pending.length === 1 ? '' : 's'}`} />
        {!rows ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table rows={pending} empty={<EmptyState icon={ClipboardCheck} title="Nothing waiting">New requests from your officers appear here.</EmptyState>}
            columns={[...base,
              { key: 'reason', label: 'Reason', render: (r) => <TokenText text={r.reason} className="max-w-sm text-muted" /> },
              { key: 'at', label: 'Asked', render: (r) => <span className="text-faint">{fmtTime(r.created_at)}</span> },
              { key: 'act', label: '', render: (r) => (
                <span className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" icon={X} disabled={busy === r.id} onClick={() => decide(r, false)}>Deny</Button>
                  <Button size="sm" icon={Check} disabled={busy === r.id} onClick={() => decide(r, true)}>Approve</Button>
                </span>
              ) },
            ]} />
        )}
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader icon={ClipboardCheck} title="Recent decisions and automatic approvals" />
          <Table rows={decided} empty={<p className="px-6 py-5 text-sm text-faint">None yet.</p>}
            columns={[...base, { key: 'status', label: 'Status', render: (r) => <StatusPill tone={TONE[r.status]}>{r.status}</StatusPill> },
              { key: 'at', label: 'Asked', render: (r) => <span className="text-faint">{fmtTime(r.created_at)}</span> }]} />
        </Card>
        <Card className="xl:col-span-4">
          <CardHeader icon={FileText} title="Public copies to review" subtitle="Risk score 3 to 5" />
          {copies.length === 0 ? <EmptyState icon={FileText} title="None waiting">Medium-risk public copies wait here for your decision.</EmptyState> : (
            <ul className="flex flex-col gap-2 p-4">
              {copies.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-line-soft bg-white/[.02] px-4 py-3">
                  <span className="flex items-center justify-between"><CaseId>{c.case_id}</CaseId><span className="text-sm text-[#F3C27A]">risk {c.risk_score}</span></span>
                  <span className="text-xs text-faint">{c.findings.map((f) => f.label).join(', ')}</span>
                  <span className="flex justify-end gap-2">
                    <Button size="sm" variant="secondary" icon={X} onClick={() => decideCopy(c, false)}>Block</Button>
                    <Button size="sm" icon={Check} onClick={() => decideCopy(c, true)}>Release</Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
