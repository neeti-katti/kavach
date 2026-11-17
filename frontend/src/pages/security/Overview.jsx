import { Activity, Ban, Database, Lock, Radar, ScrollText, ShieldCheck, Siren, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../auth'
import { HeroBanner } from '../../components/HeroBanner'
import { Card, CardHeader, EmptyState, StatCard, StatusPill } from '../../components/ui'

const STATS = [
  { icon: Siren, label: 'Open alerts', caption: 'Tripwires touched', tone: 'coral' },
  { icon: Lock, label: 'Locked accounts', caption: 'Waiting for review', tone: 'gold' },
  { icon: Radar, label: 'Decoy hits today', caption: 'Canary records and fake endpoints', tone: 'saffron' },
  { icon: Ban, label: 'Blocked addresses', caption: 'Probing the system', tone: 'green' },
]

export default function SecurityOverview() {
  const { user } = useAuth()
  return (
    <div className="flex flex-col gap-8">
      <HeroBanner compact height={240}
        eyebrow={<>Cyber Cell · Badge <span className="font-mono font-semibold text-text">{user.badge}</span></>}
        title="Security monitor">
        <p>Every tripwire, lock-out and access to the vault shows up here as it happens.</p>
      </HeroBanner>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((s) => <StatCard key={s.label} {...s} value="0" />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader icon={Activity} title="Live alert feed" subtitle="Newest first" />
          <EmptyState icon={ShieldCheck} title="All quiet">
            No decoy has been touched and no account is locked. Alerts appear here within a second of a tripwire firing.
          </EmptyState>
        </Card>

        <Card className="border-ok/25 xl:col-span-4" style={{ background: 'linear-gradient(180deg, rgba(14,42,28,.55), rgba(20,14,14,.92))' }}>
          <CardHeader icon={ShieldCheck} title="System status" />
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3">
              <ShieldCheck size={22} className="text-ok" aria-hidden />
              <p className="font-semibold tracking-wide text-[#8BE69A] uppercase">System secure</p>
            </div>
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><Database size={17} className="text-gold" aria-hidden />Identity vault</span><StatusPill tone="ok">Encrypted</StatusPill></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><ScrollText size={17} className="text-gold" aria-hidden />Audit log</span><StatusPill tone="ok">Hash-chained</StatusPill></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><TriangleAlert size={17} className="text-gold" aria-hidden />Honeypot layer</span><StatusPill tone="warn">Not armed yet</StatusPill></li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  )
}
