import { Navigate, Route, Routes } from 'react-router-dom'
import { ROLE_HOME, useAuth } from './auth'
import Login from './pages/Login'
import Home from './pages/Home'

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-sm opacity-70">Loading…</p>
  if (!user) return <Navigate to="/" replace />
  if (!roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] ?? '/'} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/survivor/*" element={<RequireRole roles={['survivor', 'helper']}><Home /></RequireRole>} />
      <Route path="/police/*" element={<RequireRole roles={['officer', 'supervisor']}><Home /></RequireRole>} />
      <Route path="/security/*" element={<RequireRole roles={['security']}><Home /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
