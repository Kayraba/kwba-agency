'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Chip } from '@/components/ui/Chip'
import { formatMonth } from '@/lib/dates'
import type { CategoryRow } from '@/lib/db.types'

/**
 * Month and category filters.
 *
 * State lives in the URL, so a filtered view can be reloaded, shared with
 * yourself on the laptop, or reached from the back button without surprises.
 */
export function LedgerFilter({
  months,
  categories,
}: {
  months: string[]
  categories: CategoryRow[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const month = params.get('month') ?? ''
  const categoryId = params.get('category') ?? ''

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    const query = next.toString()
    startTransition(() => {
      router.replace(query ? `/money?${query}` : '/money', { scroll: false })
    })
  }

  return (
    <div
      className={['space-y-2 px-4 pb-3', pending ? 'opacity-60' : ''].join(' ')}
      aria-busy={pending}
    >
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip selected={month === ''} onClick={() => set('month', '')}>
          All months
        </Chip>
        {months.map((value) => (
          <Chip key={value} selected={month === value} onClick={() => set('month', value)}>
            {formatMonth(value)}
          </Chip>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        <Chip selected={categoryId === ''} onClick={() => set('category', '')}>
          All categories
        </Chip>
        {categories.map((category) => (
          <Chip
            key={category.id}
            tone={category.direction}
            selected={categoryId === category.id}
            onClick={() => set('category', category.id)}
          >
            {category.name}
          </Chip>
        ))}
      </div>
    </div>
  )
}
