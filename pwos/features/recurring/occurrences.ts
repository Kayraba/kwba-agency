import {
  addDays,
  addMonths,
  dayInMonth,
  dayOfMonth,
  dayOfWeek,
  monthOf,
  type IsoDate,
} from '@/lib/dates'
import type { Minor } from '@/lib/money'
import type { RecurFreq } from '@/lib/db.types'

/**
 * Turning a recurring rule into dates.
 *
 * Pure and database-free. A rule says "£550 on the 1st, monthly, from January";
 * this works out which of those fall inside a window. Nothing here writes to the
 * ledger — a forecast is a prediction, and it only becomes a transaction when
 * the date has arrived and the user confirms it.
 */

/** The fields an occurrence calculation needs. Keeps the tests free of database rows. */
export interface Schedule {
  frequency: RecurFreq
  starts_on: IsoDate
  ends_on: string | null
  day_of_month: number | null
  day_of_week: number | null
  is_active: boolean
}

const MONTH_STEP: Partial<Record<RecurFreq, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

const DAY_STEP: Partial<Record<RecurFreq, number>> = {
  weekly: 7,
  fortnightly: 14,
}

/**
 * The first date on or after `starts_on` that lands on the rule's weekday.
 *
 * A weekly rule anchored to a Monday start with `day_of_week` of Friday should
 * first fall on that Friday, not on the Monday. When no weekday is given the
 * start date is the anchor.
 */
function weeklyAnchor(schedule: Schedule): IsoDate {
  if (schedule.day_of_week === null) return schedule.starts_on
  const target = schedule.day_of_week
  const offset = (target - dayOfWeek(schedule.starts_on) + 7) % 7
  return addDays(schedule.starts_on, offset)
}

/**
 * Every date this rule falls on within `[from, to]`, inclusive, oldest first.
 *
 * A monthly rule on the 31st falls on the 28th of February — clamped, not
 * skipped. Skipping would quietly lose a rent payment in a short month, and a
 * forecast that omits your largest outgoing is worse than one that is a few
 * days out.
 *
 * Inactive rules produce nothing. So do windows entirely before `starts_on` or
 * after `ends_on`.
 */
export function occurrencesBetween(
  schedule: Schedule,
  from: IsoDate,
  to: IsoDate,
): IsoDate[] {
  if (!schedule.is_active) return []
  if (to < from) return []

  const last = schedule.ends_on && schedule.ends_on < to ? schedule.ends_on : to
  const first = schedule.starts_on > from ? schedule.starts_on : from
  if (first > last) return []

  const dayStep = DAY_STEP[schedule.frequency]
  if (dayStep !== undefined) {
    return everyNDays(weeklyAnchor(schedule), dayStep, first, last)
  }

  const monthStep = MONTH_STEP[schedule.frequency]
  if (monthStep !== undefined) {
    return everyNMonths(schedule, monthStep, first, last)
  }

  return []
}

function everyNDays(anchor: IsoDate, step: number, first: IsoDate, last: IsoDate): IsoDate[] {
  const dates: IsoDate[] = []

  // Jump straight to the first occurrence in range rather than walking from the
  // anchor: a weekly rule that started three years ago is 150 wasted iterations.
  let current = anchor
  if (current < first) {
    const gap = daysApart(anchor, first)
    current = addDays(anchor, Math.ceil(gap / step) * step)
  }

  while (current <= last) {
    if (current >= first) dates.push(current)
    current = addDays(current, step)
  }

  return dates
}

function daysApart(from: IsoDate, to: IsoDate): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  )
}

function everyNMonths(
  schedule: Schedule,
  step: number,
  first: IsoDate,
  last: IsoDate,
): IsoDate[] {
  const day = schedule.day_of_month ?? dayOfMonth(schedule.starts_on)
  const startMonth = monthOf(schedule.starts_on)
  const dates: IsoDate[] = []

  // Same jump-ahead: start from the first scheduled month at or before `first`.
  const monthsFromStart = monthsApart(startMonth, monthOf(first))
  const skip = Math.max(0, Math.floor(monthsFromStart / step)) * step
  let month = addMonths(startMonth, skip)

  // Guard against a rule whose window is unbounded upward. Ten years of monthly
  // occurrences is far more than any screen asks for and stops a typo looping.
  for (let guard = 0; guard < 120; guard += 1) {
    const date = dayInMonth(month, day)
    if (date > last) break
    if (date >= first && date >= schedule.starts_on) dates.push(date)
    month = addMonths(month, step)
  }

  return dates
}

function monthsApart(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number) as [number, number]
  const [ty, tm] = to.split('-').map(Number) as [number, number]
  return (ty - fy) * 12 + (tm - fm)
}

/* ------------------------------------------------------- monthly equivalents */

/**
 * What a rule costs per month, as an exact rate.
 *
 * Fractional on purpose. A weekly £10 is £43.33… a month, and rounding each rule
 * to £43 before summing twenty of them loses real money from the surplus. Sum
 * the exact rates, round once at the end — the same reasoning as the daily burn
 * in ADR 5.
 */
export function monthlyRate(amountMinor: Minor, frequency: RecurFreq): number {
  switch (frequency) {
    case 'weekly':
      return (amountMinor * 52) / 12
    case 'fortnightly':
      return (amountMinor * 26) / 12
    case 'monthly':
      return amountMinor
    case 'quarterly':
      return amountMinor / 3
    case 'yearly':
      return amountMinor / 12
  }
}

/** Sum a set of rules to a whole number of minor units a month, rounded once, half-up. */
export function monthlyTotal(
  rules: readonly { amount_minor: number; frequency: RecurFreq }[],
): Minor {
  const exact = rules.reduce((acc, rule) => acc + monthlyRate(rule.amount_minor, rule.frequency), 0)
  return Math.sign(exact) * Math.round(Math.abs(exact))
}
