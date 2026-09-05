import type { Metadata } from 'next'
import Link from 'next/link'

import { AppHeader } from '@/components/shell/AppHeader'
import { CategoriesPanel } from '@/features/categories/components/CategoriesPanel'
import { listCategories } from '@/features/categories/service'
import { requireUser } from '@/lib/auth'

export const metadata: Metadata = { title: 'Categories' }

export default async function CategoriesPage() {
  const user = await requireUser()
  const categories = await listCategories(user.id)

  return (
    <>
      <AppHeader
        title="Categories"
        subtitle="The chips you tap when logging. Keep the list short enough to scan."
        action={
          <Link href="/more" className="text-sm text-accent underline underline-offset-4">
            Back
          </Link>
        }
      />
      <CategoriesPanel categories={categories} />
    </>
  )
}
