import type { FlowDirection, RecurringRuleRow } from '@/lib/db.types'
import type { IsoDate } from '@/lib/dates'

import { occurrencesBetween } from './occurrences'

/**
 * A forecast row: something a rule says will happen, and whether it has.
 *
 * `due` is the one that matters. It means the date has arrived and no ledger row
 * exists for it — either the money moved and you have not confirmed it, or the
 * rule is wrong. Both are worth a prompt; neither is worth writing to the ledger
 * on its own.
 */
export type ForecastStatus = 'confirmed' | 'due' | 'upcoming'

export interface Forecast {
  /** Stable across renders: one rule can only produce one row per date. */
  key: string
  ruleId: string
  label: string
  direction: FlowDirection
  amountMinor: number
  categoryId: string | null
  accountId: string
  date: IsoDate
  status: ForecastStatus
  /** The ledger row this occurrence became, once confirmed. */
  transactionId: string | null
}

/** What the forecast needs to know about rows already written. */
export interface MaterialisedRow {
  id: string
  recurring_rule_id: string | null
  occurred_on: string
  is_void: boolean
}

/**
 * Expand rules into dated rows for a window and mark off the ones already in
 * the ledger.
 *
 * A voided ledger row does not count as confirmed: voiding is how you say "that
 * did not happen", so the occurrence goes back to being due. The unique index
 * added in migration 0002 stops a second confirmation writing a duplicate, so
 * re-confirming means correcting the voided row rather than inserting again —
 * which is why a voided occurrence carries its transaction id.
 */
export function buildForecast(
  rules: readonly RecurringRuleRow[],
  materialised: readonly MaterialisedRow[],
  from: IsoDate,
  to: IsoDate,
  today: IsoDate,
): Forecast[] {
  const byOccurrence = new Map<string, MaterialisedRow>()
  for (const row of materialised) {
    if (row.recurring_rule_id) {
      byOccurrence.set(`${row.recurring_rule_id}:${row.occurred_on}`, row)
    }
  }

  const forecasts: Forecast[] = []

  for (const rule of rules) {
    for (const date of occurrencesBetween(rule, from, to)) {
      const key = `${rule.id}:${date}`
      const existing = byOccurrence.get(key)
      const confirmed = existing !== undefined && !existing.is_void

      forecasts.push({
        key,
        ruleId: rule.id,
        label: rule.label,
        direction: rule.direction,
        amountMinor: rule.amount_minor,
        categoryId: rule.category_id,
        accountId: rule.account_id,
        date,
        status: confirmed ? 'confirmed' : date <= today ? 'due' : 'upcoming',
        transactionId: existing?.id ?? null,
      })
    }
  }

  return forecasts.sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date.localeCompare(b.date)))
}

export interface ForecastTotals {
  /** Still to come this window: upcoming and due, not yet in the ledger. */
  outstandingInMinor: number
  outstandingOutMinor: number
  /** Already confirmed and sitting in the ledger. */
  confirmedInMinor: number
  confirmedOutMinor: number
  dueCount: number
}

export function forecastTotals(forecasts: readonly Forecast[]): ForecastTotals {
  const totals: ForecastTotals = {
    outstandingInMinor: 0,
    outstandingOutMinor: 0,
    confirmedInMinor: 0,
    confirmedOutMinor: 0,
    dueCount: 0,
  }

  for (const forecast of forecasts) {
    const confirmed = forecast.status === 'confirmed'
    if (forecast.status === 'due') totals.dueCount += 1

    if (forecast.direction === 'in') {
      if (confirmed) totals.confirmedInMinor += forecast.amountMinor
      else totals.outstandingInMinor += forecast.amountMinor
    } else if (confirmed) {
      totals.confirmedOutMinor += forecast.amountMinor
    } else {
      totals.outstandingOutMinor += forecast.amountMinor
    }
  }

  return totals
}
