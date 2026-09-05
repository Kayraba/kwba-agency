'use client'

import { useId, useMemo, useState } from 'react'

import { MoneyField } from '@/components/ui/Field'
import { Money } from '@/components/ui/Money'
import { formatMoney, parseMoney } from '@/lib/money'

import { affordability, type PositionSummary } from '../derive'

/**
 * "Can I afford this, and what does it cost me."
 *
 * The first of the three jobs in the brief, and the one that happens most often:
 * standing in a shop, one hand, five seconds. It answers with the headroom and
 * the runway you would be left with, and it does not use the word "afford" —
 * £120 is affordable on the 3rd and reckless on the 28th, and only you know
 * which day it is.
 *
 * Everything is computed in the browser from figures already on the page. No
 * request, no spinner, no waiting on a signal in a shop.
 */
export function AffordabilityChecker({ summary }: { summary: PositionSummary }) {
  const [input, setInput] = useState('')
  const ids = useId()

  const amountMinor = useMemo(() => parseMoney(input), [input])
  const result = useMemo(
    () => (amountMinor !== null && amountMinor > 0 ? affordability(summary, amountMinor) : null),
    [amountMinor, summary],
  )

  const invalid = input.trim() !== '' && amountMinor === null

  return (
    <div>
      <MoneyField
        id={`${ids}-amount`}
        label="If I spend…"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        error={invalid ? 'Enter an amount like 12.50' : undefined}
        hint={
          result
            ? undefined
            : 'Type an amount to see what it leaves you with. Nothing is recorded.'
        }
      />

      {result ? (
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-sunken p-3">
              <dt className="text-xs text-ink-muted">Headroom left</dt>
              <dd className="mt-0.5">
                <Money
                  minor={result.headroomAfterMinor}
                  tone={result.withinHeadroom ? 'positive' : 'negative'}
                  calculated
                  source="Balance plus overdraft limit, less this amount"
                  className="text-lg font-semibold"
                />
              </dd>
            </div>
            <div className="rounded-xl bg-surface-sunken p-3">
              <dt className="text-xs text-ink-muted">Runway left</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {result.runwayAfterDays === null ? (
                  <span className="text-sm font-normal text-ink-muted">
                    Not enough spending logged yet
                  </span>
                ) : (
                  <span
                    className={[
                      'tabular calculated',
                      result.runwayAfterDays < 7 ? 'text-negative' : 'text-ink',
                    ].join(' ')}
                    title={`Remaining headroom divided by your average daily spending of ${formatMoney(
                      Math.round(summary.burnPerDay ?? 0),
                    )}`}
                  >
                    {result.runwayAfterDays} {result.runwayAfterDays === 1 ? 'day' : 'days'}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          <p className="text-sm text-ink-muted">
            {!result.withinHeadroom ? (
              <span className="text-negative">
                That is{' '}
                <Money minor={-result.headroomAfterMinor} tone="negative" compactZeros /> past your
                arranged overdraft limit.
              </span>
            ) : result.withinBalance ? (
              'That comes out of money you have, not the overdraft.'
            ) : (
              'That goes into your arranged overdraft.'
            )}
            {result.runwayCostDays !== null && result.runwayCostDays > 0 ? (
              <>
                {' '}
                It costs you {result.runwayCostDays}{' '}
                {result.runwayCostDays === 1 ? 'day' : 'days'} of runway.
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  )
}
