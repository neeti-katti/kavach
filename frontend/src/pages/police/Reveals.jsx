import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { Card, CaseId, CountdownChip, EmptyState, PageHeader, Skeleton, StatusPill, Table } from '../../components/ui'
import { fmtTime } from './common'

const TONE = { approved: 'ok', pending: 'warn', denied: 'danger', expired: 'neutral' }
const LABEL = { approved: 'Open now', pending: 'With supervisor', denied: 'Denied', expired: 'Closed' }

export default function Reveals() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const load = useCallback(() => api('/police/reveals').then(setRows).catch(() => setRows([])), [])
  useEffect(() => { load() }, [load])
  const columns = [
    { key: 'case', label: 'Case number', render: (r) => <Link to={`/police/cases/${r.case_id}`} className="hover:text-gold-soft"><CaseId>{r.case_id}</CaseId></Link> },
    ...(user.role === 'supervisor' ? [{ key: 'officer', label: 'Officer', render: (r) => <span className="text-muted">{r.officer?.display_name}</span> }] : []),
    { key: 'label', label: 'Detail', render: (r) => <span className="text-text">{r.label}</span> },
    { key: 'task', label: 'For', render: (r) => <span className="text-muted">{r.task_label}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill tone={TONE[r.status]}>{LABEL[r.status]}</StatusPill> },
    { key: 'left', label: 'Time left', render: (r) => (r.status === 'approved' && r.expires_at ? <CountdownChip expiresAt={r.expires_at} onExpire={load} /> : <span className="text-faint">—</span>) },
    { key: 'at', label: 'Requested', render: (r) => <span className="text-faint">{fmtTime(r.created_at)}</span> },
  ]
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Police" title="Reveal requests">
        Every time you asked to see one of a survivor's details: what, for which task, and whether it is open now. Open a detail from its case sheet.
      </PageHeader>
      <Card>
        {!rows ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table columns={columns} rows={rows} empty={<EmptyState icon={Eye} title="No reveal requests">Request a detail from a case sheet when a task needs it.</EmptyState>} />
        )}
      </Card>
    </div>
  )
}
