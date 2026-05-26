import 'dotenv/config'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. See .env.example for local (Cloud SQL Auth Proxy) ' +
      'and Cloud Run (Unix socket) connection string formats.',
  )
}

/**
 * Single shared connection pool, used by both Better Auth and our own queries.
 *
 * Local dev (via Cloud SQL Auth Proxy):
 *   postgresql://USER:PASS@localhost:5432/DBNAME
 * Cloud Run (Unix socket mounted at /cloudsql):
 *   postgresql://USER:PASS@/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE
 */
export const pool = new Pool({ connectionString })
