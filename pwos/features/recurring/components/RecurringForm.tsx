'use client'

import { useActionState, useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field, MoneyField, SelectField } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { CategoryRow, FlowDirection, RecurringRuleRow } from '@/lib/db.types'
import { formatMoney } from '@/lib/money'
import { idle, type ActionResult } from '@/lib/result'

import { createRuleAction, updateRuleAction } from '../actions'
import { FREQUENCIES, FREQUENCY_LABELS, MONTHLY_FAMILY, WEEKDAYS } from '../schema'

export interface RecurringFormProps {
  rule?: RecurringRuleRow
  accounts: { id: string; name: string }[]
  categoriesOut: CategoryRow[]
  categoriesIn: CategoryRow[]
  today: string
  onDone: () => void
  onCancel: () => void
}

export function RecurringForm({
  rule,
  accounts,
  categoriesOut,
  categoriesIn,
  today,
  onDone,
  onCancel,
}: RecurringFormProps) {
  const [state, action] = useActionState<ActionResult, FormData>(
    rule ? updateRuleAction : createRuleAction,
    idle,
  )
  const [direction, setDirection] = useState<FlowDirection>(rule?.direction ?? 'out')
  const [frequency, setFrequency] = useState<string>(rule?.frequency ?? 'monthly')
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '')
  const ids = useId()

  const fieldErrors = state.ok ? undefined : state.fieldErrors
  const categories = direction === 'out' ? categoriesOut : categoriesIn
  const monthly = (MONTHLY_FAMILY as readonly string[]).includes(frequency)

  useEffect(() => {
    if (state.ok && state.message) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
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
            {value === 'out' ? 'Goes out' : 'Comes in'}
          </button>
        ))}
      </div>

      <Field
        id={`${ids}-label`}
        name="label"
        label="What is it"
        defaultValue={rule?.label ?? ''}
        placeholder={direction === 'out' ? 'Rent' : 'Wages'}
        error={fieldErrors?.label}
        autoFocus
        required
      />

      <MoneyField
        id={`${ids}-amount`}
        name="amount"
        label="Amount"
        defaultValue={rule ? formatMoney(rule.amount_minor, 'GBP', { symbol: false }).replace(/,/g, '') : ''}
        error={fieldErrors?.amount}
        required
      />

      <SelectField
        id={`${ids}-frequency`}
        name="frequency"
        label="How often"
        value={frequency}
        onChange={(event) => setFrequency(event.target.value)}
        error={fieldErrors?.frequency}
      >
        {FREQUENCIES.map((value) => (
          <option key={value} value={value}>
            {FREQUENCY_LABELS[value]}
          </option>
        ))}
      </SelectField>

      {monthly ? (
        <Field
          id={`${ids}-dom`}
          name="day_of_month"
          label="Day of the month"
          type="number"
          inputMode="numeric"
          min={1}
          max={31}
          defaultValue={rule?.day_of_month ?? ''}
          hint="Leave blank to use the start date's day. The 31st falls on the 28th in February rather than being skipped."
          error={fieldErrors?.day_of_month}
        />
      ) : (
        <SelectField
          id={`${ids}-dow`}
          name="day_of_week"
          label="Day of the week"
          defaultValue={rule?.day_of_week ?? ''}
          hint="Leave blank to repeat from the start date."
          error={fieldErrors?.day_of_week}
        >
          <option value="">From the start date</option>
          {WEEKDAYS.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </SelectField>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Category</legend>
        {categories.length === 0 ? (
          <p className="text-sm text-ink-muted">No categories on this side yet.</p>
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

      <SelectField
        id={`${ids}-account`}
        name="account_id"
        label="Account"
        defaultValue={rule?.account_id ?? accounts[0]?.id ?? ''}
        error={fieldErrors?.account_id}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${ids}-start`} className="mb-1.5 block text-sm font-medium text-ink">
            First one
          </label>
          <input
            id={`${ids}-start`}
            name="starts_on"
            type="date"
            defaultValue={rule?.starts_on ?? today}
            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-base text-ink"
          />
          {fieldErrors?.starts_on ? (
            <p role="alert" className="mt-1.5 text-sm text-negative">
              {fieldErrors.starts_on}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor={`${ids}-end`} className="mb-1.5 block text-sm font-medium text-ink">
            Last one
          </label>
          <input
            id={`${ids}-end`}
            name="ends_on"
            type="date"
            defaultValue={rule?.ends_on ?? ''}
            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-base text-ink"
          />
          {fieldErrors?.ends_on ? (
            <p role="alert" className="mt-1.5 text-sm text-negative">
              {fieldErrors.ends_on}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-muted">Optional</p>
          )}
        </div>
      </div>

      {!state.ok ? (
        <p role="alert" className="text-sm text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton className="flex-1">{rule ? 'Save rule' : 'Add rule'}</SubmitButton>
      </div>
    </form>
  )
}
