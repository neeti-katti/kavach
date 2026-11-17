import { Link } from 'react-router-dom'
import { ArrowRight, DoorOpen, EyeOff, FilePlus, ListChecks, LockKeyhole, Phone, Smartphone } from 'lucide-react'
import { useLang } from '../../i18n'

function ActionCard({ to, icon: Icon, title, text, primary }) {
  return (
    <Link to={to}
      className={`group flex min-h-[190px] flex-col justify-between gap-6 rounded-3xl border p-7 transition-colors ${primary
        ? 'border-[#C2545A]/60 bg-gradient-to-br from-maroon/60 to-maroon-deep/30 hover:border-gold/60'
        : 'card-glow border-line hover:border-gold/50'}`}>
      <span className={`grid h-14 w-14 place-items-center rounded-2xl border ${primary ? 'border-gold/40 bg-gold/15 text-gold-soft' : 'border-line bg-white/[.03] text-gold'}`}>
        <Icon size={26} aria-hidden />
      </span>
      <div>
        <p className="flex items-center gap-2 text-xl font-semibold text-text">{title}<ArrowRight size={20} className="transition-transform group-hover:translate-x-1" aria-hidden /></p>
        <p className="mt-1.5 text-[15px] text-muted">{text}</p>
      </div>
    </Link>
  )
}

export default function SurvivorHome() {
  const { t } = useLang()
  const promises = [
    { icon: LockKeyhole, text: t.p1 },
    { icon: EyeOff, text: t.p2 },
    { icon: Smartphone, text: t.p3 },
    { icon: DoorOpen, text: t.p4 },
  ]
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
      <section className="flex flex-col gap-8 lg:col-span-8">
        <div>
          <h1 className="font-display text-[clamp(2rem,3.2vw,3rem)] font-semibold text-text">{t.welcome}</h1>
          <p className="mt-3 max-w-3xl text-lg text-muted">{t.welcomeSub}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <ActionCard to="/survivor/new" icon={FilePlus} title={t.file} text={t.fileDesc} primary />
          <ActionCard to="/survivor/status" icon={ListChecks} title={t.track} text={t.trackDesc} />
        </div>
        <a href="tel:112" className="flex items-center gap-4 rounded-2xl border border-danger/40 bg-danger/[.07] px-6 py-4 hover:bg-danger/[.12]">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-danger/20 text-[#FFB4B5]"><Phone size={20} aria-hidden /></span>
          <span>
            <span className="block font-semibold text-text">{t.danger}</span>
            <span className="block text-sm text-muted">{t.dangerSub}</span>
          </span>
        </a>
      </section>

      <aside className="lg:col-span-4">
        <div className="card-glow rounded-3xl border border-line p-7">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold text-text"><LockKeyhole size={20} className="text-gold" aria-hidden />{t.privacyTitle}</h2>
          <div className="gold-divider my-5" />
          <ul className="flex flex-col gap-4">
            {promises.map((p, i) => (
              <li key={i} className="flex gap-3.5 text-[15px] text-muted">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/25 bg-gold/10 text-gold"><p.icon size={16} aria-hidden /></span>
                <span className="pt-1">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
