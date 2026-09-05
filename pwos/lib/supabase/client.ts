'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser client. Anon key only — it is public by design and RLS is what keeps
 * the data private. No service-role key ever reaches this file.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase environment variables are missing in the browser bundle.')
  }
  return createBrowserClient(url, key)
}
