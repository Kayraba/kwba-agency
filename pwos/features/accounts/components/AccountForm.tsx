'use client'

import { useActionState, useEffect, useId } from 'react'

import { Button } from '@/components/ui/Button'
import { Field, MoneyField, SelectField } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatMoney } from '@/lib/money'
import { idle, type ActionResult } from '@/lib/result'

import { createAccountAction, updateAccountAction } from '../actions'
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS } from '../schema'
import type { AccountWithBalance } from '../derive'

/** Minor units back into something the money input will accept: 1250 -> "12.50". */
function editable(minor: number, currency: string): string {
  return formatMoney(minor, currency, { symbol: false }).replace(/,/g, '')
}

export function AccountForm({
  account,
  onDone,
  onCancel,
}: {
  account?: AccountWithBalance
  onDone: () => void
  onCancel: () => void
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    account ? updateAccountAction : createAccountAction,
    idle,
  )
  const ids = useId()
  const fieldErrors = state.ok ? undefined : state.fieldErrors

  useEffect(() => {
    if (state.ok && state.message) onDone()
  }, [state, onDone])

  return (
    <form action={action} className="space-y-4">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}

      <Field
        id={`${ids}-name`}
        name="name"
        label="Name"
        defaultValue={account?.name ?? ''}
        placeholder="Current account"
        error={fieldErrors?.name}
        autoFocus
        required
      />

      <Field
        id={`${ids}-institution`}
        name="institution"
        label="Bank or provider"
        defaultValue={account?.institution ?? ''}
        placeholder="Optional"
        error={fieldErrors?.institution}
      />

      <SelectField
        id={`${ids}-kind`}
        name="kind"
        label="Kind"
        defaultValue={account?.kind ?? 'current'}
        error={fieldErrors?.kind}
      >
        {ACCOUNT_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {ACCOUNT_KIND_LABELS[kind]}
          </option>
        ))}
      </SelectField>

      <MoneyField
        id={`${ids}-opening`}
        name="opening_balance"
        label="Opening balance"
        hint="What was in it the day you started tracking. Negative if you were overdrawn — type -420."
        defaultValue={
          account ? editable(account.opening_balance_minor, account.currency) : ''
        }
        error={fieldErrors?.opening_balance_minor}
      />

      <MoneyField
        id={`${ids}-overdraft`}
        name="overdraft_limit"
        label="Arranged overdraft limit"
        hint="Leave blank if you do not have one. This is what the headroom figure is measured against."
        defaultValue={
          account ? editable(account.overdraft_limit_minor, account.currency) : ''
        }
        error={fieldErrors?.overdraft_limit_minor}
      />

      <input type="hidden" name="currency" value={account?.currency ?? 'GBP'} />

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
          {account ? 'Save account' : 'Add account'}
        </SubmitButton>
      </div>
    </form>
  )
}
