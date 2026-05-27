import { createAuthClient } from 'better-auth/react'
import { usernameClient } from 'better-auth/client/plugins'

// Same-origin: in dev the Vite proxy forwards /api to Express; in prod Express
// serves both. So the default baseURL (current origin) + /api/auth is correct.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
