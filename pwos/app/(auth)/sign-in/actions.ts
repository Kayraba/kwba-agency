'use server'

import { z } from 'zod'

import { allowedEmail, siteUrl } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  next: z.string().startsWith('/').optional(),
})

export interface SignInState {
  status: 'idle' | 'sent' | 'error'
  message?: string
}

/**
 * Send a magic link, but only to the one permitted address.
 *
 * The check is here, on the server, before Supabase is asked to send anything.
 * The response is deliberately the same whether the address matched or not, so
 * this page cannot be used to discover whose app it is.
 */
export async function sendMagicLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    next: formData.get('next') || undefined,
  })

  if (!parsed.success) {
    return { status: 'error', message: 'That does not look like an email address.' }
  }

  const { email, next } = parsed.data
  const sent: SignInState = {
    status: 'sent',
    message: 'If that address can sign in, a link is on its way. It expires in an hour.',
  }

  if (email !== allowedEmail()) return sent

  const supabase = await createClient()
  const callback = new URL('/auth/callback', siteUrl())
  if (next) callback.searchParams.set('next', next)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: true },
  })

  if (error) {
    return {
      status: 'error',
      message: 'The sign-in service did not respond. Try again in a moment.',
    }
  }

  return sent
}
