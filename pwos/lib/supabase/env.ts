/** Environment access in one place, so a missing variable fails loudly and early. */

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in — see README.`,
    )
  }
  return value
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL')
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

/**
 * The one address permitted to sign in. PWOS is a single-user app; this is
 * checked server-side before a magic link is sent and again on every request.
 */
export function allowedEmail(): string {
  return required('PWOS_ALLOWED_EMAIL').trim().toLowerCase()
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}
