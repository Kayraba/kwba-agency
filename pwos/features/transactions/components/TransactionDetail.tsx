'use client'

import { useActionState, useEffect, useId, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Chip, Tag } from '@/components/ui/Chip'
import { MoneyField, SelectField, TextAreaField } from '@/components/ui/Field'
import { Money } from '@/components/ui/Money'
import { Sheet } from '@/components/ui/Sheet'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDayLong } from '@/lib/dates'
import type { CategoryRow } from '@/lib/db.types'
import { formatMoney } from '@/lib/money'
import { idle, type ActionResult } from '@/lib/result'

import {
  correctTransactionAction,
  unvoidTransactionAction,
  voidTransactionAction,
} from '../actions'
import type { TransactionWithRefs } from '../service'
import type { QuickAddAccount } from './QuickAdd'

export interface TransactionDetailProps {
  transaction: TransactionWithRefs | null
  accounts: QuickAddAccount[]
  categoriesOut: CategoryRow[]
  categoriesIn: CategoryRow[]
  today: string
  onClose: () => void
}

/**
 * What you can do to a row that is already written: void it, or correct it.
 *
 * There is no edit. The amount, date, direction and account of a settled row are
 * frozen in the database, so "correct" means write a replacement and void the
 * original — both stay in the history, linked.
 */
export function TransactionDetail({
  transaction,
  accounts,
  categoriesOut,
  categoriesIn,
  today,
  onClose,
}: TransactionDetailProps) {
  const [mode, setMode] = useState<'view' | 'correct'>('view')

  useEffect(() => {
    if (transaction) setMode('view')
  }, [transaction])

  return (
    <Sheet open={transaction !== null} onClose={onClose} title="Transaction">
      {transaction ? (
        mode === 'correct' ? (
          <CorrectForm
            transaction={transaction}
            accounts={accounts}
            categories={transaction.direction === 'out' ? categoriesOut : categoriesIn}
            today={today}
            onCancel={() => setMode('view')}
            onDone={onClose}
          />
        ) : (
          <ViewPanel
            transaction={transaction}
            onCorrect={() => setMode('correct')}
            onDone={onClose}
          />
        )
      ) : null}
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm text-ink">{value}</dd>
    </div>
  )
}

function ViewPanel({
  transaction,
  onCorrect,
  onDone,
}: {
  transaction: TransactionWithRefs
  onCorrect: () => void
  onDone: () => void
}) {
  const [voidState, voidAction] = useActionState<ActionResult, FormData>(
    voidTransactionAction,
    idle,
  )
  const [restoreState, restoreAction] = useActionState<ActionResult, FormData>(
    unvoidTransactionAction,
    idle,
  )
  const state = transaction.is_void ? restoreState : voidState

  useEffect(() => {
    if (state.ok && state.message) onDone()
  }, [state, onDone])

  return (
    <div>
      <div className="mb-4 text-center">
        <Money
          minor={transaction.direction === 'in' ? transaction.amount_minor : -transaction.amount_minor}
          currency={transaction.currency}
          signed
          className="text-3xl font-semibold"
        />
        {transaction.is_void ? (
          <p className="mt-2">
            <Tag tone="warn">Voided — not counted in any total</Tag>
          </p>
        ) : null}
      </div>

      <dl className="divide-y divide-border border-y border-border">
        <Row label="Date" value={formatDayLong(transaction.occurred_on)} />
        <Row label="Category" value={transaction.category?.name ?? 'Uncategorised'} />
        <Row label="Account" value={transaction.account?.name ?? '—'} />
        {transaction.merchant ? <Row label="Merchant" value={transaction.merchant} /> : null}
        {transaction.notes ? <Row label="Note" value={transaction.notes} /> : null}
        <Row
          label="Entered"
          value={
            transaction.source === 'correction'
              ? 'As a correction'
              : transaction.source === 'csv_import'
                ? 'By import'
                : transaction.source === 'recurring'
                  ? 'From a recurring rule'
                  : 'By hand'
          }
        />
      </dl>

      {!state.ok ? (
        <p role="alert" className="mt-3 text-sm text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        {transaction.is_void ? (
          <form action={restoreAction}>
            <input type="hidden" name="id" value={transaction.id} />
            <SubmitButton size="lg" variant="secondary" pendingLabel="Restoring…">
              Restore this transaction
            </SubmitButton>
          </form>
        ) : (
          <>
            <Button size="lg" variant="secondary" onClick={onCorrect}>
              Correct it
            </Button>
            <form action={voidAction}>
              <input type="hidden" name="id" value={transaction.id} />
              <SubmitButton size="lg" variant="danger" pendingLabel="Voiding…">
                Void it
              </SubmitButton>
            </form>
            <p className="pt-1 text-center text-xs text-ink-muted">
              The ledger is append-only. Voiding keeps the row and stops it counting; correcting
              writes a replacement and links the two.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function CorrectForm({
  transaction,
  accounts,
  categories,
  today,
  onCancel,
  onDone,
}: {
  transaction: TransactionWithRefs
  accounts: QuickAddAccount[]
  categories: CategoryRow[]
  today: string
  onCancel: () => void
  onDone: () => void
}) {
  const [state, action] = useActionState<ActionResult, FormData>(correctTransactionAction, idle)
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? '')
  const ids = useId()
  const fieldErrors = state.ok ? undefined : state.fieldErrors

  useEffect(() => {
    if (state.ok && state.message) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="original_id" value={transaction.id} />
      <input type="hidden" name="direction" value={transaction.direction} />
      <input type="hidden" name="category_id" value={categoryId} />

      <p className="rounded-xl bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
        Replacing {formatMoney(transaction.amount_minor, transaction.currency)} on{' '}
        {formatDayLong(transaction.occurred_on)}. The original stays in the history, voided and
        linked to this one.
      </p>

      <MoneyField
        id={`${ids}-amount`}
        name="amount"
        label="Corrected amount"
        defaultValue={formatMoney(transaction.amount_minor, transaction.currency, {
          symbol: false,
        }).replace(/,/g, '')}
        error={fieldErrors?.amount}
        autoFocus
        required
      />

      <div>
        <label htmlFor={`${ids}-date`} className="mb-1.5 block text-sm font-medium text-ink">
          Date
        </label>
        <input
          id={`${ids}-date`}
          name="occurred_on"
          type="date"
          defaultValue={transaction.occurred_on}
          max="2100-01-01"
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-base text-ink"
        />
        {fieldErrors?.occurred_on ? (
          <p role="alert" className="mt-1.5 text-sm text-negative">
            {fieldErrors.occurred_on}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Category</legend>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {categories.map((category) => (
            <Chip
              key={category.id}
              tone={transaction.direction}
              selected={categoryId === category.id}
              onClick={() => setCategoryId(categoryId === category.id ? '' : category.id)}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </fieldset>

      <SelectField
        id={`${ids}-account`}
        name="account_id"
        label="Account"
        defaultValue={transaction.account_id}
        error={fieldErrors?.account_id}
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        id={`${ids}-notes`}
        name="notes"
        label="Note"
        rows={2}
        defaultValue={transaction.notes ?? ''}
        placeholder="Optional"
        error={fieldErrors?.notes}
      />

      <input type="hidden" name="merchant" value={transaction.merchant ?? ''} />
      <input type="hidden" name="_today" value={today} />

      {!state.ok ? (
        <p role="alert" className="text-sm text-negative">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <SubmitButton className="flex-1" pendingLabel="Correcting…">
          Save correction
        </SubmitButton>
      </div>
    </form>
  )
}
