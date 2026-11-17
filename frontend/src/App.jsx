import { Navigate, Route, Routes } from 'react-router-dom'
import { Lock, Radar, ScrollText, Siren } from 'lucide-react'
import { ROLE_HOME, useAuth } from './auth'
import StaffShell from './layouts/StaffShell'
import SurvivorShell from './layouts/SurvivorShell'
import Login from './pages/Login'
import Placeholder from './pages/Placeholder'
import PrintCopy from './pages/PrintCopy'
import Copies from './pages/police/Copies'
import RedactionStudio from './pages/police/RedactionStudio'
import Allocation from './pages/police/Allocation'
import Approvals from './pages/police/Approvals'
import CaseSheet from './pages/police/CaseSheet'
import Cases from './pages/police/Cases'
import PoliceOverview from './pages/police/Overview'
import Reveals from './pages/police/Reveals'
import SecurityOverview from './pages/security/Overview'
import ComplaintStatus from './pages/survivor/ComplaintStatus'
import NewComplaint from './pages/survivor/NewComplaint'
import SurvivorHome from './pages/survivor/Home'

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/" replace />
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] ?? '/'} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/survivor" element={<RequireRole roles={['survivor', 'helper']}><SurvivorShell /></RequireRole>}>
        <Route index element={<SurvivorHome />} />
        <Route path="new" element={<NewComplaint />} />
        <Route path="status" element={<ComplaintStatus />} />
      </Route>

      <Route path="/police" element={<RequireRole roles={['officer', 'supervisor']}><StaffShell area="police" /></RequireRole>}>
        <Route index element={<PoliceOverview />} />
        <Route path="cases" element={<Cases />} />
        <Route path="cases/:caseId" element={<CaseSheet />} />
        <Route path="reveals" element={<Reveals />} />
        <Route path="cases/:caseId/copy" element={<RedactionStudio />} />
        <Route path="copies" element={<Copies />} />
        <Route path="allocation" element={<Allocation />} />
        <Route path="approvals" element={<Approvals />} />
      </Route>

      <Route path="/print/copy/:copyId" element={<RequireRole roles={['officer', 'supervisor']}><PrintCopy /></RequireRole>} />

      <Route path="/security" element={<RequireRole roles={['security']}><StaffShell area="security" /></RequireRole>}>
        <Route index element={<SecurityOverview />} />
        <Route path="alerts" element={<Placeholder eyebrow="Security" title="Alerts" icon={Siren} phase={6}
          description="Every tripwire that fired: canary records opened, decoy endpoints hit, honey credentials used." empty="No alerts" />} />
        <Route path="locked" element={<Placeholder eyebrow="Security" title="Locked accounts" icon={Lock} phase={6}
          description="Accounts locked automatically by a tripwire, with what they touched and an unlock action." empty="No locked accounts" />} />
        <Route path="decoys" element={<Placeholder eyebrow="Security" title="Decoys" icon={Radar} phase={6}
          description="The planted canary records, decoy endpoints and honey credentials, and their hit counts." empty="Decoys are not armed yet" />} />
        <Route path="audit" element={<Placeholder eyebrow="Security" title="Audit log" icon={ScrollText} phase={6}
          description="Every action in the system, hash-chained so edits are detectable. No personal data is ever logged." empty="Audit viewer coming up" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
