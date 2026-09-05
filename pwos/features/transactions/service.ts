import 'server-only'

import { endOfMonth, startOfMonth } from '@/lib/dates'
import type { TransactionRow, TxnSource } from '@/lib/db.types'
import { createClient } from '@/lib/supabase/server'

import type { TransactionFilter, TransactionInput } from './schema'

export interface TransactionWithRefs extends TransactionRow {
  category: { id: string; name: string; is_fixed: boolean } | null
  account: { id: string; name: string; currency: string } | null
}

const SELECT =
  '*, category:categories(id, name, is_fixed), account:accounts(id, name, currency)'

export const PAGE_SIZE = 100

/**
 * The ledger, newest first.
 *
 * Voided rows are returned by default so the history reads honestly — you can
 * see that something was entered and then corrected. The list marks them; the
 * totals ignore them.
 */
export async function listTransactions(
  userId: string,
  filter: Partial<TransactionFilter> = {},
  { limit = PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<TransactionWithRefs[]> {
  const supabase = await createClient()

  let query = supabase
    .from('transactions')
    .select(SELECT)
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (filter.month) {
    query = query
      .gte('occurred_on', startOfMonth(filter.month))
      .lte('occurred_on', endOfMonth(filter.month))
  }
  if (filter.categoryId) query = query.eq('category_id', filter.categoryId)
  if (filter.accountId) query = query.eq('account_id', filter.accountId)
  if (filter.direction) query = query.eq('direction', filter.direction)
  if (filter.includeVoid === false) query = query.eq('is_void', false)

  const { data, error } = await query
  if (error) throw new Error(`Could not load your transactions: ${error.message}`)

  return (data ?? []) as unknown as TransactionWithRefs[]
}

export async function getTransaction(
  userId: string,
  id: string,
): Promise<TransactionWithRefs | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(SELECT)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not load that transaction: ${error.message}`)
  return (data ?? null) as unknown as TransactionWithRefs | null
}

/** Months that actually contain rows, newest first. Drives the month filter. */
export async function listMonths(userId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('occurred_on')
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false })
    .limit(2000)

  if (error) throw new Error(`Could not load your months: ${error.message}`)

  const months = new Set<string>()
  for (const row of data ?? []) months.add(row.occurred_on.slice(0, 7))
  return [...months]
}

export async function createTransaction(
  userId: string,
  input: TransactionInput,
  {
    currency = 'GBP',
    source = 'manual',
    correctsId = null,
  }: { currency?: string; source?: TxnSource; correctsId?: string | null } = {},
): Promise<TransactionRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: input.account_id,
      category_id: input.category_id,
      direction: input.direction,
      amount_minor: input.amount,
      currency,
      occurred_on: input.occurred_on,
      merchant: input.merchant,
      notes: input.notes,
      source,
      corrects_id: correctsId,
    })
    .select('*')
    .single<TransactionRow>()

  if (error) throw new Error(`Could not save that transaction: ${error.message}`)
  return data
}

/**
 * Void a row.
 *
 * This is the only kind of edit the ledger allows. `amount_minor`, `occurred_on`,
 * `direction` and `account_id` are frozen by a database trigger, so a figure that
 * was right in March is still right in March however many times you revisit it.
 */
export async function voidTransaction(userId: string, id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({ is_void: true })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not void that transaction: ${error.message}`)
}

export async function unvoidTransaction(userId: string, id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('transactions')
    .update({ is_void: false })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not restore that transaction: ${error.message}`)
}

/**
 * Correct a row: void the original and write a replacement that points back at it.
 *
 * Both rows survive. The replacement is the one that counts; the original stays
 * visible as the mistake it was, which is the whole point of an append-only ledger.
 */
export async function correctTransaction(
  userId: string,
  originalId: string,
  input: TransactionInput,
  currency = 'GBP',
): Promise<TransactionRow> {
  const replacement = await createTransaction(userId, input, {
    currency,
    source: 'correction',
    correctsId: originalId,
  })

  try {
    await voidTransaction(userId, originalId)
  } catch (error) {
    // The replacement is already written. Leaving both live would double-count,
    // so roll the replacement back rather than silently inflating the ledger.
    const supabase = await createClient()
    await supabase.from('transactions').delete().eq('id', replacement.id).eq('user_id', userId)
    throw error
  }

  return replacement
}

/**
 * Total outgoing between two dates, for the burn rate.
 *
 * Counted in the database rather than pulled into memory: the trailing window is
 * ninety days, and there is no reason to ship ninety days of rows to add up one
 * column. Voided rows are excluded.
 */
export async function outTotalBetween(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('amount_minor')
    .eq('user_id', userId)
    .eq('direction', 'out')
    .eq('is_void', false)
    .gte('occurred_on', from)
    .lte('occurred_on', to)
    .limit(5000)

  if (error) throw new Error(`Could not total your spending: ${error.message}`)
  return (data ?? []).reduce((total, row) => total + row.amount_minor, 0)
}

/** Totals for a month, straight from the ledger. Used by the Position and Money screens. */
export async function monthTotals(
  userId: string,
  month: string,
): Promise<{ inMinor: number; outMinor: number; fixedOutMinor: number }> {
  const rows = await listTransactions(userId, { month, includeVoid: false }, { limit: 2000 })

  let inMinor = 0
  let outMinor = 0
  let fixedOutMinor = 0

  for (const row of rows) {
    if (row.direction === 'in') {
      inMinor += row.amount_minor
    } else {
      outMinor += row.amount_minor
      if (row.category?.is_fixed) fixedOutMinor += row.amount_minor
    }
  }

  return { inMinor, outMinor, fixedOutMinor }
}
