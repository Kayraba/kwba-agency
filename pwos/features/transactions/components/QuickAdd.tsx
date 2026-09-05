'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { MoneyField, SelectField, TextAreaField } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { CategoryRow, FlowDirection } from '@/lib/db.types'
import { idle, type ActionResult } from '@/lib/result'

import { createTransactionAction } from '../actions'

export interface QuickAddAccount {
  id: string
  name: string
  currency: string
}

export interface QuickAddProps {
  accounts: QuickAddAccount[]
  defaultAccountId: string
  /** Ordered by recent use, out first. Both directions are supplied so switching is instant. */
  categoriesOut: CategoryRow[]
  categoriesIn: CategoryRow[]
  /** Today in the user's timezone, resolved on the server. */
  today: string
}

/**
 * Quick add.
 *
 * Three taps: open, pick a category, log. The amount field takes focus with a
 * numeric keypad the moment the sheet opens, so the keyboard is already up while
 * the thumb is still moving. Everything else — date, account, note — is folded
 * away behind a disclosure and defaults to the right thing.
 *
 * This is the screen that decides whether the app gets used, so it gets the
 * fewest decisions.
 */
export function QuickAdd(props: QuickAddProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Log a transaction"
        className={[
          'fixed right-4 bottom-[calc(var(--spacing-nav)+1rem+env(safe-area-inset-bottom))] z-40',
          'flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl',
          'text-accent-ink shadow-lg transition-transform active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        ].join(' ')}
      >
        <span aria-hidden>+</span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Log a transaction">
        {/* Mounted only while open, so the amount field takes focus each time
            the sheet is opened rather than once when the page loads. */}
        {open ? <QuickAddForm {...props} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  )
}

function QuickAddForm({
  accounts,
  defaultAccountId,
  categoriesOut,
  categoriesIn,
  today,
  onDone,
}: QuickAddProps & { onDone: () => void }) {
  const [state, action] = useActionState<ActionResult, FormData>(createTransactionAction, idle)
  const [direction, setDirection] = useState<FlowDirection>('out')
  const [categoryId, setCategoryId] = useState<string>('')
  const [showDetail, setShowDetail] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const ids = useId()

  const categories = direction === 'out' ? categoriesOut : categoriesIn
  const fieldErrors = state.ok ? undefined : state.fieldErrors

  useEffect(() => {
    // The keypad should already be up by the time the thumb arrives.
    amountRef.current?.focus()
  }, [])

  useEffect(() => {
    if (state.ok && state.message) {
      formRef.current?.reset()
      setCategoryId('')
      setShowDetail(false)
      onDone()
    }
  }, [state, onDone])

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="direction" value={direction} />
      <input type="hidden" name="category_id" value={categoryId} />

      <div
        role="group"
        aria-label="Direction"
        className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1"
      >
        {(['out', 'in'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={direction === value}
            onClick={() => {
              setDirection(value)
              setCategoryId('')
            }}
            className={[
              'rounded-lg py-2 text-sm font-medium transition-colors',
              direction === value
                ? value === 'out'
                  ? 'bg-negative-soft text-negative'
                  : 'bg-positive-soft text-positive'
                : 'text-ink-muted',
            ].join(' ')}
          >
            {value === 'out' ? 'Spent' : 'Received'}
          </button>
        ))}
      </div>

      <MoneyField
        ref={amountRef}
        id={`${ids}-amount`}
        name="amount"
        label={direction === 'out' ? 'Amount spent' : 'Amount received'}
        error={fieldErrors?.amount}
        required
      />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Category</legend>
        {categories.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No categories on this side yet. You can add one under More → Categories.
          </p>
        ) : (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {categories.map((category) => (
              <Chip
                key={category.id}
                tone={direction}
                selected={categoryId === category.id}
                onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
              >
                {category.name}
              </Chip>
            ))}
          </div>
        )}
      </fieldset>

      {showDetail ? (
        <div className="space-y-4 border-t border-border pt-4">
          <div>
            <label
              htmlFor={`${ids}-date`}
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Date
            </label>
            <input
              id={`${ids}-date`}
              name="occurred_on"
              type="date"
              defaultValue={today}
              max="2100-01-01"
              className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-ink"
            />
            {fieldErrors?.occurred_on ? (
              <p role="alert" className="mt-1.5 text-sm text-negative">
                {fieldErrors.occurred_on}
              </p>
            ) : null}
          </div>

          {accounts.length > 1 ? (
            <SelectField
              id={`${ids}-account`}
              name="account_id"
              label="Account"
              defaultValue={defaultAccountId}
              error={fieldErrors?.account_id}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <input type="hidden" name="account_id" value={defaultAccountId} />
          )}

          <TextAreaField
            id={`${ids}-notes`}
            name="notes"
            label="Note"
            rows={2}
            placeholder="Optional"
            error={fieldErrors?.notes}
          />
        </div>
      ) : (
        <>
          <input type="hidden" name="occurred_on" value={today} />
          <input type="hidden" name="account_id" value={defaultAccountId} />
          <button
            type="button"
            onClick={() => setShowDetail(true)}
            className="text-sm text-accent underline underline-offset-4"
          >
            Change date, account or add a note
          </button>
        </>
      )}

      {!state.ok ? (
        <p role="alert" className="text-sm text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton className="flex-1" pendingLabel="Logging…">
          Log it
        </SubmitButton>
      </div>
    </form>
  )
}
