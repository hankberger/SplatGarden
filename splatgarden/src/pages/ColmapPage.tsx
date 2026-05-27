import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../lib/auth-client'
import './ColmapPage.css'

/**
 * PUT a File directly to a v4 signed URL. Content-Type MUST match what the
 * server signed with (we pass file.type when minting). Reports progress 0-100.
 */
function uploadToSignedUrl(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`upload failed: HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('upload network error'))
    xhr.onabort = () => reject(new Error('upload aborted'))
    xhr.send(file)
  })
}

function formatBytes(n: number) {
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

type JobInfo = { id: string; status: string; progress?: number }

export function ColmapPage() {
  const { data: session, isPending: sessionPending } = useSession()

  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [fps, setFps] = useState('2')
  const [quality, setQuality] = useState('medium')
  const [maxDim, setMaxDim] = useState('1600')

  const [submitting, setSubmitting] = useState(false)
  const [job, setJob] = useState<JobInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  function pick(f: File | null | undefined) {
    if (f && f.type.startsWith('video/')) {
      setFile(f)
      setJob(null)
      setError(null)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDrag(false)
    pick(e.dataTransfer.files?.[0])
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  async function handleGenerate() {
    if (!file || submitting) return
    setSubmitting(true)
    setError(null)
    setJob(null)
    try {
      // 1. Create the job + get the signed upload URL.
      const res = await fetch('/api/colmap/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          fps: Number(fps),
          quality,
          maxDimension: Number(maxDim),
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const { jobId, uploadUrl } = (await res.json()) as {
        jobId: string
        uploadUrl: string | null
      }

      if (!uploadUrl) {
        // Uploads disabled (GCS env not set) — keep the recorded-only behavior.
        setJob({ id: jobId, status: 'pending' })
        return
      }

      // 2. PUT the video bytes straight to GCS, with progress.
      setJob({ id: jobId, status: 'uploading', progress: 0 })
      await uploadToSignedUrl(uploadUrl, file, (pct) => {
        setJob((j) => (j ? { ...j, progress: pct } : j))
      })

      // 3. Tell the server the upload is done.
      const done = await fetch(`/api/colmap/jobs/${jobId}/uploaded`, {
        method: 'POST',
      })
      if (!done.ok) throw new Error(`mark-uploaded failed: HTTP ${done.status}`)
      setJob({ id: jobId, status: 'uploaded' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="colmap">
      <header className="colmap-header">
        <h1 className="colmap-title">Video to COLMAP Dataset Generator</h1>
        <p className="colmap-sub">
          Drop in a video — get a ready-to-train COLMAP dataset back. Free, no
          install.
        </p>
      </header>

      <div className="colmap-workspace">
        <div
          className={`colmap-dropzone${drag ? ' is-drag' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={onKeyDown}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />

          {file ? (
            <div className="colmap-file">
              <span className="colmap-file-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path
                    d="M7 4v16M17 4v16M3 9h4M3 14h4M17 9h4M17 14h4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="colmap-file-meta">
                <span className="colmap-file-name">{file.name}</span>
                <span className="colmap-file-size">{formatBytes(file.size)}</span>
              </span>
              <button
                type="button"
                className="colmap-file-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  setFile(null)
                  setJob(null)
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg
                className="colmap-drop-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span className="colmap-drop-title">
                Drag a video here, or <b>browse</b>
              </span>
              <span className="colmap-drop-hint">MP4 · MOV · WEBM</span>
            </>
          )}
        </div>

        <aside className="colmap-settings">
          <h2 className="colmap-settings-title">Settings</h2>

          <div className="colmap-settings-body">
            <label className="colmap-field">
              Frames per second
              <select value={fps} onChange={(e) => setFps(e.target.value)}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="4">4</option>
                <option value="8">8</option>
              </select>
            </label>

            <label className="colmap-field">
              Quality
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="low">Low — fastest</option>
                <option value="medium">Medium</option>
                <option value="high">High — slowest</option>
              </select>
            </label>

            <label className="colmap-field">
              Max dimension (px)
              <select value={maxDim} onChange={(e) => setMaxDim(e.target.value)}>
                <option value="1080">1080</option>
                <option value="1600">1600</option>
                <option value="2000">2000</option>
                <option value="0">Original</option>
              </select>
            </label>
          </div>

          {!sessionPending && !session ? (
            <Link to="/login" className="colmap-generate">
              Sign in to generate
            </Link>
          ) : (
            <button
              className="colmap-generate"
              type="button"
              disabled={!file || submitting || sessionPending}
              onClick={handleGenerate}
            >
              {submitting ? 'Recording…' : 'Generate'}
            </button>
          )}
        </aside>
      </div>

      {job && (
        <div className="colmap-result" role="status">
          <span className="colmap-result-badge">{job.status}</span>
          <span className="colmap-result-text">
            Job <code>{job.id.slice(0, 12)}…</code>
            {job.status === 'uploading' && typeof job.progress === 'number' && (
              <> — uploading {job.progress}%</>
            )}
            {job.status === 'uploaded' && (
              <> — uploaded; GPU processing will pick it up once wired.</>
            )}
            {job.status === 'pending' && (
              <> — recorded; upload pipeline not configured.</>
            )}
          </span>
          {job.status === 'uploading' && typeof job.progress === 'number' && (
            <div
              className="colmap-progress"
              role="progressbar"
              aria-valuenow={job.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="colmap-progress-bar"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="colmap-result colmap-result--error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
