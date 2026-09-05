import 'server-only'

import { cache } from 'react'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

import { allowedEmail } from './supabase/env'
import { createClient } from './supabase/server'

export class NotAuthenticatedError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'NotAuthenticatedError'
  }
}

/**
 * The single source of identity on the server.
 *
 * `getUser()` verifies the JWT with Supabase rather than trusting the cookie,
 * and the address is re-checked against the permitted one on every request — a
 * session minted before the allow-list changed does not survive it.
 *
 * Cached per request: the shell layout and the page inside it both need it, and
 * verifying a JWT is a round trip to the auth server.
 *
 * No route, action or service ever takes a user_id from the client.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null
  if ((user.email ?? '').toLowerCase() !== allowedEmail()) return null

  return user
})

/** Same, but redirects to sign-in instead of returning null. Use this in pages and layouts. */
export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect('/sign-in')
  return user
}

/** Same, but throws. Use this in server actions, where a redirect would swallow the error. */
export async function requireUserId(): Promise<string> {
  const user = await getUser()
  if (!user) throw new NotAuthenticatedError()
  return user.id
}
