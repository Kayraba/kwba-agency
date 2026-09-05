'use client'

import { useMemo, useState } from 'react'

import { Money } from '@/components/ui/Money'
import { Tag } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/States'
import { formatMonth, formatRelativeDay } from '@/lib/dates'
import type { CategoryRow } from '@/lib/db.types'

import { groupByMonth } from '../group'
import type { TransactionWithRefs } from '../service'
import { TransactionDetail } from './TransactionDetail'
import type { QuickAddAccount } from './QuickAdd'

export interface TransactionListProps {
  rows: TransactionWithRefs[]
  accounts: QuickAddAccount[]
  categoriesOut: CategoryRow[]
  categoriesIn: CategoryRow[]
  today: string
  /** True when a filter is active, so the empty state can say so. */
  filtered: boolean
}

/**
 * The ledger.
 *
 * Grouped by month with a running in/out total per month. Voided rows stay
 * visible, struck through and excluded from the totals — the history should show
 * that you made a mistake and fixed it, not pretend it never happened.
 */
export function TransactionList({
  rows,
  accounts,
  categoriesOut,
  categoriesIn,
  today,
  filtered,
}: TransactionListProps) {
  const [selected, setSelected] = useState<TransactionWithRefs | null>(null)
  const groups = useMemo(() => groupByMonth(rows), [rows])

  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        title="Nothing matches that filter"
        body="Try a different month or category, or clear the filter to see everything."
      />
    ) : (
      <EmptyState
        title="No transactions yet"
        body="Tap the + button and log the last thing you spent money on. It takes about five seconds."
      />
    )
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.month}>
            <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 bg-surface px-4 py-2">
              <h2 className="text-sm font-semibold text-ink">{formatMonth(group.month)}</h2>
              <p className="text-xs text-ink-muted">
                <Money minor={group.totals.inMinor} tone="positive" compactZeros /> in ·{' '}
                <Money minor={group.totals.outMinor} tone="negative" compactZeros /> out
              </p>
            </div>

            <ul className="divide-y divide-border border-y border-border">
              {group.rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'truncate text-sm font-medium',
                          row.is_void ? 'text-ink-faint line-through' : 'text-ink',
                        ].join(' ')}
                      >
                        {row.merchant ?? row.category?.name ?? 'Uncategorised'}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-muted">
                        <span>{formatRelativeDay(row.occurred_on, today)}</span>
                        {row.merchant && row.category ? <span>· {row.category.name}</span> : null}
                        {row.account && accounts.length > 1 ? (
                          <span>· {row.account.name}</span>
                        ) : null}
                        {row.is_void ? <Tag tone="warn">Voided</Tag> : null}
                        {row.corrects_id ? <Tag>Correction</Tag> : null}
                      </p>
                    </div>
                    <Money
                      minor={row.direction === 'in' ? row.amount_minor : -row.amount_minor}
                      currency={row.currency}
                      tone={row.is_void ? 'muted' : 'auto'}
                      signed
                      className={row.is_void ? 'line-through' : ''}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <TransactionDetail
        transaction={selected}
        accounts={accounts}
        categoriesOut={categoriesOut}
        categoriesIn={categoriesIn}
        today={today}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
