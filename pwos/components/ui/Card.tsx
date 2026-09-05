import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'li' | 'article'
}) {
  return (
    <Tag
      className={[
        'rounded-[var(--radius-card)] border border-border bg-surface-raised',
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({
  title,
  action,
  hint,
}: {
  title: ReactNode
  action?: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}
