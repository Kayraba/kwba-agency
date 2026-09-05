import { AppHeader } from './AppHeader'

/**
 * A screen that does not exist yet.
 *
 * It says which phase builds it and what has to be true first, rather than
 * pretending to be an empty state for a feature that was never written.
 */
export function NotYet({
  title,
  phase,
  body,
}: {
  title: string
  phase: string
  body: string
}) {
  return (
    <>
      <AppHeader title={title} subtitle={phase} />
      <div className="px-4">
        <div className="rounded-[var(--radius-card)] border border-dashed border-border-strong p-5">
          <p className="text-sm text-ink-muted">{body}</p>
        </div>
      </div>
    </>
  )
}
