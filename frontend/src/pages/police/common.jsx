import { useEffect, useState } from 'react'
import { StatusPill } from '../../components/ui'

export function statusOf(c) {
  if (c.sealed) return ['Sealed · report filed', 'neutral']
  if (c.status === 'submitted') return ['Waiting for allocation', 'warn']
  if (c.status === 'assigned' && !c.accepted) return c.escalated ? ['Escalated', 'alert'] : ['Awaiting acceptance', 'warn']
  if (c.status === 'assigned') return ['Accepted', 'info']
  if (c.status === 'statement_scheduled') return ['Statement scheduled', 'info']
  if (c.status === 'investigating') return ['Under investigation', 'ok']
  return [c.status, 'neutral']
}

export function CaseStatus({ c }) {
  const [label, tone] = statusOf(c)
  return <StatusPill tone={tone}>{label}</StatusPill>
}

export const STAGE = {
  submitted: 'Allocation', assigned: 'Allocation', statement_scheduled: 'Statement', investigating: 'Investigation', report_filed: 'Closed',
}

export function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export const EVENT_LABELS = {
  complaint_filed: 'Complaint filed by the survivor',
  case_assigned: 'Assigned to an officer',
  case_accepted: 'Accepted by the officer',
  masked_call: 'Masked call placed',
  reveal_requested: 'Identity detail requested',
  reveal_approved: 'Request approved by supervisor',
  reveal_denied: 'Request denied by supervisor',
  reveal_viewed: 'Identity detail viewed',
  status_statement_scheduled: 'Statement scheduled',
  status_investigating: 'Investigation started',
  case_sealed: 'Final report filed; identity sealed',
  case_reopened: 'Reopened by supervisor',
  allocation_escalated: 'Escalated: not accepted in time',
  allocation_failed: 'No officer on duty',
}

export const ROLE_NAMES = { survivor: 'Survivor', officer: 'Officer', supervisor: 'Supervisor', security: 'Security', helper: 'Helper' }

/** A ticking clock string, used in the watermark. */
export function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return now.toLocaleTimeString('en-IN', { hour12: false })
}
