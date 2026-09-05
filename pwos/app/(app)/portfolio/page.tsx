import type { Metadata } from 'next'

import { NotYet } from '@/components/shell/NotYet'

export const metadata: Metadata = { title: 'Portfolio' }

export default function PortfolioPage() {
  return (
    <NotYet
      title="Portfolio"
      phase="Phase 4"
      body="Holdings, cost basis and unrealised profit or loss, fed by a Trading 212 CSV import. Prices are entered by hand and stamped with the time they were entered — there is no market data feed, and nothing here will ever project a return."
    />
  )
}
