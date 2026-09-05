'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState } from '@/components/ui/States'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { CategoryRow, RecurringRuleRow } from '@/lib/db.types'
import { formatDayLong } from '@/lib/dates'
import { idle, type ActionResult } from '@/lib/result'

import { deleteRuleAction, setRuleActiveAction } from '../actions'
import { monthlyRate } from '../occurrences'
import { FREQUENCY_LABELS } from '../schema'
import { RecurringForm } from './RecurringForm'

export interface RecurringPanelProps {
  rules: RecurringRuleRow[]
  accounts: { id: string; name: string }[]
  categoriesOut: CategoryRow[]
  categoriesIn: CategoryRow[]
  today: string
}

export function RecurringPanel({
  rules,
  accounts,
  categoriesOut,
  categoriesIn,
  today,
}: RecurringPanelProps) {
  const [sheet, setSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; rule: RecurringRuleRow } | null
  >(null)

  const categoryNames = new Map(
    [...categoriesOut, ...categoriesIn].map((category) => [category.id, category.name]),
  )

  const sections = [
    { direction: 'in' as const, title: 'Coming in' },
    { direction: 'out' as const, title: 'Going out' },
  ]

  return (
    <>
      <div className="px-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-ink-muted">Add an account before setting up a rule.</p>
        ) : (
          <Button size="lg" onClick={() => setSheet({ mode: 'new' })}>
            Add a rule
          </Button>
        )}
      </div>

      {rules.length === 0 ? (
        <EmptyState
          title="No recurring rules yet"
          body="Add your wages and your rent. Those two alone turn the Position screen from a balance into a plan — the surplus, the runway and the clearance date all depend on them."
        />
      ) : (
        sections.map((section) => {
          const rows = rules.filter((rule) => rule.direction === section.direction)
          if (rows.length === 0) return null

          return (
            <section key={section.direction} className="mt-6 px-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">{section.title}</h2>
              <ul className="space-y-3">
                {rows.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    categoryName={
                      rule.category_id ? categoryNames.get(rule.category_id) : undefined
                    }
                    onEdit={() => setSheet({ mode: 'edit', rule })}
                  />
                ))}
              </ul>
            </section>
          )
        })
      )}

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'edit' ? 'Edit rule' : 'Add a rule'}
      >
        {sheet ? (
          <RecurringForm
            {...(sheet.mode === 'edit' ? { rule: sheet.rule } : {})}
            accounts={accounts}
            categoriesOut={categoriesOut}
            categoriesIn={categoriesIn}
            today={today}
            onDone={() => setSheet(null)}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function RuleCard({
  rule,
  categoryName,
  onEdit,
}: {
  rule: RecurringRuleRow
  categoryName?: string | undefined
  onEdit: () => void
}) {
  const [activeState, setActive] = useActionState<ActionResult, FormData>(
    setRuleActiveAction,
    idle,
  )
  const [deleteState, remove] = useActionState<ActionResult, FormData>(deleteRuleAction, idle)
  const [confirming, setConfirming] = useState(false)

  const perMonth = Math.round(monthlyRate(rule.amount_minor, rule.frequency))
  const showsEquivalent = rule.frequency !== 'monthly'

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{rule.label}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>{FREQUENCY_LABELS[rule.frequency]}</span>
            {categoryName ? <span>· {categoryName}</span> : null}
            {!rule.is_active ? <Tag tone="warn">Paused</Tag> : null}
            {rule.ends_on ? <span>· ends {formatDayLong(rule.ends_on)}</span> : null}
          </p>
        </div>
        <div className="text-right">
          <Money
            minor={rule.direction === 'in' ? rule.amount_minor : -rule.amount_minor}
            signed
            className="font-semibold"
          />
          {showsEquivalent ? (
            <p className="mt-0.5 text-xs text-ink-muted">
              <span
                className="calculated tabular"
                title="Normalised to a month: weekly is 52 weeks a year, not four weeks a month"
              >
                {rule.direction === 'in' ? '+' : '−'}
                {(perMonth / 100).toFixed(2)}
              </span>{' '}
              a month
            </p>
          ) : null}
        </div>
      </div>

      {!activeState.ok ? (
        <p role="alert" className="mt-2 text-sm text-negative">
          {activeState.message}
        </p>
      ) : null}
      {!deleteState.ok ? (
        <p role="alert" className="mt-2 text-sm text-negative">
          {deleteState.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        <form action={setActive}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="active" value={String(!rule.is_active)} />
          <SubmitButton variant="ghost" pendingLabel="…">
            {rule.is_active ? 'Pause' : 'Resume'}
          </SubmitButton>
        </form>
        {confirming ? (
          <form action={remove} className="flex gap-2">
            <input type="hidden" name="id" value={rule.id} />
            <SubmitButton variant="danger" pendingLabel="Deleting…">
              Really delete
            </SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
      </div>
    </li>
  )
}
