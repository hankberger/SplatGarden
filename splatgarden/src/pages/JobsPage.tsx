import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useSession } from '../lib/auth-client'
import './JobsPage.css'

type Job = {
  id: string
  filename: string
  contentType: string | null
  sizeBytes: number | null
  fps: number
  quality: string
  maxDimension: number
  status: string
  errorMessage: string | null
  sourceObject: string | null
  createdAt: string
  updatedAt: string
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let size = n
  let i = -1
  do {
    size /= 1024
    i++
  } while (size >= 1024 && i < units.length - 1)
  return `${size.toFixed(1)} ${units[i]}`
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const RANGES: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [86400 * 7, 'day'],
  [86400 * 30, 'week'],
  [86400 * 365, 'month'],
]

function relativeTime(iso: string): string {
  const delta = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(delta)
  for (let i = 0; i < RANGES.length; i++) {
    const [limit, unit] = RANGES[i]
    if (abs < limit) {
      const divisor = i === 0 ? 1 : RANGES[i - 1][0]
      return RTF.format(Math.round(delta / divisor), unit)
    }
  }
  return RTF.format(Math.round(delta / (86400 * 365)), 'year')
}

export function JobsPage() {
  const { data: session, isPending: sessionPending } = useSession()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    let cancelled = false
    fetch('/api/colmap/jobs')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError((data as { error?: string }).error ?? `HTTP ${res.status}`)
          return
        }
        setJobs((data as { jobs: Job[] }).jobs)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load uploads')
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (sessionPending) return <p className="api-status">Loading…</p>
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="jobs">
      <header className="jobs-header">
        <h1 className="jobs-title">Your uploads</h1>
        <p className="jobs-sub">
          Every video you've submitted for COLMAP processing.
        </p>
      </header>

      {error && (
        <div className="jobs-error" role="alert">
          {error}
        </div>
      )}

      {!jobs && !error && <p className="api-status">Loading…</p>}

      {jobs && jobs.length === 0 && (
        <div className="jobs-empty">
          <p>No uploads yet.</p>
          <Link to="/colmap" className="jobs-empty-cta">
            Create your first dataset →
          </Link>
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <ul className="jobs-list">
          {jobs.map((j) => (
            <li key={j.id} className="job-row">
              <span className={`job-status job-status--${j.status}`}>
                {j.status}
              </span>
              <span className="job-meta">
                <span className="job-filename">{j.filename}</span>
                <span className="job-sub">
                  {formatBytes(j.sizeBytes)} · {j.fps} fps · {j.quality} ·{' '}
                  {j.maxDimension === 0 ? 'original' : `${j.maxDimension}px`}
                </span>
              </span>
              <span className="job-time" title={new Date(j.createdAt).toLocaleString()}>
                {relativeTime(j.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
