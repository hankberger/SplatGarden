import { GoogleAuth, Impersonated } from 'google-auth-library'
import { Storage } from '@google-cloud/storage'

const BUCKET = process.env.GCS_UPLOADS_BUCKET
const SIGNER = process.env.GCS_SIGNER_SA

/**
 * Returns true when the bucket + signer SA env vars are wired up.
 * Callers can fall back to `uploadUrl: null` when this is false.
 */
export function uploadsConfigured(): boolean {
  return !!(BUCKET && SIGNER)
}

export const uploadsBucketName = BUCKET

/**
 * One Storage client whose auth impersonates the signer SA. Used so v4 signed
 * URLs are signed *as* that SA via the IAM signBlob API — no key file needed.
 *
 * Local dev: your user has tokenCreator on the signer SA, so impersonation works.
 * Cloud Run: the runtime SA needs tokenCreator on the signer SA (or be the same).
 */
let cached: Storage | null = null

async function getStorage(): Promise<Storage> {
  if (cached) return cached
  if (!SIGNER) {
    throw new Error('GCS_SIGNER_SA is not set')
  }
  const source = await new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  }).getClient()
  const impersonated = new Impersonated({
    sourceClient: source,
    targetPrincipal: SIGNER,
    targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
    lifetime: 3600,
  })
  cached = new Storage({ authClient: impersonated })
  return cached
}

/**
 * Mint a v4 signed PUT URL the browser can use to upload `object` directly.
 * The Content-Type sent by the client MUST match `contentType` exactly.
 */
export async function mintUploadUrl(opts: {
  object: string
  contentType: string
  expiresInMs?: number
}): Promise<string> {
  if (!BUCKET) throw new Error('GCS_UPLOADS_BUCKET is not set')
  const storage = await getStorage()
  const file = storage.bucket(BUCKET).file(opts.object)
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + (opts.expiresInMs ?? 60 * 60 * 1000),
    contentType: opts.contentType,
  })
  return url
}

/**
 * Set custom metadata on an uploaded object. Best-effort — callers should
 * tolerate failures (an unlabeled object is not a fatal state).
 * `object` is the path within the bucket (no `gs://` prefix).
 */
export async function setObjectMetadata(
  object: string,
  metadata: Record<string, string>,
): Promise<void> {
  if (!BUCKET) throw new Error('GCS_UPLOADS_BUCKET is not set')
  const storage = await getStorage()
  await storage.bucket(BUCKET).file(object).setMetadata({ metadata })
}

/** Strip a `gs://bucket/` prefix to get the object path within the bucket. */
export function objectFromGsUri(uri: string): string {
  if (!BUCKET) return uri
  const prefix = `gs://${BUCKET}/`
  return uri.startsWith(prefix) ? uri.slice(prefix.length) : uri
}

/** Map a known video content type to a sensible file extension. */
export function extensionFor(contentType: string | null | undefined): string {
  switch ((contentType ?? '').toLowerCase()) {
    case 'video/mp4':
      return 'mp4'
    case 'video/quicktime':
      return 'mov'
    case 'video/webm':
      return 'webm'
    case 'video/x-matroska':
      return 'mkv'
    default:
      return 'bin'
  }
}
