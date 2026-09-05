import type { ReactNode } from 'react'

type Tone = 'accent' | 'positive' | 'negative' | 'warn'

const FILL: Record<Tone, string> = {
  accent: 'bg-accent',
  positive: 'bg-positive',
  negative: 'bg-negative',
  warn: 'bg-warn',
}

export interface MeterProps {
  /** 0..1. Values outside the range are clamped; null renders an unknown state. */
  value: number | null
  label: ReactNode
  detail?: ReactNode
  tone?: Tone
  /** Text read to screen readers in place of the raw ratio. */
  valueText?: string
}

/**
 * A proportion bar. Used for overdraft headroom, budget usage and goal progress.
 * A null value means "not enough data", and says so rather than showing an empty bar.
 */
export function Meter({ value, label, detail, tone = 'accent', valueText }: MeterProps) {
  const known = value !== null && Number.isFinite(value)
  const clamped = known ? Math.min(1, Math.max(0, value)) : 0

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-muted">{label}</span>
        {detail ? <span className="tabular text-ink">{detail}</span> : null}
      </div>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(known ? { 'aria-valuenow': Math.round(clamped * 100) } : {})}
        aria-valuetext={valueText ?? (known ? `${Math.round(clamped * 100)}%` : 'Not enough data')}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        {known ? (
          <div
            className={['h-full rounded-full transition-[width]', FILL[tone]].join(' ')}
            style={{ width: `${clamped * 100}%` }}
          />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--color-border)_0_6px,transparent_6px_12px)]" />
        )}
      </div>
      {!known ? <p className="mt-1 text-xs text-ink-faint">Not enough data yet</p> : null}
    </div>
  )
}
