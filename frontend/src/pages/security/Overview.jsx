import { Link } from 'react-router-dom'
import { Activity, ArrowRight, Ban, Database, Lock, Radar, ScrollText, ShieldAlert, ShieldCheck, Siren } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { HeroBanner } from '../../components/HeroBanner'
import { useToast } from '../../components/toast'
import { Card, CardHeader, StatCard, StatusPill } from '../../components/ui'
import { AlertFeed, usePoll } from './common'

export default function SecurityOverview() {
  const { user } = useAuth()
  const toast = useToast()
  const [s] = usePoll('/security/summary')
  const [alerts, reload] = usePoll('/security/alerts')
  const firing = (s?.serious_open ?? 0) > 0

  async function resolve(a) {
    try { await api(`/security/alerts/${a.id}/resolve`, { method: 'POST', body: {} }); toast('Alert resolved.', 'success'); reload() } catch (e) { toast(e.message, 'error') }
  }

  const stats = [
    { icon: Siren, label: 'Open alerts', value: s?.open_alerts, caption: `${s?.serious_open ?? 0} high or critical`, tone: 'coral' },
    { icon: Lock, label: 'Locked accounts', value: s?.locked_accounts, caption: 'Locked by a tripwire', tone: 'gold' },
    { icon: Radar, label: 'Decoy hits today', value: s?.decoy_hits_today, caption: 'Decoy cases, endpoints, honey login', tone: 'saffron' },
    { icon: Ban, label: 'Blocked clients', value: s?.blocked_clients, caption: 'Probed a decoy endpoint', tone: 'green' },
  ]

  return (
    <div className="flex flex-col gap-8">
      <HeroBanner compact height={240}
        eyebrow={<>Cyber Cell · Badge <span className="font-mono font-semibold text-text">{user.badge}</span></>}
        title="Security monitor">
        <p>Every tripwire, lock-out and block shows up here within two seconds.</p>
      </HeroBanner>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((x) => <StatCard key={x.label} {...x} value={x.value === undefined ? '…' : String(x.value)} />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader icon={Activity} title="Live alert feed" subtitle="Newest first · refreshes every 2 seconds"
            action={<Link to="/security/alerts" className="flex items-center gap-1.5 text-sm text-gold-soft hover:underline">All alerts <ArrowRight size={15} /></Link>} />
          <AlertFeed alerts={alerts} onResolve={resolve} limit={6} />
        </Card>

        <Card className={`xl:col-span-4 ${firing ? 'border-danger/50' : 'border-ok/25'}`}
          style={{ background: firing ? 'linear-gradient(180deg, rgba(90,20,22,.6), rgba(20,14,14,.92))' : 'linear-gradient(180deg, rgba(14,42,28,.55), rgba(20,14,14,.92))' }}>
          <CardHeader icon={firing ? ShieldAlert : ShieldCheck} title="System status" />
          <div className="flex flex-col gap-4 p-6">
            {firing ? (
              <div className="flex items-center gap-3 rounded-xl border border-danger/60 bg-danger/15 px-4 py-3">
                <ShieldAlert size={22} className="animate-pulse text-[#FF8A8D]" aria-hidden />
                <p className="font-semibold tracking-wide text-[#FFB4B5] uppercase">Tripwire fired</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-ok/40 bg-ok/10 px-4 py-3">
                <ShieldCheck size={22} className="text-ok" aria-hidden />
                <p className="font-semibold tracking-wide text-[#8BE69A] uppercase">System secure</p>
              </div>
            )}
            <ul className="flex flex-col gap-3 text-sm">
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><Database size={17} className="text-gold" aria-hidden />Identity vault</span><StatusPill tone="ok">Encrypted</StatusPill></li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><ScrollText size={17} className="text-gold" aria-hidden />Audit log ({s?.audit_entries ?? '…'})</span>
                {s && <StatusPill tone={s.audit_chain_ok ? 'ok' : 'alert'}>{s.audit_chain_ok ? 'Chain intact' : `Broken at #${s.audit_first_bad}`}</StatusPill>}</li>
              <li className="flex items-center justify-between gap-3"><span className="flex items-center gap-2.5 text-muted"><Radar size={17} className="text-gold" aria-hidden />Honeypot layer</span><StatusPill tone="ok">Armed</StatusPill></li>
            </ul>
            {s && <p className="text-xs text-faint">{s.canaries} decoy cases, {s.decoy_endpoints} decoy endpoints and 1 honey account are watching.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
