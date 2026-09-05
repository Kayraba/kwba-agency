'use client'

import type { ReactNode } from 'react'

/**
 * A tappable category chip. 44px tall, so it can be hit one-handed at speed —
 * the quick-add flow lives or dies on this.
 */
export function Chip({
  children,
  selected = false,
  onClick,
  tone,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  tone?: 'in' | 'out'
}) {
  const selectedClass =
    tone === 'in'
      ? 'bg-positive-soft border-positive text-positive'
      : tone === 'out'
        ? 'bg-negative-soft border-negative text-negative'
        : 'bg-accent-soft border-accent text-accent'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? selectedClass : 'border-border bg-surface text-ink-muted',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** A non-interactive label. Used for account kinds, transaction sources, void markers. */
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'positive' | 'negative' | 'warn' | 'generated'
}) {
  const tones = {
    neutral: 'bg-surface-sunken text-ink-muted border-border',
    positive: 'bg-positive-soft text-positive border-positive/40',
    negative: 'bg-negative-soft text-negative border-negative/40',
    warn: 'bg-warn-soft text-warn border-warn/40',
    generated: 'bg-generated-soft text-generated border-generated/40',
  } as const

  return (
    <span
      className={[
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        tones[tone],
      ].join(' ')}
    >
      {children}
    </span>
  )
}
