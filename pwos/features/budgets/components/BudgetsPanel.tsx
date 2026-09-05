'use client'

import { useActionState, useId, useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Chip'
import { Meter } from '@/components/ui/Meter'
import { Money } from '@/components/ui/Money'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { addMonths, formatMonth } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { idle, type ActionResult } from '@/lib/result'

import { copyLastMonthAction, setBudgetAction } from '../actions'
import type { BudgetLine, BudgetTotals } from '../derive'

export interface BudgetsPanelProps {
  month: string
  lines: BudgetLine[]
  totals: BudgetTotals
  variableBudgetMinor: number
}

/**
 * Budgets for a month.
 *
 * One row per outgoing category, budgeted or not, with what was actually spent
 * beside the target. Editing is inline — a budget you have to open a sheet to
 * nudge is a budget you stop nudging.
 */
export function BudgetsPanel({
  month,
  lines,
  totals,
  variableBudgetMinor,
}: BudgetsPanelProps) {
  const router = useRouter()
  const [copyState, copy] = useActionState<ActionResult, FormData>(copyLastMonthAction, idle)

  const budgeted = lines.filter((line) => line.hasTarget)
  const unbudgeted = lines.filter((line) => !line.hasTarget)

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3">
        <Button
          variant="secondary"
          onClick={() => router.push(`/money/budgets?month=${addMonths(month, -1)}`)}
          aria-label="Previous month"
        >
          ‹
        </Button>
        <span className="flex-1 text-center text-sm font-medium text-ink">
          {formatMonth(month)}
        </span>
        <Button
          variant="secondary"
          onClick={() => router.push(`/money/budgets?month=${addMonths(month, 1)}`)}
          aria-label="Next month"
        >
          ›
        </Button>
      </div>

      <div className="space-y-3 px-4">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4">
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-ink-muted">Budgeted</dt>
              <dd className="mt-0.5">
                <Money minor={totals.targetMinor} tone="neutral" compactZeros />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Spent</dt>
              <dd className="mt-0.5">
                <Money minor={totals.spentMinor} tone="negative" compactZeros />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Day-to-day</dt>
              <dd className="mt-0.5">
                <Money
                  minor={variableBudgetMinor}
                  tone="neutral"
                  compactZeros
                  calculated
                  source="Budgets on categories that are neither fixed nor subscriptions — the figure the surplus uses"
                />
              </dd>
            </div>
          </dl>
          {totals.overCount > 0 ? (
            <p className="mt-3 text-sm text-negative">
              {totals.overCount} categor{totals.overCount === 1 ? 'y is' : 'ies are'} over budget.
            </p>
          ) : null}
          {totals.unbudgetedSpendMinor > 0 ? (
            <p className="mt-1 text-sm text-ink-muted">
              <Money minor={totals.unbudgetedSpendMinor} tone="neutral" compactZeros /> went on
              categories with no budget set.
            </p>
          ) : null}
        </div>

        <form action={copy}>
          <input type="hidden" name="month" value={month} />
          <SubmitButton variant="secondary" pendingLabel="Copying…">
            Copy last month&rsquo;s budgets
          </SubmitButton>
        </form>
        {copyState.message ? (
          <p
            role={copyState.ok ? 'status' : 'alert'}
            className={['text-sm', copyState.ok ? 'text-ink-muted' : 'text-negative'].join(' ')}
          >
            {copyState.message}
          </p>
        ) : null}
      </div>

      <Section title="Budgeted" lines={budgeted} month={month} />
      <Section
        title="No budget set"
        hint="Set a figure to bring one of these into the day-to-day total."
        lines={unbudgeted}
        month={month}
      />
    </>
  )
}

function Section({
  title,
  hint,
  lines,
  month,
}: {
  title: string
  hint?: string
  lines: BudgetLine[]
  month: string
}) {
  if (lines.length === 0) return null

  return (
    <section className="mt-6 px-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {hint ? <p className="mt-0.5 mb-2 text-xs text-ink-muted">{hint}</p> : null}
      <ul className="mt-2 space-y-3">
        {lines.map((line) => (
          <BudgetRow key={line.categoryId} line={line} month={month} />
        ))}
      </ul>
    </section>
  )
}

function BudgetRow({ line, month }: { line: BudgetLine; month: string }) {
  const [state, save] = useActionState<ActionResult, FormData>(setBudgetAction, idle)
  const [value, setValue] = useState(
    line.hasTarget ? formatMoney(line.targetMinor, 'GBP', { symbol: false }).replace(/,/g, '') : '',
  )
  const ids = useId()

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{line.name}</span>
          {line.isSubscription ? (
            <Tag tone="warn">Subscription</Tag>
          ) : line.isFixed ? (
            <Tag>Fixed</Tag>
          ) : null}
        </span>
        <span className="shrink-0 text-right text-sm">
          <Money minor={line.spentMinor} tone="negative" compactZeros /> spent
        </span>
      </div>

      {line.hasTarget ? (
        <div className="mt-3">
          <Meter
            value={line.usedRatio}
            tone={line.isOver ? 'negative' : (line.usedRatio ?? 0) > 0.8 ? 'warn' : 'accent'}
            label={line.isOver ? 'Over by' : 'Left'}
            detail={
              <Money
                minor={Math.abs(line.remainingMinor)}
                tone={line.isOver ? 'negative' : 'positive'}
                compactZeros
              />
            }
          />
        </div>
      ) : null}

      {line.isFixed ? (
        <p className="mt-2 text-xs text-ink-muted">
          Fixed costs reach the surplus through their recurring rule, so a budget here is for
          tracking only — it is not counted twice.
        </p>
      ) : null}

      <form action={save} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="category_id" value={line.categoryId} />
        <input type="hidden" name="month" value={month} />
        <div className="flex-1">
          <label htmlFor={`${ids}-target`} className="mb-1 block text-xs text-ink-muted">
            Monthly budget
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted">
              £
            </span>
            <input
              id={`${ids}-target`}
              name="target"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface py-2.5 pr-3 pl-7 text-base text-ink"
            />
          </div>
        </div>
        <SubmitButton variant="secondary" pendingLabel="…">
          Save
        </SubmitButton>
      </form>

      {!state.ok ? (
        <p role="alert" className="mt-1.5 text-sm text-negative">
          {state.fieldErrors?.target ?? state.message}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-ink-faint">Clear the field and save to remove the budget.</p>
    </li>
  )
}
