import { describe, expect, it } from 'vitest'

import { pickDefaultAccount, sumAccounts, type AccountWithBalance } from './derive'

const account = (patch: Partial<AccountWithBalance>): AccountWithBalance => ({
  id: patch.id ?? 'a',
  user_id: 'u',
  name: patch.name ?? 'Account',
  institution: null,
  kind: patch.kind ?? 'current',
  currency: 'GBP',
  opening_balance_minor: 0,
  overdraft_limit_minor: patch.overdraft_limit_minor ?? 0,
  is_archived: patch.is_archived ?? false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  balance_minor: patch.balance_minor ?? 0,
  headroom_minor:
    patch.headroom_minor ?? (patch.balance_minor ?? 0) + (patch.overdraft_limit_minor ?? 0),
  ...patch,
})

describe('pickDefaultAccount', () => {
  it('prefers a current account over anything else', () => {
    const chosen = pickDefaultAccount([
      account({ id: 'savings', kind: 'savings' }),
      account({ id: 'current', kind: 'current' }),
    ])
    expect(chosen?.id).toBe('current')
  })

  it('falls back to the first open account when there is no current one', () => {
    const chosen = pickDefaultAccount([
      account({ id: 'cash', kind: 'cash' }),
      account({ id: 'savings', kind: 'savings' }),
    ])
    expect(chosen?.id).toBe('cash')
  })

  it('never picks an archived account, even a current one', () => {
    const chosen = pickDefaultAccount([
      account({ id: 'old', kind: 'current', is_archived: true }),
      account({ id: 'cash', kind: 'cash' }),
    ])
    expect(chosen?.id).toBe('cash')
  })

  it('is null when everything is archived, or there is nothing', () => {
    expect(pickDefaultAccount([account({ is_archived: true })])).toBeNull()
    expect(pickDefaultAccount([])).toBeNull()
  })
})

describe('sumAccounts', () => {
  it('adds up balances, limits and headroom', () => {
    const totals = sumAccounts([
      account({ id: 'a', balance_minor: -42_000, overdraft_limit_minor: 100_000 }),
      account({ id: 'b', kind: 'savings', balance_minor: 25_000 }),
    ])

    expect(totals).toEqual({
      balanceMinor: -17_000,
      overdraftLimitMinor: 100_000,
      headroomMinor: 83_000,
    })
  })

  it('leaves archived accounts out', () => {
    const totals = sumAccounts([
      account({ id: 'a', balance_minor: 10_000 }),
      account({ id: 'b', balance_minor: 500_000, is_archived: true }),
    ])
    expect(totals.balanceMinor).toBe(10_000)
  })

  it('is all zeros for no accounts', () => {
    expect(sumAccounts([])).toEqual({
      balanceMinor: 0,
      overdraftLimitMinor: 0,
      headroomMinor: 0,
    })
  })
})
