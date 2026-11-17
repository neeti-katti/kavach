// Thin wrapper around fetch. The session token lives in sessionStorage, so it disappears when the tab closes.
const KEY = 'kv_session'

export function getToken() {
  try { return sessionStorage.getItem(KEY) } catch { return null }
}

export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(KEY, token)
    else sessionStorage.removeItem(KEY)
  } catch { /* storage blocked: the session just won't survive a reload */ }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    // A tripwire can end a session or lock an account mid-use: drop the token and go back to sign-in with a reason.
    if ((res.status === 401 || res.status === 423) && token && !path.startsWith('/auth/')) {
      setToken(null)
      window.location.assign(res.status === 423 ? '/?locked=1' : '/?ended=1')
    }
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Please check the details you entered.' : `Request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}
