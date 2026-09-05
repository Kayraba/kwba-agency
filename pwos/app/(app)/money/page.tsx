import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { AppHeader } from '@/components/shell/AppHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState, ListSkeleton } from '@/components/ui/States'
import { pickDefaultAccount } from '@/features/accounts/derive'
import { listAccounts } from '@/features/accounts/service'
import { listCategories, listCategoriesByRecentUse } from '@/features/categories/service'
import { getProfile } from '@/features/profile/service'
import { LedgerFilter } from '@/features/transactions/components/LedgerFilter'
import { QuickAdd } from '@/features/transactions/components/QuickAdd'
import { TransactionList } from '@/features/transactions/components/TransactionList'
import { listMonths, listTransactions } from '@/features/transactions/service'
import { requireUser } from '@/lib/auth'
import { today } from '@/lib/dates'

export const metadata: Metadata = { title: 'Money' }

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; category?: string }>
}) {
  const user = await requireUser()
  const { month, category } = await searchParams
  const profile = await getProfile(user.id)

  const [accounts, categoriesOut, categoriesIn, allCategories, months] = await Promise.all([
    listAccounts(user.id),
    listCategoriesByRecentUse(user.id, 'out'),
    listCategoriesByRecentUse(user.id, 'in'),
    listCategories(user.id),
    listMonths(user.id),
  ])
  const defaultAccount = pickDefaultAccount(accounts)

  if (!defaultAccount) {
    return (
      <>
        <AppHeader title="Money" />
        <EmptyState
          title="Add an account first"
          body="A transaction has to land somewhere. Add the account you actually spend from and the ledger opens up."
          action={
            <Link href="/money/accounts">
              <Button>Add an account</Button>
            </Link>
          }
        />
      </>
    )
  }

  const rows = await listTransactions(user.id, {
    ...(month ? { month } : {}),
    ...(category ? { categoryId: category } : {}),
    includeVoid: true,
  })

  const accountOptions = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
  }))
  const now = today(profile.timezone)

  return (
    <>
      <AppHeader
        title="Money"
        subtitle="Every transaction, newest first."
        action={
          <Link
            href="/money/accounts"
            className="text-sm text-accent underline underline-offset-4"
          >
            Accounts
          </Link>
        }
      />

      <Suspense fallback={<div className="h-24" />}>
        <LedgerFilter months={months} categories={allCategories} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <TransactionList
          rows={rows}
          accounts={accountOptions}
          categoriesOut={categoriesOut}
          categoriesIn={categoriesIn}
          today={now}
          filtered={Boolean(month || category)}
        />
      </Suspense>

      <QuickAdd
        accounts={accountOptions}
        defaultAccountId={defaultAccount.id}
        categoriesOut={categoriesOut}
        categoriesIn={categoriesIn}
        today={now}
      />
    </>
  )
}
