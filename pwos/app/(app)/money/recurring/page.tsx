import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { listAccounts } from '@/features/accounts/service'
import { listCategories } from '@/features/categories/service'
import { getProfile } from '@/features/profile/service'
import { RecurringPanel } from '@/features/recurring/components/RecurringPanel'
import { listRules } from '@/features/recurring/service'
import { requireUser } from '@/lib/auth'
import { today } from '@/lib/dates'

export const metadata: Metadata = { title: 'Recurring' }

export default async function RecurringPage() {
  const user = await requireUser()
  const profile = await getProfile(user.id)

  const [rules, accounts, categories] = await Promise.all([
    listRules(user.id),
    listAccounts(user.id),
    listCategories(user.id),
  ])

  return (
    <>
      <AppHeader
        title="Recurring"
        subtitle="What happens on a schedule. Forecasts only — nothing reaches the ledger until you log it."
        action={
          <Link href="/position" className="text-sm text-accent underline underline-offset-4">
            Back
          </Link>
        }
      />
      <RecurringPanel
        rules={rules}
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        categoriesOut={categories.filter((category) => category.direction === 'out')}
        categoriesIn={categories.filter((category) => category.direction === 'in')}
        today={today(profile.timezone)}
      />
    </>
  )
}
