import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/** POST only: signing out is a state change and must not be reachable by a link prefetch. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/sign-in', request.nextUrl.origin), { status: 303 })
}
