import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/States'
import { pickDefaultAccount, sumAccounts } from '@/features/accounts/derive'
import { listAccounts } from '@/features/accounts/service'
import { headroom, overdraftUsed } from '@/features/analytics/calc'
import { getProfile } from '@/features/profile/service'
import { listCategoriesByRecentUse } from '@/features/categories/service'
import { QuickAdd } from '@/features/transactions/components/QuickAdd'
import { monthTotals } from '@/features/transactions/service'
import { requireUser } from '@/lib/auth'
import { formatMonth, monthOf, today } from '@/lib/dates'
import { ratio } from '@/lib/money'

export const metadata: Metadata = { title: 'Position' }

/**
 * Where you stand, right now.
 *
 * Phase 1 shows only what the ledger can prove: the balance, the overdraft
 * headroom, and this month's flow. The affordability check, the burn rate and
 * the clearance projection need recurring rules and a budget, which are phase 2.
 * Showing them now would mean showing a number with nothing behind it.
 */
export default async function PositionPage() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  const now = today(profile.timezone)
  const month = monthOf(now)

  const [accounts, thisMonth, categoriesOut, categoriesIn] = await Promise.all([
    listAccounts(user.id),
    monthTotals(user.id, month),
    listCategoriesByRecentUse(user.id, 'out'),
    listCategoriesByRecentUse(user.id, 'in'),
  ])

  const position = sumAccounts(accounts)
  const defaultAccount = pickDefaultAccount(accounts)

  if (accounts.length === 0) {
    return (
      <>
        <AppHeader title="Position" />
        <EmptyState
          title="Nothing to show yet"
          body="Add the account you spend from. Once there is an opening balance and an overdraft limit, this screen can tell you where you stand."
          action={
            <Link href="/money/accounts">
              <Button>Add an account</Button>
            </Link>
          }
        />
      </>
    )
  }

  const used = overdraftUsed(position.balanceMinor)
  const available = headroom(position.balanceMinor, position.overdraftLimitMinor)
  const usedRatio =
    position.overdraftLimitMinor > 0 ? ratio(used, position.overdraftLimitMinor) : null

  return (
    <>
      <AppHeader title="Position" subtitle={`${formatMonth(month)} so far`} />

      <div className="space-y-4 px-4">
        <Card className="p-5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Across {accounts.length} account{accounts.length === 1 ? '' : 's'}
          </p>
          <p className="mt-1">
            <Money
              minor={position.balanceMinor}
              calculated
              source="Every account's opening balance plus every transaction against it"
              className="text-4xl font-semibold"
            />
          </p>

          {position.overdraftLimitMinor > 0 ? (
            <div className="mt-5 space-y-3">
              <Meter
                value={usedRatio}
                tone={usedRatio !== null && usedRatio > 0.75 ? 'negative' : 'warn'}
                label="Overdraft used"
                detail={
                  <>
                    <Money minor={used} tone="neutral" compactZeros /> of{' '}
                    <Money minor={position.overdraftLimitMinor} tone="neutral" compactZeros />
                  </>
                }
              />
              <p className="text-sm text-ink-muted">
                Headroom before the limit:{' '}
                <Money
                  minor={available}
                  tone={available > 0 ? 'positive' : 'negative'}
                  calculated
                  source="Balance plus the arranged overdraft limit"
                />
              </p>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title={`${formatMonth(month)} so far`}
            hint="Recorded transactions only. Nothing here is a forecast."
          />
          <dl className="grid grid-cols-3 gap-3 p-4">
            <div>
              <dt className="text-xs text-ink-muted">In</dt>
              <dd className="mt-0.5">
                <Money minor={thisMonth.inMinor} tone="positive" compactZeros />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Out</dt>
              <dd className="mt-0.5">
                <Money minor={thisMonth.outMinor} tone="negative" compactZeros />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Net</dt>
              <dd className="mt-0.5">
                <Money
                  minor={thisMonth.inMinor - thisMonth.outMinor}
                  signed
                  compactZeros
                  calculated
                  source="This month's income minus this month's spending"
                />
              </dd>
            </div>
          </dl>
          {thisMonth.fixedOutMinor > 0 ? (
            <p className="px-4 pb-4 text-xs text-ink-muted">
              Of that, <Money minor={thisMonth.fixedOutMinor} tone="neutral" compactZeros /> went on
              fixed costs.
            </p>
          ) : null}
        </Card>

        <Card className="p-4">
          <p className="text-sm text-ink-muted">
            Burn rate, runway, the affordability check and a clearance date need recurring rules and
            a monthly budget behind them. Those arrive in the next phase — until then this screen
            shows only what the ledger can prove.
          </p>
        </Card>
      </div>

      {defaultAccount ? (
        <QuickAdd
          accounts={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            currency: account.currency,
          }))}
          defaultAccountId={defaultAccount.id}
          categoriesOut={categoriesOut}
          categoriesIn={categoriesIn}
          today={now}
        />
      ) : null}
    </>
  )
}
