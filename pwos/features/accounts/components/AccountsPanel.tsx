'use client'

import { useActionState, useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Chip'
import { Money } from '@/components/ui/Money'
import { Meter } from '@/components/ui/Meter'
import { Sheet } from '@/components/ui/Sheet'
import { EmptyState } from '@/components/ui/States'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { idle, type ActionResult } from '@/lib/result'

import { deleteAccountAction, setArchivedAction } from '../actions'
import { ACCOUNT_KIND_LABELS } from '../schema'
import type { AccountWithBalance } from '../derive'
import { AccountForm } from './AccountForm'

export function AccountsPanel({ accounts }: { accounts: AccountWithBalance[] }) {
  const [sheet, setSheet] = useState<
    { mode: 'new' } | { mode: 'edit'; account: AccountWithBalance } | null
  >(null)

  const open = accounts.filter((account) => !account.is_archived)
  const archived = accounts.filter((account) => account.is_archived)

  return (
    <>
      <div className="px-4">
        <Button size="lg" onClick={() => setSheet({ mode: 'new' })}>
          Add an account
        </Button>
      </div>

      {open.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          body="Start with the one you actually spend from. You can add savings, a credit card and the rest later."
        />
      ) : (
        <ul className="mt-4 space-y-3 px-4">
          {open.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onEdit={() => setSheet({ mode: 'edit', account })}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <section className="mt-8 px-4">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">Archived</h2>
          <ul className="space-y-3">
            {archived.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onEdit={() => setSheet({ mode: 'edit', account })}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <Sheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.mode === 'edit' ? 'Edit account' : 'Add an account'}
      >
        {sheet ? (
          <AccountForm
            {...(sheet.mode === 'edit' ? { account: sheet.account } : {})}
            onDone={() => setSheet(null)}
            onCancel={() => setSheet(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function AccountCard({
  account,
  onEdit,
}: {
  account: AccountWithBalance
  onEdit: () => void
}) {
  const [archiveState, archive] = useActionState<ActionResult, FormData>(
    setArchivedAction,
    idle,
  )
  const [deleteState, remove] = useActionState<ActionResult, FormData>(deleteAccountAction, idle)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (deleteState.ok && deleteState.message) setConfirming(false)
  }, [deleteState])

  const hasOverdraft = account.overdraft_limit_minor > 0
  const used = account.balance_minor < 0 ? -account.balance_minor : 0

  return (
    <li className="rounded-[var(--radius-card)] border border-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{account.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>{ACCOUNT_KIND_LABELS[account.kind]}</span>
            {account.institution ? <span>· {account.institution}</span> : null}
            {account.is_archived ? <Tag tone="warn">Archived</Tag> : null}
          </p>
        </div>
        <Money
          minor={account.balance_minor}
          currency={account.currency}
          calculated
          source="Opening balance plus every transaction on this account"
          className="text-lg font-semibold"
        />
      </div>

      {hasOverdraft ? (
        <div className="mt-3">
          <Meter
            value={used / account.overdraft_limit_minor}
            tone={used / account.overdraft_limit_minor > 0.75 ? 'negative' : 'warn'}
            label="Overdraft used"
            detail={
              <>
                <Money minor={used} currency={account.currency} tone="neutral" compactZeros /> of{' '}
                <Money
                  minor={account.overdraft_limit_minor}
                  currency={account.currency}
                  tone="neutral"
                  compactZeros
                />
              </>
            }
          />
        </div>
      ) : null}

      {!archiveState.ok ? (
        <p role="alert" className="mt-2 text-sm text-negative">
          {archiveState.message}
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
        <form action={archive}>
          <input type="hidden" name="id" value={account.id} />
          <input type="hidden" name="archived" value={String(!account.is_archived)} />
          <SubmitButton variant="ghost" pendingLabel="…">
            {account.is_archived ? 'Restore' : 'Archive'}
          </SubmitButton>
        </form>
        {confirming ? (
          <form action={remove} className="flex gap-2">
            <input type="hidden" name="id" value={account.id} />
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
