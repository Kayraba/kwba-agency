import type { AccountRow } from '@/lib/db.types'

/**
 * Derivations over a list of accounts.
 *
 * Pure, and deliberately outside `service.ts` so the arithmetic can be tested
 * without a database — `service.ts` is `server-only`, which is right for
 * anything that queries and wrong for anything that just adds up.
 */

export interface AccountWithBalance extends AccountRow {
  /** From the account_balances view. Never stored on the account row. */
  balance_minor: number
  headroom_minor: number
}

export interface PositionTotals {
  balanceMinor: number
  overdraftLimitMinor: number
  headroomMinor: number
}

/**
 * The account the quick-add sheet defaults to: the oldest open current account,
 * else the oldest open one. Pure, so a page that already has the list does not
 * fetch it twice.
 */
export function pickDefaultAccount(
  accounts: readonly AccountWithBalance[],
): AccountWithBalance | null {
  const open = accounts.filter((account) => !account.is_archived)
  return open.find((account) => account.kind === 'current') ?? open[0] ?? null
}

/**
 * Every open account's balance and headroom, summed.
 *
 * Archived accounts are left out: they are accounts you have stopped using, and
 * counting a closed savings account towards today's headroom would be a lie.
 */
export function sumAccounts(accounts: readonly AccountWithBalance[]): PositionTotals {
  const empty: PositionTotals = {
    balanceMinor: 0,
    overdraftLimitMinor: 0,
    headroomMinor: 0,
  }

  return accounts
    .filter((account) => !account.is_archived)
    .reduce(
      (acc, account) => ({
        balanceMinor: acc.balanceMinor + account.balance_minor,
        overdraftLimitMinor: acc.overdraftLimitMinor + account.overdraft_limit_minor,
        headroomMinor: acc.headroomMinor + account.headroom_minor,
      }),
      empty,
    )
}
