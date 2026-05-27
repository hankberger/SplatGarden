import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth'
import { pool } from '../db'
import {
  extensionFor,
  mintUploadUrl,
  objectFromGsUri,
  setObjectMetadata,
  uploadsBucketName,
  uploadsConfigured,
} from '../storage'

const router = Router()

const MAX_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB
const ALLOWED_CONTENT = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
])

// Columns returned to the client. Job rows belong to a user; queries are
// always filtered by user_id so a session can only see its own jobs.
const JOB_COLUMNS = `
  id,
  filename,
  content_type as "contentType",
  size_bytes   as "sizeBytes",
  fps,
  quality,
  max_dimension as "maxDimension",
  status,
  error_message as "errorMessage",
  source_object as "sourceObject",
  output_object as "outputObject",
  created_at    as "createdAt",
  updated_at    as "updatedAt"
`

/**
 * Create a new COLMAP job and (when GCS is configured) return a v4 signed PUT
 * URL the browser can use to upload the video directly — bytes never pass
 * through this server.
 */
router.post('/jobs', async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const filename = String(body.filename ?? '').trim()
  if (!filename) {
    res.status(400).json({ error: 'filename required' })
    return
  }
  const contentType = body.contentType ? String(body.contentType) : null
  if (contentType && !ALLOWED_CONTENT.has(contentType.toLowerCase())) {
    res.status(400).json({ error: `unsupported content type: ${contentType}` })
    return
  }

  const sizeBytes = body.sizeBytes != null ? Number(body.sizeBytes) : null
  if (
    sizeBytes != null &&
    (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES)
  ) {
    res.status(400).json({ error: 'invalid sizeBytes (max 2GB)' })
    return
  }

  const id = randomBytes(16).toString('hex')
  const ext = extensionFor(contentType)
  // User-scoped path: clear ownership in the bucket, easier per-user cleanup.
  const objectPath = `users/${session.user.id}/jobs/${id}/source.${ext}`

  let uploadUrl: string | null = null
  let sourceObject: string | null = null
  if (uploadsConfigured() && contentType) {
    uploadUrl = await mintUploadUrl({ object: objectPath, contentType })
    sourceObject = `gs://${uploadsBucketName}/${objectPath}`
  }

  await pool.query(
    `insert into colmap_job
       (id, user_id, filename, content_type, size_bytes, fps, quality,
        max_dimension, source_object)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      session.user.id,
      filename,
      contentType,
      sizeBytes,
      toInt(body.fps, 2),
      String(body.quality ?? 'medium'),
      toInt(body.maxDimension, 1600),
      sourceObject,
    ],
  )

  res.status(201).json({ jobId: id, uploadUrl })
})

/**
 * Browser calls this after a successful PUT to the signed URL. Flips the job
 * to `uploaded` and labels the GCS object with attribution metadata.
 */
router.post('/jobs/:id/uploaded', async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }

  const { rows } = await pool.query(
    `update colmap_job
        set status = 'uploaded',
            updated_at = now()
      where id = $1
        and user_id = $2
        and status = 'pending'
      returning ${JOB_COLUMNS}, user_id as "userId"`,
    [req.params.id, session.user.id],
  )
  const job = rows[0]
  if (!job) {
    res.status(404).json({ error: 'not found or not in pending state' })
    return
  }

  // Best-effort: stamp the GCS object with attribution metadata. If this
  // fails we still return ok — the DB is the source of truth for ownership.
  if (job.sourceObject) {
    try {
      await setObjectMetadata(objectFromGsUri(job.sourceObject), {
        jobId: job.id,
        userId: job.userId,
        originalFilename: job.filename,
      })
    } catch (e) {
      console.warn(`metadata stamp failed for job ${job.id}:`, e)
    }
  }

  res.json({ ok: true })
})

/** List the signed-in user's jobs, newest first. */
router.get('/jobs', async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  const limit = Math.min(Math.max(toInt(req.query.limit, 50), 1), 100)

  const { rows } = await pool.query(
    `select ${JOB_COLUMNS}
       from colmap_job
       where user_id = $1
       order by created_at desc
       limit $2`,
    [session.user.id, limit],
  )
  res.json({ jobs: rows })
})

/** Single job detail, scoped to the requesting user. */
router.get('/jobs/:id', async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }

  const { rows } = await pool.query(
    `select ${JOB_COLUMNS}
       from colmap_job
       where id = $1 and user_id = $2`,
    [req.params.id, session.user.id],
  )

  if (!rows[0]) {
    res.status(404).json({ error: 'not found' })
    return
  }

  res.json(rows[0])
})

function toInt(v: unknown, def: number) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.floor(n) : def
}

export default router
