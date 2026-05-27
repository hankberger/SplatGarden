import './App.css'
import { Routes, Route, Navigate, Outlet, Link, NavLink } from 'react-router-dom'
import { useSession } from './lib/auth-client'
import { AuthControls } from './components/AuthControls'
import { AuthForm, type AuthMode } from './components/AuthForm'
import { UsernameSetup } from './components/UsernameSetup'
import { ColmapPage } from './pages/ColmapPage'
import { JobsPage } from './pages/JobsPage'

// Active-aware class for the main nav links.
function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link--active' : 'nav-link'
}

function Layout() {
  return (
    <div className="layout">
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-left">
            <Link to="/" className="logo">
              <img className="logo-mark" src="/logo_32.webp" alt="" aria-hidden="true" />
              <span className="logo-text font-dm-serif">SplatGarden</span>
            </Link>
            <nav className="nav-links">
              <NavLink to="/colmap" className={navLinkClass}>
                COLMAP
              </NavLink>
              <NavLink to="/about" className={navLinkClass}>
                About
              </NavLink>
              <NavLink to="/contact" className={navLinkClass}>
                Contact
              </NavLink>
            </nav>
          </div>
          <AuthControls />
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

function Home() {
  const { data: session, isPending } = useSession()
  if (isPending) return <p className="api-status">Loading…</p>
  // Social sign-ups land here with no username yet — make them pick one.
  if (session && !session.user.username) return <UsernameSetup />
  // Empty home for now.
  return null
}

// Simple placeholder page for nav sections that aren't built yet.
function Placeholder({ title }: { title: string }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="api-status">Coming soon.</p>
    </section>
  )
}

// Auth pages redirect away once you're signed in.
function AuthPage({ mode }: { mode: AuthMode }) {
  const { data: session, isPending } = useSession()
  if (isPending) return <p className="api-status">Loading…</p>
  if (session) return <Navigate to="/" replace />
  return <AuthForm mode={mode} />
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/colmap" element={<ColmapPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/about" element={<Placeholder title="About" />} />
        <Route path="/contact" element={<Placeholder title="Contact" />} />
        <Route path="/login" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
