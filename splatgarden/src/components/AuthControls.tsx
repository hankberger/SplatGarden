import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut, useSession } from '../lib/auth-client'

export function AuthControls() {
  const { data: session, isPending } = useSession()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape while the menu is open.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (isPending) {
    return <div className="profile-button profile-button--muted">…</div>
  }

  if (!session) {
    return (
      <div className="auth-actions">
        <Link to="/login" className="nav-button nav-button--ghost">
          Log in
        </Link>
        <Link to="/signup" className="nav-button nav-button--primary">
          Sign Up
        </Link>
      </div>
    )
  }

  const { user } = session
  const displayName = user.displayUsername || user.username || user.email
  const initial = (displayName || '?').charAt(0).toUpperCase()

  const avatar = user.image ? (
    <img
      className="profile-avatar"
      src={user.image}
      alt=""
      referrerPolicy="no-referrer"
    />
  ) : (
    <span className="profile-avatar profile-avatar--initial" aria-hidden="true">
      {initial}
    </span>
  )

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        type="button"
        className="profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {avatar}
        <span className="profile-name">{displayName}</span>
        <svg
          className="profile-chevron"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-header">
            <span className="profile-dropdown-name">{displayName}</span>
            {user.email && (
              <span className="profile-dropdown-email">{user.email}</span>
            )}
          </div>
          <Link
            to="/jobs"
            role="menuitem"
            className="profile-dropdown-item"
            onClick={() => setOpen(false)}
          >
            My uploads
          </Link>
          <button
            type="button"
            role="menuitem"
            className="profile-dropdown-item"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
