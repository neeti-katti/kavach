import { Card, EmptyState, PageHeader } from '../components/ui'

// A screen that exists in the shell now and gets its working content in a later build phase.
export default function Placeholder({ eyebrow, title, description, icon, phase, empty }) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={eyebrow} title={title}>{description}</PageHeader>
      <Card>
        <EmptyState icon={icon} title={empty}>Built in Phase {phase} of the plan.</EmptyState>
      </Card>
    </div>
  )
}
