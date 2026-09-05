import Link from 'next/link'

import { Button } from '@/components/ui/Button'

const REASONS: Record<string, string> = {
  'missing-code': 'That link was incomplete. Ask for a new one.',
  expired: 'That link has expired or has already been used. Links last an hour and work once.',
  'not-permitted': 'That address cannot sign in to this app.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  const message = REASONS[reason ?? ''] ?? 'Something went wrong signing you in.'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <h1 className="text-2xl font-semibold text-ink">Not signed in</h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <Link href="/sign-in" className="mt-6 block">
        <Button size="lg">Back to sign in</Button>
      </Link>
    </main>
  )
}
