import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { BudgetsPanel } from '@/features/budgets/components/BudgetsPanel'
import { budgetTotals, buildBudgetLines, variableBudgetTotal } from '@/features/budgets/derive'
import { listBudgets, spendByCategory } from '@/features/budgets/service'
import { listCategories } from '@/features/categories/service'
import { getProfile } from '@/features/profile/service'
import { requireUser } from '@/lib/auth'
import { monthOf, today } from '@/lib/dates'

export const metadata: Metadata = { title: 'Budgets' }

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const user = await requireUser()
  const profile = await getProfile(user.id)
  const { month: requested } = await searchParams

  const month =
    requested && /^\d{4}-\d{2}$/.test(requested) ? requested : monthOf(today(profile.timezone))

  const [categories, budgets, spend] = await Promise.all([
    listCategories(user.id),
    listBudgets(user.id, month),
    spendByCategory(user.id, month),
  ])

  const lines = buildBudgetLines(categories, budgets, spend)

  return (
    <>
      <AppHeader
        title="Budgets"
        subtitle="What you meant to spend, against what you did."
        action={
          <Link href="/position" className="text-sm text-accent underline underline-offset-4">
            Back
          </Link>
        }
      />
      <BudgetsPanel
        month={month}
        lines={lines}
        totals={budgetTotals(lines)}
        variableBudgetMinor={variableBudgetTotal(lines)}
      />
    </>
  )
}
