import { signOut, useSession } from '../lib/auth-client'

export function AuthControls() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <div className="profile-button profile-button--muted">…</div>
  }

  if (!session) {
    return (
      <div className="profile-button profile-button--muted">
        <span className="profile-avatar" aria-hidden="true" />
        <span className="profile-name">Not signed in</span>
      </div>
    )
  }

  const { user } = session
  const initial = (user.name || user.email || '?').charAt(0).toUpperCase()

  return (
    <div className="profile">
      <span className="profile-avatar profile-avatar--initial" aria-hidden="true">
        {initial}
      </span>
      <span className="profile-name">{user.name || user.email}</span>
      <button
        type="button"
        className="signout-button"
        onClick={() => signOut()}
      >
        Sign out
      </button>
    </div>
  )
}
