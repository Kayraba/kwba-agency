'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/States'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="space-y-4 p-4">
      <ErrorState
        title="That screen did not load"
        body={
          // Supabase pauses free-tier projects after a week of inactivity; the
          // first request after that fails before the database wakes up.
          'Something went wrong reading your data. If the app has been idle for a while, the database may still be waking up — try again in a few seconds.'
        }
      />
      <Button onClick={reset}>Try again</Button>
      {error.digest ? (
        <p className="text-xs text-ink-faint">Reference: {error.digest}</p>
      ) : null}
    </div>
  )
}
