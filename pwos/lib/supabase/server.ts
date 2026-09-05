import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * Supabase client for server components, server actions and route handlers.
 *
 * Every query made through this client is subject to RLS as the signed-in user.
 * There is no service-role client in this codebase; if one is ever added it goes
 * in a `server-only` module and never touches a request handler that takes user
 * input.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // The proxy refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  })
}
