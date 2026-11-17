import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

// Phase 1 placeholder: proves the role-based sign-in works. Real screens arrive in Phases 2 to 6.
export default function Home() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold text-[#D4AF37]">Signed in</h1>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        <dt className="opacity-70">Name</dt><dd>{user.display_name}</dd>
        <dt className="opacity-70">Role</dt><dd className="capitalize">{user.role}</dd>
        {user.badge && (<><dt className="opacity-70">Badge</dt><dd className="font-mono">{user.badge}</dd></>)}
        {user.station && (<><dt className="opacity-70">Station</dt><dd>{user.station.name}</dd></>)}
        {user.phone_masked && (<><dt className="opacity-70">Phone</dt><dd className="font-mono">{user.phone_masked}</dd></>)}
      </dl>
      <button className="self-start rounded-md border border-[#3A2427] px-4 py-2 text-sm hover:border-[#D4AF37]"
        onClick={async () => { await signOut(); navigate('/', { replace: true }) }}>
        Sign out
      </button>
    </main>
  )
}
