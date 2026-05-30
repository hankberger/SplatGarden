/**
 * Dev helper: show the latest COLMAP job rows from the DB. Useful in local
 * dev where the Cloud Run container can't reach localhost for callbacks, so
 * job statuses don't auto-update — pair with `scripts/finish-job.ts` after
 * confirming the cloud-side execution actually finished.
 *
 * Usage:
 *   npx tsx scripts/job-status.ts            # 5 most recent
 *   npx tsx scripts/job-status.ts 10         # N most recent
 *   npx tsx scripts/job-status.ts <jobId>    # single row by id
 */
import 'dotenv/config'
import { pool } from '../server/db'

async function main() {
  const arg = process.argv[2]
  const isId = arg && /^[0-9a-f]{32}$/i.test(arg)
  const limit = arg && !isId ? Math.max(1, Math.min(50, Number(arg) || 5)) : 5

  const { rows } = isId
    ? await pool.query(
        `select id, status, filename, fps, source_object, output_object,
                error_message, created_at, updated_at
           from colmap_job where id = $1`,
        [arg],
      )
    : await pool.query(
        `select id, status, filename, fps, source_object, output_object,
                error_message, created_at, updated_at
           from colmap_job order by created_at desc limit $1`,
        [limit],
      )

  console.log(rows)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
