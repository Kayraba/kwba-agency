import type { ReactNode } from 'react'

/**
 * Loading, empty and error states.
 *
 * Every list and every panel in PWOS ships with all three, and each of them says
 * something specific. "No data" is not a useful thing to read at 7am.
 */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="max-w-xs text-sm text-ink-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ title = 'That did not load', body }: { title?: string; body: string }) {
  return (
    <div role="alert" className="rounded-[var(--radius-card)] border border-negative/40 bg-negative-soft px-4 py-3">
      <p className="text-sm font-semibold text-negative">{title}</p>
      <p className="mt-0.5 text-sm text-ink">{body}</p>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={['animate-pulse rounded-lg bg-surface-sunken', className].join(' ')}
    />
  )
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  )
}
