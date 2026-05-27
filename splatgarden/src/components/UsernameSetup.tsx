import { useState, type FormEvent } from 'react'
import { authClient } from '../lib/auth-client'

/**
 * Shown after a social (Google) sign-in when the account has no username yet.
 * On success, updateUser refreshes the session store and App swaps the view.
 */
export function UsernameSetup() {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await authClient.updateUser({ username })
    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? 'Could not set username')
    }
  }

  return (
    <div className="auth-card">
      <h2>Pick a username</h2>
      <p className="auth-subtle">Choose a username to finish setting up your account.</p>
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            minLength={3}
            autoFocus
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="submit-button" disabled={loading}>
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
