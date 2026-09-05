import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { Card } from '@/components/ui/Card'
import { getProfile } from '@/features/profile/service'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'More' }

const LINKS = [
  { href: '/money/accounts', label: 'Accounts', hint: 'Opening balances and overdraft limits' },
  { href: '/money/categories', label: 'Categories', hint: 'The chips you tap when logging' },
] as const

export default async function MorePage() {
  const user = await requireUser()
  const profile = await getProfile(user.id)

  return (
    <>
      <AppHeader title="More" subtitle={user.email ?? undefined} />

      <div className="space-y-4 px-4">
        <Card>
          <ul className="divide-y divide-border">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-surface-sunken"
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">{link.label}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{link.hint}</span>
                  </span>
                  <span aria-hidden className="text-ink-faint">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-ink">Settings</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Currency</dt>
              <dd className="text-ink">{profile.base_currency}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Timezone</dt>
              <dd className="text-ink">{profile.timezone}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            Changing these needs a settings screen, which is not built yet. Until then they can be
            edited directly in the profiles table.
          </p>
        </Card>

        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="w-full rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3.5 text-sm font-medium text-negative hover:bg-surface-sunken"
          >
            Sign out
          </button>
        </form>

        <p className="pb-4 text-center text-xs text-ink-faint">
          PWOS describes and calculates. It does not give financial advice.
        </p>
      </div>
    </>
  )
}
