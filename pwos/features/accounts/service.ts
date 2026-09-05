import 'server-only'

import type { AccountBalanceRow, AccountRow } from '@/lib/db.types'
import { createClient } from '@/lib/supabase/server'

import type { AccountWithBalance } from './derive'
import type { AccountInput } from './schema'

export class AccountInUseError extends Error {
  constructor() {
    super('That account has transactions against it')
    this.name = 'AccountInUseError'
  }
}

/**
 * Accounts with their derived balances.
 *
 * Balances come from the `account_balances` view, which sums the ledger. There
 * is no stored balance column to drift, so the number on the screen and the
 * number the ledger implies cannot disagree.
 */
export async function listAccounts(
  userId: string,
  { includeArchived = false } = {},
): Promise<AccountWithBalance[]> {
  const supabase = await createClient()

  const accountsQuery = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_archived', { ascending: true })
    .order('created_at', { ascending: true })

  const [{ data: accounts, error }, { data: balances, error: balanceError }] = await Promise.all([
    includeArchived ? accountsQuery : accountsQuery.eq('is_archived', false),
    supabase.from('account_balances').select('*').eq('user_id', userId),
  ])

  if (error) throw new Error(`Could not load your accounts: ${error.message}`)
  if (balanceError) throw new Error(`Could not load your balances: ${balanceError.message}`)

  const byAccount = new Map<string, AccountBalanceRow>(
    (balances ?? []).map((row) => [row.account_id, row]),
  )

  return (accounts ?? []).map((account) => {
    const balance = byAccount.get(account.id)
    return {
      ...account,
      balance_minor: balance?.balance_minor ?? account.opening_balance_minor,
      headroom_minor:
        balance?.headroom_minor ??
        account.opening_balance_minor + account.overdraft_limit_minor,
    }
  })
}

export async function getAccount(userId: string, id: string): Promise<AccountWithBalance | null> {
  const accounts = await listAccounts(userId, { includeArchived: true })
  return accounts.find((account) => account.id === id) ?? null
}

export async function createAccount(userId: string, input: AccountInput): Promise<AccountRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single<AccountRow>()

  if (error) throw new Error(`Could not create the account: ${error.message}`)
  return data
}

/**
 * Update an account.
 *
 * `opening_balance_minor` is editable — it is a starting position, not a ledger
 * row, and getting it wrong on day one is the most likely mistake there is.
 * Every other balance is derived, so correcting it here corrects everything.
 */
export async function updateAccount(
  userId: string,
  id: string,
  input: AccountInput,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accounts')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not save the account: ${error.message}`)
}

export async function setArchived(
  userId: string,
  id: string,
  isArchived: boolean,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('accounts')
    .update({ is_archived: isArchived })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not archive the account: ${error.message}`)
}

/**
 * Delete an account.
 *
 * The ledger references accounts ON DELETE RESTRICT, so an account with history
 * cannot be removed. That is the right outcome — deleting it would orphan real
 * transactions — and the caller is expected to offer archiving instead.
 */
export async function deleteAccount(userId: string, id: string): Promise<void> {
  const supabase = await createClient()

  const { count, error: countError } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('account_id', id)

  if (countError) throw new Error(`Could not check the account: ${countError.message}`)
  if ((count ?? 0) > 0) throw new AccountInUseError()

  const { error } = await supabase.from('accounts').delete().eq('id', id).eq('user_id', userId)

  // 23503: foreign key violation. Belt and braces — the count above should have caught it.
  if (error?.code === '23503') throw new AccountInUseError()
  if (error) throw new Error(`Could not delete the account: ${error.message}`)
}
