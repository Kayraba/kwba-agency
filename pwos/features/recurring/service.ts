import 'server-only'

import type { RecurringRuleRow, TransactionRow } from '@/lib/db.types'
import type { IsoDate } from '@/lib/dates'
import { createClient } from '@/lib/supabase/server'

import { buildForecast, type Forecast, type MaterialisedRow } from './forecast'
import type { RecurringInput } from './schema'

export class OccurrenceAlreadyConfirmedError extends Error {
  constructor() {
    super('That payment is already in the ledger')
    this.name = 'OccurrenceAlreadyConfirmedError'
  }
}

export async function listRules(
  userId: string,
  { includeInactive = true } = {},
): Promise<RecurringRuleRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('recurring_rules')
    .select('*')
    .eq('user_id', userId)
    .order('direction', { ascending: true })
    .order('label', { ascending: true })

  if (!includeInactive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw new Error(`Could not load your recurring rules: ${error.message}`)
  return data ?? []
}

/** Ledger rows already produced by a rule inside a window. */
async function listMaterialised(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<MaterialisedRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('id, recurring_rule_id, occurred_on, is_void')
    .eq('user_id', userId)
    .not('recurring_rule_id', 'is', null)
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  if (error) throw new Error(`Could not check which payments are logged: ${error.message}`)
  return data ?? []
}

/**
 * The forecast for a window.
 *
 * Two queries and a pure function. Nothing is written: a forecast row exists
 * only in memory until the user confirms it, which is the whole point — the
 * ledger holds what happened, not what a rule expected.
 */
export async function getForecast(
  userId: string,
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): Promise<Forecast[]> {
  const [rules, materialised] = await Promise.all([
    listRules(userId, { includeInactive: false }),
    listMaterialised(userId, from, to),
  ])

  return buildForecast(rules, materialised, from, to, today)
}

export async function createRule(
  userId: string,
  input: RecurringInput,
): Promise<RecurringRuleRow> {
  const supabase = await createClient()
  const { amount, ...rest } = input
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({ ...rest, amount_minor: amount, user_id: userId })
    .select('*')
    .single<RecurringRuleRow>()

  if (error) throw new Error(`Could not create the rule: ${error.message}`)
  return data
}

export async function updateRule(
  userId: string,
  id: string,
  input: RecurringInput,
): Promise<void> {
  const supabase = await createClient()
  const { amount, ...rest } = input
  const { error } = await supabase
    .from('recurring_rules')
    .update({ ...rest, amount_minor: amount })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not save the rule: ${error.message}`)
}

export async function setRuleActive(
  userId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('recurring_rules')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not change the rule: ${error.message}`)
}

/**
 * Delete a rule.
 *
 * The ledger rows it already produced survive — `recurring_rule_id` is
 * ON DELETE SET NULL. Those are payments that really happened; forgetting which
 * rule anticipated them is fine, losing them is not.
 */
export async function deleteRule(userId: string, id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('recurring_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Could not delete the rule: ${error.message}`)
}

/**
 * Turn one forecast occurrence into a real transaction.
 *
 * Idempotent by construction. The unique index from migration 0002 means a
 * second attempt at the same (rule, date) fails at the database rather than
 * writing a duplicate, so a double tap or a retried request cannot log the rent
 * twice.
 *
 * A previously voided occurrence is restored rather than re-inserted, because
 * the voided row still occupies that (rule, date) slot.
 */
export async function confirmOccurrence(
  userId: string,
  ruleId: string,
  date: IsoDate,
): Promise<TransactionRow> {
  const supabase = await createClient()

  const { data: rule, error: ruleError } = await supabase
    .from('recurring_rules')
    .select('*')
    .eq('id', ruleId)
    .eq('user_id', userId)
    .maybeSingle<RecurringRuleRow>()

  if (ruleError) throw new Error(`Could not read the rule: ${ruleError.message}`)
  if (!rule) throw new Error('That rule no longer exists.')

  const { data: existing } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('recurring_rule_id', ruleId)
    .eq('occurred_on', date)
    .maybeSingle<TransactionRow>()

  if (existing) {
    if (!existing.is_void) throw new OccurrenceAlreadyConfirmedError()

    const { data: restored, error: restoreError } = await supabase
      .from('transactions')
      .update({ is_void: false })
      .eq('id', existing.id)
      .eq('user_id', userId)
      .select('*')
      .single<TransactionRow>()

    if (restoreError) throw new Error(`Could not restore that payment: ${restoreError.message}`)
    return restored
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: rule.account_id,
      category_id: rule.category_id,
      direction: rule.direction,
      amount_minor: rule.amount_minor,
      occurred_on: date,
      merchant: rule.label,
      source: 'recurring',
      recurring_rule_id: rule.id,
    })
    .select('*')
    .single<TransactionRow>()

  // 23505: the unique index caught a concurrent confirmation.
  if (error?.code === '23505') throw new OccurrenceAlreadyConfirmedError()
  if (error) throw new Error(`Could not log that payment: ${error.message}`)
  return data
}
