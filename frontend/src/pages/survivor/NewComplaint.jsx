import { Link } from 'react-router-dom'
import { ArrowLeft, FilePlus } from 'lucide-react'
import { Card, EmptyState } from '../../components/ui'
import { useLang } from '../../i18n'

export default function NewComplaint() {
  const { t } = useLang()
  const steps = [t.stepAbout, t.stepWhat, t.stepReview]
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">{t.newTitle}</h1>
        <Link to="/survivor" className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />{t.back}</Link>
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${i === 0 ? 'border-gold/50 bg-gold/[.07]' : 'border-line bg-white/[.02]'}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-display font-semibold ${i === 0 ? 'bg-gold text-ink' : 'border border-line text-faint'}`}>{i + 1}</span>
            <span className={i === 0 ? 'font-medium text-text' : 'text-muted'}>{s}</span>
          </li>
        ))}
      </ol>
      <Card>
        <EmptyState icon={FilePlus} title={t.newTitle}>Built in Phase 3 of the plan.</EmptyState>
      </Card>
    </div>
  )
}
