import type { ReactNode } from 'react'

export function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-5 pb-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
