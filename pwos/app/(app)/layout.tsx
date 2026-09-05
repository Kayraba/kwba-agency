import { BottomNav } from '@/components/shell/BottomNav'
import { getProfile } from '@/features/profile/service'
import { requireUser } from '@/lib/auth'

/**
 * The protected shell.
 *
 * `requireUser()` runs on the server for every page underneath this layout. The
 * proxy redirect is a convenience; this is the check that matters, and RLS
 * is the one behind it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  await getProfile(user.id)

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface pb-[calc(var(--spacing-nav)+1rem)]">
      {children}
      <BottomNav />
    </div>
  )
}
