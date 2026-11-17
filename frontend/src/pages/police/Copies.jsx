import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileCheck, Printer } from 'lucide-react'
import { api } from '../../api'
import { Card, CaseId, EmptyState, PageHeader, Skeleton, StatusPill, Table } from '../../components/ui'
import { fmtTime } from './common'

export const COPY_STATUS = {
  released: ['Released', 'ok'],
  needs_review: ['With supervisor', 'warn'],
  blocked: ['Blocked', 'danger'],
}

export default function Copies() {
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/police/copies').then(setRows).catch(() => setRows([])) }, [])
  const columns = [
    { key: 'case', label: 'Case number', render: (r) => <Link to={`/police/cases/${r.case_id}`} className="hover:text-gold-soft"><CaseId>{r.case_id}</CaseId></Link> },
    { key: 'profile', label: 'Copy', render: (r) => <span className="text-muted capitalize">{r.profile}</span> },
    { key: 'risk', label: 'Risk score', render: (r) => <span className="font-display text-xl text-text">{r.risk_score}</span> },
    { key: 'status', label: 'Status', render: (r) => { const [l, t] = COPY_STATUS[r.status]; return <StatusPill tone={t}>{l}</StatusPill> } },
    { key: 'by', label: 'Made by', render: (r) => <span className="text-muted">{r.created_by}{r.approved_by ? ` · approved by ${r.approved_by}` : ''}</span> },
    { key: 'at', label: 'Made', render: (r) => <span className="text-faint">{fmtTime(r.created_at)}</span> },
    { key: 'open', label: '', render: (r) => (r.status === 'released'
      ? <Link to={`/print/copy/${r.id}`} className="flex items-center gap-1.5 text-sm text-gold-soft hover:underline"><Printer size={15} aria-hidden />Open copy</Link>
      : <span className="text-xs text-faint">{r.status === 'blocked' ? 'Not printable' : 'After approval'}</span>) },
  ]
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Police" title="Public copies">
        Every redacted copy made from your cases, with its risk score. Only released copies can be opened and printed. Make a new one from a case sheet.
      </PageHeader>
      <Card>
        {!rows ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table columns={columns} rows={rows} empty={<EmptyState icon={FileCheck} title="No public copies yet">Open a case and choose "Public copy" to compare redactions and release one.</EmptyState>} />
        )}
      </Card>
    </div>
  )
}
