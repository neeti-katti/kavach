import { Link } from 'react-router-dom'
import { ArrowLeft, FilePlus, ListChecks } from 'lucide-react'
import { Button, Card, EmptyState } from '../../components/ui'
import { useLang } from '../../i18n'
import { useNavigate } from 'react-router-dom'

export default function ComplaintStatus() {
  const { t } = useLang()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold text-text">{t.statusTitle}</h1>
        <Link to="/survivor" className="flex items-center gap-2 text-sm text-muted hover:text-text"><ArrowLeft size={16} aria-hidden />{t.back}</Link>
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-5" aria-label="Progress">
        {t.stages.map((s, i) => (
          <li key={s} className="flex flex-col gap-2 rounded-2xl border border-line bg-white/[.02] px-4 py-4">
            <span className="h-1.5 rounded-full bg-line" aria-hidden />
            <span className="text-xs text-faint">{i + 1}</span>
            <span className="text-sm text-muted">{s}</span>
          </li>
        ))}
      </ol>
      <Card>
        <EmptyState icon={ListChecks} title={t.noComplaint}
          action={<Button icon={FilePlus} onClick={() => navigate('/survivor/new')}>{t.file}</Button>} />
      </Card>
    </div>
  )
}
