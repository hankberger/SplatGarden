import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { signIn, signUp } from '../lib/auth-client'

export type AuthMode = 'signin' | 'signup'

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('') // username or email (sign in)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let result
    if (mode === 'signup') {
      // `name` is required by Better Auth; default it to the username.
      result = await signUp.email({ email, password, name: username, username })
    } else if (identifier.includes('@')) {
      result = await signIn.email({ email: identifier, password })
    } else {
      result = await signIn.username({ username: identifier, password })
    }

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
        <svg className="google-icon" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === 'signup' ? (
          <>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                minLength={3}
              />
            </label>
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
          </>
        ) : (
          <label>
            Username or email
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
        )}
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
        <Link
          className="link-button"
          to={mode === 'signin' ? '/signup' : '/login'}
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </Link>
      </p>
    </div>
  )
}
