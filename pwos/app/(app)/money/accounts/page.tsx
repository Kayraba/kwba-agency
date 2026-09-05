import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { AccountsPanel } from '@/features/accounts/components/AccountsPanel'
import { listAccounts } from '@/features/accounts/service'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Accounts' }

export default async function AccountsPage() {
  const user = await requireUser()
  const accounts = await listAccounts(user.id, { includeArchived: true })

  return (
    <>
      <AppHeader
        title="Accounts"
        subtitle="Balances are worked out from the ledger, not stored."
        action={
          <Link href="/money" className="text-sm text-accent underline underline-offset-4">
            Back
          </Link>
        }
      />
      <AccountsPanel accounts={accounts} />
    </>
  )
}
