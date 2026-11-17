import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Baby, Inbox, Siren, UserCheck, Users } from 'lucide-react'
import { api } from '../../api'
import { Card, CardHeader, CaseId, CountdownChip, EmptyState, PageHeader, Skeleton, StatusPill, Table } from '../../components/ui'
import { fmtTime } from './common'

const RULES = [
  'Officers at the station for the incident pin code, on duty',
  'Women officers first',
  'For a child survivor, officers trained for child cases first',
  'Fewest open cases, then whoever was assigned longest ago',
  'Not accepted within 2 minutes (2 hours in real use): escalated to you',
]

export default function Allocation() {
  const [cases, setCases] = useState(null)
  const [officers, setOfficers] = useState(null)
  useEffect(() => {
    api('/police/cases').then(setCases).catch(() => setCases([]))
    api('/police/officers').then(setOfficers).catch(() => setOfficers([]))
  }, [])

  const columns = [
    { key: 'id', label: 'Case number', render: (c) => <Link to={`/police/cases/${c.id}`} className="hover:text-gold-soft"><CaseId>{c.id}</CaseId></Link> },
    { key: 'officer', label: 'Assigned to', render: (c) => <span className="whitespace-nowrap text-text">{c.officer?.display_name ?? '—'}</span> },
    { key: 'why', label: 'Why this officer', render: (c) => <span className="block min-w-[220px] text-xs text-muted">{c.allocation_reason}</span> },
    { key: 'accept', label: 'Acceptance', render: (c) => (c.accepted ? <StatusPill tone="ok">Accepted</StatusPill>
      : c.escalated ? <StatusPill tone="alert">Escalated</StatusPill>
        : c.accept_by ? <CountdownChip expiresAt={c.accept_by} /> : '—') },
    { key: 'flags', label: '', render: (c) => (
      <span className="flex gap-2">
        {c.urgent && <Siren size={16} className="text-[#FFB4B5]" aria-label="Urgent" />}
        {c.is_child && <Baby size={16} className="text-gold-soft" aria-label="Child survivor" />}
      </span>
    ) },
    { key: 'updated', label: 'Updated', render: (c) => <span className="text-faint">{fmtTime(c.updated_at)}</span> },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Supervisor" title="Allocation">
        Every complaint at your station, who it went to and why. Open a case to reassign it.
      </PageHeader>
      <Card>
        <CardHeader icon={Inbox} title="Station cases" />
        {!cases ? <div className="p-6"><Skeleton className="h-10" /></div> : (
          <Table columns={columns} rows={cases} empty={<EmptyState icon={Inbox} title="No complaints at your station yet" />} />
        )}
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader icon={Users} title="Officers" subtitle="Open cases decide who is next" />
            {!officers ? <div className="p-6"><Skeleton className="h-10" /></div> : (
              <ul className="flex flex-col gap-2 p-4">
                {officers.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl border border-line-soft bg-white/[.02] px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-text">{o.display_name}</span>
                      <span className="block text-xs text-faint">{o.badge}{o.gender === 'F' ? ' · woman officer' : ''}{o.child_trained ? ' · child-trained' : ''}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-display text-2xl text-text">{o.open_cases}</span>
                      <StatusPill tone={o.on_duty && !o.locked ? 'ok' : 'neutral'}>{o.locked ? 'Locked' : o.on_duty ? 'On duty' : 'Off duty'}</StatusPill>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader icon={UserCheck} title="How cases are allocated" />
            <ol className="flex list-decimal flex-col gap-2 py-4 pr-6 pl-11 text-sm text-muted">
              {RULES.map((r) => <li key={r}>{r}</li>)}
            </ol>
          </Card>
      </div>
    </div>
  )
}
