import { GoogleAuth } from 'google-auth-library'

/**
 * Triggers the COLMAP Cloud Run job via the Cloud Run Admin API v2 `:run`
 * method, passing per-execution settings as container env overrides. We call
 * the REST API directly with google-auth-library (already a dependency) rather
 * than pulling in @google-cloud/run + gRPC — lighter, and consistent with how
 * storage.ts authenticates.
 *
 * Orchestration is opt-in: it's only active when COLMAP_JOB_NAME is set, so an
 * un-configured environment behaves exactly as before (no trigger).
 */

const JOB_NAME = process.env.COLMAP_JOB_NAME // opt-in; no default
const REGION = process.env.COLMAP_JOB_REGION ?? 'us-central1'
const PROJECT_ENV = process.env.GCP_PROJECT
const CALLBACK_URL = process.env.COLMAP_CALLBACK_URL
const CALLBACK_TOKEN = process.env.COLMAP_CALLBACK_TOKEN

/** True when the Cloud Run job to trigger is configured. */
export function colmapJobConfigured(): boolean {
  return !!JOB_NAME
}

let googleAuth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
  }
  return googleAuth
}

/** Explicit GCP_PROJECT wins; otherwise resolve from ADC. */
async function resolveProject(): Promise<string> {
  if (PROJECT_ENV) return PROJECT_ENV
  const id = await getAuth().getProjectId()
  if (!id) throw new Error('could not resolve GCP project (set GCP_PROJECT)')
  return id
}

export interface TriggerOpts {
  jobId: string
  sourceGsUri: string
  outputGsPrefix: string
  fps?: number | null
  matcher?: string
}

/**
 * Start one execution of the COLMAP job for `jobId`. Returns the long-running
 * Operation name. Does NOT wait for completion — the container reports back via
 * the /callback endpoint (CALLBACK_URL/CALLBACK_TOKEN). USE_GPU and other infra
 * defaults are left to the job spec; we only override the per-run values.
 */
export async function triggerColmapJob(opts: TriggerOpts): Promise<string> {
  if (!JOB_NAME) throw new Error('COLMAP_JOB_NAME is not set')
  const project = await resolveProject()

  const env: Array<{ name: string; value: string }> = [
    { name: 'SOURCE_GS_URI', value: opts.sourceGsUri },
    { name: 'OUTPUT_GS_PREFIX', value: opts.outputGsPrefix },
    { name: 'JOB_ID', value: opts.jobId },
  ]
  if (opts.fps != null) env.push({ name: 'FPS', value: String(opts.fps) })
  if (opts.matcher) env.push({ name: 'MATCHER', value: opts.matcher })
  if (CALLBACK_URL) env.push({ name: 'CALLBACK_URL', value: CALLBACK_URL })
  if (CALLBACK_TOKEN) env.push({ name: 'CALLBACK_TOKEN', value: CALLBACK_TOKEN })

  const name = `projects/${project}/locations/${REGION}/jobs/${JOB_NAME}`
  const url = `https://run.googleapis.com/v2/${name}:run`

  const token = await (await getAuth().getClient()).getAccessToken()
  if (!token.token) throw new Error('failed to obtain access token')

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    // A single override block with no `name` applies to the job's lone
    // container; matching keys are replaced, others inherited from the spec.
    body: JSON.stringify({ overrides: { containerOverrides: [{ env }] } }),
  })

  if (!resp.ok) {
    throw new Error(`runJob failed (${resp.status}): ${await resp.text()}`)
  }
  const body = (await resp.json()) as { name?: string }
  return body.name ?? 'unknown'
}
