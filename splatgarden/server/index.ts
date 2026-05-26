import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toNodeHandler, fromNodeHeaders } from 'better-auth/node'
import { auth } from './auth'

const app = express()

// --- Auth ---
// Mount the Better Auth handler BEFORE express.json(): it reads the raw request
// body itself, so a JSON body parser must not consume it first.
// Express 5 requires a named wildcard (path-to-regexp v8).
app.all('/api/auth/*splat', toNodeHandler(auth))

// JSON parsing for everything else.
app.use(express.json())

// --- API routes ---
app.get('/api/hello', (_req, res) => {
  res.json({ message: 'hello from express' })
})

// Example protected route: returns the current user or 401.
app.get('/api/me', async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  if (!session) {
    res.status(401).json({ error: 'not authenticated' })
    return
  }
  res.json({ user: session.user })
})

// --- Serve the built frontend in production ---
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  // SPA fallback: let client-side routing handle non-API paths.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const port = Number(process.env.PORT) || 3000
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
