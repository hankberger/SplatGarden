import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { pool } from './db'

// Enable Google only once its credentials exist, so email/password works
// before Google OAuth is fully configured.
const socialProviders: BetterAuthOptions['socialProviders'] = {}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }
}

export const auth = betterAuth({
  // Better Auth accepts a pg Pool directly (uses Kysely under the hood).
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
  // Browser-facing origins allowed to call the auth API (CSRF protection).
  // In dev this is the Vite origin; in prod, your deployed URL.
  trustedOrigins:
    process.env.TRUSTED_ORIGINS?.split(',').map((o) => o.trim()) ?? [],
})
