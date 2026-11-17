import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from './api'

const AuthContext = createContext(null)

export const ROLE_HOME = {
  survivor: '/survivor',
  helper: '/survivor',
  officer: '/police',
  supervisor: '/police',
  security: '/security',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return
    api('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const signIn = useCallback((token, u) => {
    setToken(token)
    setUser(u)
  }, [])

  const signOut = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* session may already be gone */ }
    setToken(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
