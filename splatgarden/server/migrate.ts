/**
 * Tiny SQL migration runner for our own app tables (Better Auth manages its own).
 * Applies every server/migrations/*.sql file that isn't yet recorded in
 * the _migrations tracking table. Each file runs in a transaction.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.join(__dirname, 'migrations')

async function run() {
  await pool.query(`
    create table if not exists _migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `)

  const { rows } = await pool.query<{ name: string }>(
    'select name from _migrations',
  )
  const applied = new Set(rows.map((r) => r.name))

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  let count = 0
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(path.join(dir, file), 'utf8')
    console.log(`Applying ${file}`)
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into _migrations(name) values ($1)', [file])
      await client.query('commit')
      count++
    } catch (e) {
      await client.query('rollback')
      throw e
    } finally {
      client.release()
    }
  }
  console.log(count === 0 ? 'No migrations to apply.' : `Applied ${count}.`)
}

run()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err)
    await pool.end()
    process.exit(1)
  })
