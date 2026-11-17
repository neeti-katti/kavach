import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, FileCheck, FileText, FolderOpen, Hourglass, Inbox, KeyRound, Layers, ShieldCheck, Siren, Stamp } from 'lucide-react'
import { useAuth } from '../../auth'
import { HeroBanner } from '../../components/HeroBanner'
import { Button, Card, CardHeader, EmptyState, StatCard, Table } from '../../components/ui'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const OFFICER_STATS = [
  { icon: FolderOpen, label: 'My open cases', caption: 'Assigned to you', tone: 'coral' },
  { icon: Hourglass, label: 'Awaiting my acceptance', caption: 'Accept within 2 hours', tone: 'gold' },
  { icon: Eye, label: 'Reveal windows open', caption: 'Identity visible for a set time', tone: 'saffron' },
  { icon: FileCheck, label: 'Copies released', caption: 'Redacted and approved', tone: 'green' },
]

const SUPERVISOR_STATS = [
  { icon: Inbox, label: 'Unassigned complaints', caption: 'At your station', tone: 'coral' },
  { icon: KeyRound, label: 'Reveal approvals', caption: 'Waiting for you', tone: 'gold' },
  { icon: FileText, label: 'Copies to review', caption: 'Medium-risk public copies', tone: 'saffron' },
  { icon: Siren, label: 'Escalations', caption: 'Not accepted in time', tone: 'green' },
]

const COLUMNS = [
  { key: 'id', label: 'Case number' },
  { key: 'status', label: 'Status' },
  { key: 'stage', label: 'Stage' },
  { key: 'updated', label: 'Last updated' },
]

export default function PoliceOverview() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const supervisor = user.role === 'supervisor'
  const stats = supervisor ? SUPERVISOR_STATS : OFFICER_STATS
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="flex flex-col gap-8">
      <HeroBanner
        eyebrow={<>{greeting()}, <span className="font-semibold text-text">{user.display_name}</span></>}
        title={supervisor ? 'Every complaint reaches an officer.' : 'Protect the survivor. Solve the case.'}
        actions={supervisor
          ? <Button iconRight={ArrowRight} onClick={() => navigate('/police/allocation')}>Open allocation</Button>
          : <Button iconRight={ArrowRight} onClick={() => navigate('/police/cases')}>View my cases</Button>}
      >
        <p>{user.station?.name} · Badge <span className="font-mono text-text">{user.badge}</span> · {today}</p>
      </HeroBanner>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} value="0" />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader icon={Layers} title={supervisor ? 'Station case queue' : 'My case queue'}
            action={<Link to={supervisor ? '/police/allocation' : '/police/cases'} className="flex items-center gap-1.5 text-sm text-gold-soft hover:underline">View all <ArrowRight size={15} /></Link>} />
          <Table columns={COLUMNS} rows={[]} empty={(
            <EmptyState icon={Inbox} title={supervisor ? 'No complaints at your station yet' : 'No cases assigned to you yet'}>
              New complaints appear here by case number only. The survivor's name and contact details are never shown in this list.
            </EmptyState>
          )} />
        </Card>

        <Card className="border-ok/25 xl:col-span-4" style={{ background: 'linear-gradient(180deg, rgba(14,42,28,.55), rgba(20,14,14,.92))' }}>
          <CardHeader icon={ShieldCheck} title="Your access" />
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3">
              <ShieldCheck size={22} className="text-ok" aria-hidden />
              <p className="font-semibold tracking-wide text-[#8BE69A] uppercase">Identity protected</p>
            </div>
            <ul className="flex flex-col gap-3.5 text-sm text-muted">
              <li className="flex gap-3"><FolderOpen size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />You work with case numbers, not survivors' names.</li>
              <li className="flex gap-3"><Eye size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden />A detail opens only for a task, for a limited time, and is logged.</li>
              <li className="flex gap-3"><Stamp size={18} className="mt-0.5 shrink-0 text-gold" aria-hidden /><span>Your screens carry your badge number <span className="font-mono whitespace-nowrap text-text">{user.badge}</span>.</span></li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
