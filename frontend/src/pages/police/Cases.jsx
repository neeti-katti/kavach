import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Baby, FolderOpen, Inbox, Siren, X } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { Card, CaseId, EmptyState, PageHeader, Skeleton, Table } from '../../components/ui'
import { CaseStatus, STAGE, fmtTime } from './common'

const TABS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'waiting', label: 'Awaiting acceptance', test: (c) => !c.accepted && !c.sealed },
  { id: 'active', label: 'Active', test: (c) => c.accepted && !c.sealed },
  { id: 'sealed', label: 'Sealed', test: (c) => c.sealed },
]

export function caseColumns(showOfficer) {
  return [
    { key: 'id', label: 'Case number', render: (c) => <Link to={`/police/cases/${c.id}`} className="hover:text-gold-soft"><CaseId>{c.id}</CaseId></Link> },
    { key: 'status', label: 'Status', render: (c) => <CaseStatus c={c} /> },
    { key: 'stage', label: 'Stage', render: (c) => <span className="text-muted">{STAGE[c.status]}</span> },
    { key: 'area', label: 'Area', render: (c) => <span className="text-muted">{c.area}</span> },
    ...(showOfficer ? [{ key: 'officer', label: 'Officer', render: (c) => <span className="text-muted">{c.officer?.display_name ?? '—'}</span> }] : []),
    { key: 'flags', label: 'Flags', render: (c) => (
      <span className="flex gap-2 text-xs">
        {c.urgent && <span className="flex items-center gap-1 text-[#FFB4B5]"><Siren size={14} aria-hidden />Urgent</span>}
        {c.is_child && <span className="flex items-center gap-1 text-gold-soft"><Baby size={14} aria-hidden />Child</span>}
      </span>
    ) },
    { key: 'updated', label: 'Last updated', render: (c) => <span className="text-faint">{fmtTime(c.updated_at)}</span> },
    { key: 'open', label: '', render: (c) => <Link to={`/police/cases/${c.id}`} className="text-faint hover:text-gold-soft" aria-label={`Open ${c.id}`}><ArrowRight size={17} /></Link> },
  ]
}

export default function Cases() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    setRows(null)
    api(`/police/cases${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setRows).catch(() => setRows([]))
  }, [q])

  const filter = TABS.find((t) => t.id === tab)
  const shown = (rows ?? []).filter(filter.test)
  const supervisor = user.role === 'supervisor'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Police" title={supervisor ? 'Station cases' : 'My cases'}>
        Cases appear by case number only. Survivors' names and contact details are never part of this list.
      </PageHeader>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-4">
          <div role="tablist" className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm ${tab === t.id ? 'bg-maroon text-text' : 'text-muted hover:bg-white/[.04] hover:text-text'}`}>
                {t.label}{rows && <span className="ml-1.5 text-xs opacity-70">{rows.filter(t.test).length}</span>}
              </button>
            ))}
          </div>
          {q && (
            <button onClick={() => setParams({})} className="flex items-center gap-1.5 rounded-lg border border-gold/40 px-3 py-1.5 text-sm text-gold-soft">
              Search: <span className="font-mono">{q}</span><X size={14} aria-hidden />
            </button>
          )}
        </div>
        {!rows ? <div className="flex flex-col gap-3 p-6"><Skeleton className="h-10" /><Skeleton className="h-10" /></div> : (
          <Table columns={caseColumns(supervisor)} rows={shown} empty={(
            <EmptyState icon={q ? Inbox : FolderOpen} title={q ? 'No case with that number' : 'No cases here'}>
              {q ? 'Only cases assigned to you can be found.' : 'New complaints routed to you appear here.'}
            </EmptyState>
          )} />
        )}
      </Card>
    </div>
  )
}
