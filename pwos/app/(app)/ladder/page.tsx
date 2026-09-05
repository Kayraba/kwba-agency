import type { Metadata } from 'next'

import { NotYet } from '@/components/shell/NotYet'

export const metadata: Metadata = { title: 'Ladder' }

export default function LadderPage() {
  return (
    <NotYet
      title="Ladder"
      phase="Phase 3"
      body="Goals in priority order, with the whole monthly surplus going to the first unfunded one and a projected completion month for each. The allocation function and its tests are already written in features/analytics/calc.ts; the ladder needs a monthly surplus behind it, which means phase 2 first."
    />
  )
}
