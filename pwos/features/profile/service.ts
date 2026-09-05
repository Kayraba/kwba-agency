import 'server-only'

import { cache } from 'react'

import type { ProfileRow } from '@/lib/db.types'
import { createClient } from '@/lib/supabase/server'

/**
 * Read the signed-in user's profile, creating it on first sign-in.
 *
 * Supabase does not create application rows for us, and a trigger on
 * `auth.users` needs privileges on a schema this app should not be touching. So
 * the profile and the default categories are created here, on first sight of a
 * user with no profile. See docs/adr/0003-profile-bootstrap-in-app-code.md.
 *
 * Cached per request: the shell layout and the pages under it all want it.
 */
export const getProfile = cache(async (userId: string): Promise<ProfileRow> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<ProfileRow>()

  if (error) throw new Error(`Could not read your profile: ${error.message}`)
  if (data) return data

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('*')
    .single<ProfileRow>()

  if (insertError) throw new Error(`Could not create your profile: ${insertError.message}`)

  // Seeded once, on the same trip. The function is ON CONFLICT DO NOTHING, so a
  // race between two first requests cannot double up the categories.
  const { error: seedError } = await supabase.rpc('seed_default_categories', {
    p_user: userId,
  })
  if (seedError) throw new Error(`Could not seed your categories: ${seedError.message}`)

  return created
})

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'display_name' | 'base_currency' | 'timezone' | 'theme'>>,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(`Could not save your settings: ${error.message}`)
}
