/**
 * Dev helper: manually flip a COLMAP job from `processing` to `done` (or
 * `failed`) and record its output prefix.
 *
 * We need this in local dev because COLMAP_CALLBACK_URL is empty (the Cloud
 * Run container can't reach localhost), so jobs that complete on the cloud
 * side stay stuck at `processing` in the DB. Once the server is deployed with
 * a public CALLBACK_URL, this script becomes unnecessary.
 *
 * Usage:
 *   npx tsx scripts/finish-job.ts <jobId> [outputPrefix]
 *   npx tsx scripts/finish-job.ts <jobId> --fail "<message>"
 */
import 'dotenv/config'
import { pool } from '../server/db'

async function main() {
  const [, , jobId, arg1, arg2] = process.argv
  if (!jobId) {
    console.error('usage: finish-job <jobId> [outputPrefix]')
    console.error('       finish-job <jobId> --fail "<errorMessage>"')
    process.exit(2)
  }

  const failing = arg1 === '--fail'
  const status = failing ? 'failed' : 'done'
  const errorMessage = failing ? (arg2 ?? 'manual fail') : null
  const outputPrefix = failing ? null : (arg1 ?? null)

  const { rows } = await pool.query(
    `update colmap_job
        set status        = $2,
            error_message = $3,
            output_object = coalesce($4, output_object),
            updated_at    = now()
      where id = $1 and status = 'processing'
      returning id, status, output_object`,
    [jobId, status, errorMessage, outputPrefix],
  )
  if (!rows[0]) {
    console.error(`no \`processing\` job with id ${jobId}`)
    process.exit(1)
  }
  console.log(rows[0])
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
