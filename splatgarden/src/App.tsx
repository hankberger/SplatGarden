import './App.css'
import { useSession } from './lib/auth-client'
import { AuthControls } from './components/AuthControls'
import { AuthForm } from './components/AuthForm'

function App() {
  const { data: session, isPending } = useSession()

  return (
    <div className="layout">
      <header className="navbar">
        <div className="navbar-inner">
          <div className="logo">
            <span className="logo-mark" aria-hidden="true" />
            <span className="logo-text">SplatGarden</span>
          </div>
          <AuthControls />
        </div>
      </header>

      <main className="content">
        {isPending ? (
          <p className="api-status">Loading…</p>
        ) : session ? (
          <section className="welcome">
            <h1>Welcome, {session.user.name || session.user.email}</h1>
            <p className="api-status">You're signed in.</p>
          </section>
        ) : (
          <AuthForm />
        )}
      </main>
    </div>
  )
}

export default App
