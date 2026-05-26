import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/auth-client'

type Mode = 'signin' | 'signup'

export function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result =
      mode === 'signup'
        ? await signUp.email({ email, password, name })
        : await signIn.email({ email, password })
    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong')
    }
    // On success, the useSession store updates and the view swaps automatically.
  }

  return (
    <div className="auth-card">
      <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>

      <button
        type="button"
        className="google-button"
        onClick={() => signIn.social({ provider: 'google', callbackURL: '/' })}
      >
        Continue with Google
      </button>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
            minLength={8}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="submit-button" disabled={loading}>
          {loading
            ? 'Working…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>

      <p className="auth-switch">
        {mode === 'signin' ? "Don't have an account? " : 'Already have one? '}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setError(null)
            setMode(mode === 'signin' ? 'signup' : 'signin')
          }}
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
