import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { Money } from '@/components/ui/Money'
import { EmptyState } from '@/components/ui/States'
import { pickDefaultAccount } from '@/features/accounts/derive'
import { listAccounts } from '@/features/accounts/service'
import { listCategoriesByRecentUse } from '@/features/categories/service'
import { AffordabilityChecker } from '@/features/position/components/AffordabilityChecker'
import { ForecastPanel } from '@/features/position/components/ForecastPanel'
import { getPositionView } from '@/features/position/service'
import { getProfile } from '@/features/profile/service'
import { QuickAdd } from '@/features/transactions/components/QuickAdd'
import { requireUser } from '@/lib/auth'
import { formatMonth, monthOf, today } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export const metadata: Metadata = { title: 'Position' }

/**
 * Where you stand, right now.
 *
 * Answers the three questions from the brief in the order they get asked: can I
 * spend this, did the month go the way I planned, and what is coming. Every
 * calculated figure is marked as calculated and can say what produced it; every
 * one that the data cannot support says so instead of guessing.
 */
export default async function PositionPage() {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  const now = today(profile.timezone)
  const month = monthOf(now)

  const [view, accounts, categoriesOut, categoriesIn] = await Promise.all([
    getPositionView(user.id, now),
    listAccounts(user.id),
    listCategoriesByRecentUse(user.id, 'out'),
    listCategoriesByRecentUse(user.id, 'in'),
  ])

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

  const { summary } = view
  const defaultAccount = pickDefaultAccount(accounts)

  return (
    <>
      <AppHeader title="Position" subtitle={formatMonth(month)} />

      <div className="space-y-4 px-4">
        {/* ---------------------------------------------------------- hero */}
        <Card className="p-5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Across {view.accountCount} account{view.accountCount === 1 ? '' : 's'}
          </p>
          <p className="mt-1">
            <Money
              minor={summary.balanceMinor}
              calculated
              source="Every account's opening balance plus every transaction against it"
              className="text-4xl font-semibold"
            />
          </p>

          {summary.overdraftLimitMinor > 0 ? (
            <div className="mt-5 space-y-2">
              <Meter
                value={summary.overdraftRatio}
                tone={
                  summary.overdraftRatio !== null && summary.overdraftRatio > 0.75
                    ? 'negative'
                    : 'warn'
                }
                label="Overdraft used"
                detail={
                  <>
                    <Money minor={summary.overdraftUsedMinor} tone="neutral" compactZeros /> of{' '}
                    <Money minor={summary.overdraftLimitMinor} tone="neutral" compactZeros />
                  </>
                }
              />
              <p className="text-sm text-ink-muted">
                Headroom:{' '}
                <Money
                  minor={summary.headroomMinor}
                  tone={summary.headroomMinor > 0 ? 'positive' : 'negative'}
                  calculated
                  source="Balance plus the arranged overdraft limit"
                />
                {summary.runwayDays !== null ? (
                  <>
                    {' · '}
                    <span
                      className="calculated tabular"
                      title={`Headroom divided by ${formatMoney(
                        Math.round(summary.burnPerDay ?? 0),
                      )} a day, your average over the last ${view.burnWindowDays} days`}
                    >
                      {summary.runwayDays} {summary.runwayDays === 1 ? 'day' : 'days'}
                    </span>{' '}
                    at your current rate
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
        </Card>

        {/* ------------------------------------------------- affordability */}
        <Card className="p-4">
          <AffordabilityChecker summary={summary} />
        </Card>

        {/* ------------------------------------------------------ the plan */}
        <Card>
          <CardHeader
            title="The month, as planned"
            hint="From your recurring rules and this month's budgets — not from what has happened yet."
            action={
              <Link
                href="/money/recurring"
                className="text-sm text-accent underline underline-offset-4"
              >
                Edit
              </Link>
            }
          />

          {!view.hasCommitments && !view.hasBudget ? (
            <div className="px-4 pt-2 pb-4">
              <p className="text-sm text-ink-muted">
                There is no plan behind this yet. Add your wages and your rent as recurring rules,
                then set a budget for the categories you actually choose to spend on. Until then
                there is no surplus to work out, and this screen will not invent one.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/money/recurring">
                  <Button variant="secondary">Recurring rules</Button>
                </Link>
                <Link href="/money/budgets">
                  <Button variant="secondary">Budgets</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <dl className="divide-y divide-border border-t border-border">
                <FlowRow label="Income" minor={summary.incomeMinor} tone="positive" />
                <FlowRow label="Fixed costs" minor={-summary.fixedCostsMinor} />
                <FlowRow label="Subscriptions" minor={-summary.subscriptionsMinor} />
                <FlowRow label="Day-to-day budget" minor={-summary.variableBudgetMinor} />
                <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <dt className="text-sm font-semibold text-ink">Surplus</dt>
                  <dd>
                    <Money
                      minor={summary.surplusMinor}
                      signed
                      calculated
                      source="Income less fixed costs, subscriptions and your day-to-day budget"
                      className="text-lg font-semibold"
                    />
                  </dd>
                </div>
              </dl>

              <div className="px-4 pt-3 pb-4">
                {summary.clearanceMonth ? (
                  <p className="text-sm text-ink-muted">
                    At that rate the overdraft clears in{' '}
                    <span className="calculated font-medium text-ink" title="Overdraft used divided by the monthly surplus, rounded up">
                      {formatMonth(summary.clearanceMonth)}
                    </span>{' '}
                    — {summary.monthsToClear}{' '}
                    {summary.monthsToClear === 1 ? 'month' : 'months'} away.
                  </p>
                ) : summary.clearanceBlockedBy === 'nothing-to-clear' ? (
                  <p className="text-sm text-positive">
                    Nothing to clear — you are not using the overdraft.
                  </p>
                ) : (
                  <p className="text-sm text-negative">
                    No clearance date: the plan does not leave a surplus, so there is nothing to
                    put towards the overdraft. A date worked out from a negative surplus would be
                    wrong in the direction that feels good, so there isn't one.
                  </p>
                )}
              </div>
            </>
          )}
        </Card>

        {/* ------------------------------------------------------ forecast */}
        {view.forecast.length > 0 ? (
          <Card>
            <CardHeader
              title="Coming up"
              hint={
                view.forecastTotals.dueCount > 0
                  ? `${view.forecastTotals.dueCount} payment${
                      view.forecastTotals.dueCount === 1 ? '' : 's'
                    } past due and not logged.`
                  : 'This month and next, from your recurring rules.'
              }
            />
            <div className="mt-2 border-t border-border">
              <ForecastPanel forecast={view.forecast} today={now} />
            </div>
          </Card>
        ) : null}

        <p className="pb-2 text-center text-xs text-ink-faint">
          Dotted underlines mark figures PWOS worked out. Everything else is something you
          recorded. Nothing here is financial advice.
        </p>
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

function FlowRow({
  label,
  minor,
  tone,
}: {
  label: string
  minor: number
  tone?: 'positive' | 'negative'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd>
        <Money minor={minor} tone={tone ?? 'auto'} compactZeros />
      </dd>
    </div>
  )
}
