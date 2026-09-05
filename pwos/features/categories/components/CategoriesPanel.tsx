'use client'

import { useActionState, useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Chip'
import { Field, SelectField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { CategoryRow, FlowDirection } from '@/lib/db.types'
import { idle, type ActionResult } from '@/lib/result'

import { createCategoryAction, deleteCategoryAction, updateCategoryAction } from '../actions'

export function CategoriesPanel({ categories }: { categories: CategoryRow[] }) {
  const [sheet, setSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; category: CategoryRow } | null
  >(null)

  const sections: { direction: FlowDirection; title: string; hint: string }[] = [
    { direction: 'out', title: 'Money out', hint: 'Fixed categories are excluded from the day-to-day budget.' },
    { direction: 'in', title: 'Money in', hint: 'Wages, business income, anything that arrives.' },
  ]

  return (
    <>
      <div className="px-4">
        <Button size="lg" onClick={() => setSheet({ mode: 'new' })}>
          Add a category
        </Button>
      </div>

      {sections.map((section) => {
        const rows = categories.filter((category) => category.direction === section.direction)
        return (
          <section key={section.direction} className="mt-6 px-4">
            <h2 className="text-sm font-semibold text-ink">{section.title}</h2>
            <p className="mt-0.5 mb-2 text-xs text-ink-muted">{section.hint}</p>
            {rows.length === 0 ? (
              <p className="py-3 text-sm text-ink-muted">Nothing here yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface-raised">
                {rows.map((category) => (
                  <CategoryRowItem
                    key={category.id}
                    category={category}
                    onEdit={() => setSheet({ mode: 'edit', category })}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'edit' ? 'Edit category' : 'Add a category'}
      >
        {sheet ? (
          <CategoryForm
            {...(sheet.mode === 'edit' ? { category: sheet.category } : {})}
            onDone={() => setSheet(null)}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function CategoryRowItem({
  category,
  onEdit,
}: {
  category: CategoryRow
  onEdit: () => void
}) {
  const [state, remove] = useActionState<ActionResult, FormData>(deleteCategoryAction, idle)
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-ink">{category.name}</span>
          {category.is_subscription ? (
            <Tag tone="warn">Subscription</Tag>
          ) : category.is_fixed ? (
            <Tag>Fixed</Tag>
          ) : null}
        </span>
        <span className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
          {confirming ? (
            <form action={remove} className="flex gap-1">
              <input type="hidden" name="id" value={category.id} />
              <SubmitButton variant="danger" pendingLabel="…">
                Delete
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </form>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          )}
        </span>
      </div>
      {!state.ok ? (
        <p role="alert" className="mt-1 text-sm text-negative">
          {state.message}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p className="mt-1 text-xs text-ink-muted">{state.message}</p>
      ) : null}
    </li>
  )
}

function CategoryForm({
  category,
  onDone,
  onCancel,
}: {
  category?: CategoryRow
  onDone: () => void
  onCancel: () => void
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    category ? updateCategoryAction : createCategoryAction,
    idle,
  )
  const ids = useId()
  const fieldErrors = state.ok ? undefined : state.fieldErrors

  useEffect(() => {
    if (state.ok && state.message) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <Field
        id={`${ids}-name`}
        name="name"
        label="Name"
        defaultValue={category?.name ?? ''}
        error={fieldErrors?.name}
        autoFocus
        required
      />

      <SelectField
        id={`${ids}-direction`}
        name="direction"
        label="Side"
        defaultValue={category?.direction ?? 'out'}
        error={fieldErrors?.direction}
      >
        <option value="out">Money out</option>
        <option value="in">Money in</option>
      </SelectField>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
        <input
          type="checkbox"
          name="is_fixed"
          defaultChecked={category?.is_fixed ?? false}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-ink">This is a fixed cost</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Rent, phone, gym — money that leaves whether you think about it or not. Fixed
            categories are kept out of the day-to-day budget.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
        <input
          type="checkbox"
          name="is_subscription"
          defaultChecked={category?.is_subscription ?? false}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-ink">…and it is a subscription</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            A fixed cost you could cancel this afternoon. Subscriptions get their own line on the
            Position screen for exactly that reason. Ticking this ticks fixed too.
          </span>
        </span>
      </label>

      {!state.ok ? (
        <p role="alert" className="text-sm text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton className="flex-1">
          {category ? 'Save category' : 'Add category'}
        </SubmitButton>
      </div>
    </form>
  )
}
