'use client'

import { useActionState } from 'react'

import { Tag } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { confirmOccurrenceAction } from '@/features/recurring/actions'
import type { Forecast } from '@/features/recurring/forecast'
import { formatDayShort, formatRelativeDay } from '@/lib/dates'
import { idle, type ActionResult } from '@/lib/result'

/**
 * What the recurring rules say is coming, and what has already landed.
 *
 * A forecast row is not in the ledger. Confirming one writes it — one tap, and
 * the unique index in migration 0002 means a second tap is a no-op rather than a
 * second rent payment.
 */
export function ForecastPanel({
  forecast,
  today,
}: {
  forecast: Forecast[]
  today: string
}) {
  const [state, confirm] = useActionState<ActionResult, FormData>(confirmOccurrenceAction, idle)

  const due = forecast.filter((row) => row.status === 'due')
  const upcoming = forecast.filter((row) => row.status === 'upcoming').slice(0, 8)

  if (forecast.length === 0) return null

  return (
    <div>
      {due.length > 0 ? (
        <section className="border-b border-border px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-warn uppercase">
            Due — not logged yet
          </h3>
          <ul className="space-y-2">
            {due.map((row) => (
              <li key={row.key} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{row.label}</p>
                  <p className="text-xs text-ink-muted">{formatRelativeDay(row.date, today)}</p>
                </div>
                <Money
                  minor={row.direction === 'in' ? row.amountMinor : -row.amountMinor}
                  signed
                  compactZeros
                />
                <form action={confirm}>
                  <input type="hidden" name="rule_id" value={row.ruleId} />
                  <input type="hidden" name="date" value={row.date} />
                  <SubmitButton variant="secondary" pendingLabel="…">
                    Log it
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          {!state.ok ? (
            <p role="alert" className="mt-2 text-sm text-negative">
              {state.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Still to come
          </h3>
          <ul className="space-y-1.5">
            {upcoming.map((row) => (
              <li key={row.key} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-xs text-ink-muted">
                  {formatDayShort(row.date)}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
                <Money
                  minor={row.direction === 'in' ? row.amountMinor : -row.amountMinor}
                  signed
                  compactZeros
                  tone="muted"
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            <Tag>Forecast</Tag> Nothing above is in the ledger until its date arrives and you log
            it.
          </p>
        </section>
      ) : null}
    </div>
  )
}
