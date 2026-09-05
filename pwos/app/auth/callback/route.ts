import { NextResponse, type NextRequest } from 'next/server'

import { allowedEmail } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link landing. Exchanges the one-time code for a session cookie.
 *
 * The permitted-address check runs again here: a link minted for another address
 * — or one that was valid before the allow-list changed — is signed straight
 * back out rather than being allowed to hold a session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/position'

  if (!code) {
    return NextResponse.redirect(new URL('/auth/error?reason=missing-code', origin))
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/auth/error?reason=expired', origin))
  }

  if ((data.user.email ?? '').toLowerCase() !== allowedEmail()) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/auth/error?reason=not-permitted', origin))
  }

  return NextResponse.redirect(new URL(next, origin))
}
