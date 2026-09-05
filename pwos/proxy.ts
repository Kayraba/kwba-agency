import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/sign-in', '/auth/callback', '/auth/error']

/**
 * Refreshes the Supabase session cookie and gates the app.
 *
 * This is a redirect, not a security boundary: RLS and the per-request
 * `requireUser()` check are what actually protect the data. It exists so an
 * unauthenticated visitor lands on the sign-in page instead of an empty shell.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path))

  if (!user && !isPublic) {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/sign-in'
    redirect.searchParams.set('next', pathname)
    return NextResponse.redirect(redirect)
  }

  if (user && pathname === '/sign-in') {
    const redirect = request.nextUrl.clone()
    redirect.pathname = '/position'
    redirect.search = ''
    return NextResponse.redirect(redirect)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
