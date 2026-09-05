import 'server-only'

import { endOfMonth, startOfMonth, type IsoMonth } from '@/lib/dates'
import type { BudgetRow } from '@/lib/db.types'
import type { Minor } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

import type { BudgetInput } from './schema'

export async function listBudgets(userId: string, month: IsoMonth): Promise<BudgetRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', startOfMonth(month))
    .eq('period_end', endOfMonth(month))

  if (error) throw new Error(`Could not load your budgets: ${error.message}`)
  return data ?? []
}

/**
 * What actually went out per category in a month, straight from the ledger.
 *
 * Voided rows are excluded. Uncategorised spend is dropped rather than bucketed
 * — there is no category row to hang it on, and inventing an "Other" bucket here
 * would make it look like a category the user chose.
 */
export async function spendByCategory(
  userId: string,
  month: IsoMonth,
): Promise<Map<string, Minor>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id, amount_minor')
    .eq('user_id', userId)
    .eq('direction', 'out')
    .eq('is_void', false)
    .gte('occurred_on', startOfMonth(month))
    .lte('occurred_on', endOfMonth(month))
    .limit(5000)

  if (error) throw new Error(`Could not total your spending: ${error.message}`)

  const totals = new Map<string, Minor>()
  for (const row of data ?? []) {
    if (!row.category_id) continue
    totals.set(row.category_id, (totals.get(row.category_id) ?? 0) + row.amount_minor)
  }
  return totals
}

/**
 * Set a budget for a category and month.
 *
 * A target of zero deletes the row rather than storing a zero. "No budget" and
 * "a budget of nothing" look identical on screen but mean opposite things to the
 * surplus calculation, so only one of them is allowed to exist.
 */
export async function setBudget(userId: string, input: BudgetInput): Promise<void> {
  const supabase = await createClient()
  const period_start = startOfMonth(input.month)
  const period_end = endOfMonth(input.month)

  if (input.target === 0) {
    const { error } = await supabase
      .from('budgets')
      .delete()
      .eq('user_id', userId)
      .eq('category_id', input.category_id)
      .eq('period_start', period_start)
      .eq('period_end', period_end)

    if (error) throw new Error(`Could not clear that budget: ${error.message}`)
    return
  }

  // The unique index from migration 0002 makes this an upsert rather than a
  // second row every time the figure is nudged.
  const { error } = await supabase.from('budgets').upsert(
    {
      user_id: userId,
      category_id: input.category_id,
      period_start,
      period_end,
      target_minor: input.target,
    },
    { onConflict: 'user_id,category_id,period_start,period_end' },
  )

  if (error) throw new Error(`Could not save that budget: ${error.message}`)
}

/**
 * Copy every budget from one month into another, skipping categories that
 * already have one. Setting thirteen figures from scratch each month is how a
 * budget screen stops getting used in February.
 */
export async function copyBudgets(
  userId: string,
  from: IsoMonth,
  to: IsoMonth,
): Promise<number> {
  const [source, existing] = await Promise.all([listBudgets(userId, from), listBudgets(userId, to)])
  const taken = new Set(existing.map((budget) => budget.category_id))
  const rows = source
    .filter((budget) => budget.category_id && !taken.has(budget.category_id))
    .map((budget) => ({
      user_id: userId,
      category_id: budget.category_id,
      period_start: startOfMonth(to),
      period_end: endOfMonth(to),
      target_minor: budget.target_minor,
    }))

  if (rows.length === 0) return 0

  const supabase = await createClient()
  const { error } = await supabase.from('budgets').insert(rows)
  if (error) throw new Error(`Could not copy those budgets: ${error.message}`)
  return rows.length
}
