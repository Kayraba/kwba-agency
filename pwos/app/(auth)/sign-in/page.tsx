import type { Metadata } from 'next'

import { SignInForm } from './SignInForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : undefined

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-ink-faint uppercase">
          Personal Wealth OS
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">
          One account, one address. Enter it and a link arrives by email — there is no password
          to forget.
        </p>
      </div>

      <SignInForm next={safeNext} />
    </main>
  )
}
