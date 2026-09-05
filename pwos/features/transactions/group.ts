import { monthOf, type IsoMonth } from '@/lib/dates'
import type { FlowDirection } from '@/lib/db.types'

/** The minimum a row needs for grouping and totalling. Keeps this file testable without a database. */
export interface Groupable {
  occurred_on: string
  direction: FlowDirection
  amount_minor: number
  is_void: boolean
}

export interface MonthTotals {
  inMinor: number
  outMinor: number
  /** in − out. Negative when more went out than came in. */
  netMinor: number
}

export interface MonthGroup<T extends Groupable> {
  month: IsoMonth
  rows: T[]
  totals: MonthTotals
}

/**
 * Sum a set of rows.
 *
 * Voided rows are excluded from the totals but stay in the list — the ledger is
 * append-only, so a mistake is visible history, not something that disappears.
 */
export function totalsOf(rows: readonly Groupable[]): MonthTotals {
  let inMinor = 0
  let outMinor = 0

  for (const row of rows) {
    if (row.is_void) continue
    if (row.direction === 'in') inMinor += row.amount_minor
    else outMinor += row.amount_minor
  }

  return { inMinor, outMinor, netMinor: inMinor - outMinor }
}

/**
 * Group rows into months, newest month first, rows already in the order given.
 *
 * Callers pass rows sorted by date descending; this preserves that order inside
 * each group rather than re-sorting, so the secondary ordering the query chose
 * (created_at, for two things bought on the same day) survives.
 */
export function groupByMonth<T extends Groupable>(rows: readonly T[]): MonthGroup<T>[] {
  const groups = new Map<IsoMonth, T[]>()

  for (const row of rows) {
    const month = monthOf(row.occurred_on)
    const existing = groups.get(month)
    if (existing) existing.push(row)
    else groups.set(month, [row])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthRows]) => ({ month, rows: monthRows, totals: totalsOf(monthRows) }))
}
