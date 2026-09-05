/**
 * The calculation contract.
 *
 * Every number PWOS shows that is not a recorded fact comes from a function in
 * this file. They are pure, they take and return minor units, and they return
 * `null` rather than a flattering figure when the inputs do not support an
 * answer. The tests next door are the specification; if a screen disagrees with
 * a test, the screen is wrong.
 *
 * Nothing here predicts a return, annualises anything, or gives advice.
 */

import type { Minor } from '@/lib/money'

/* -------------------------------------------------------------- cash position */

/**
 * How much can still be spent before the overdraft is exhausted.
 * `balanceMinor` is negative when overdrawn; `overdraftLimitMinor` is positive.
 */
export function headroom(balanceMinor: Minor, overdraftLimitMinor: Minor): Minor {
  return balanceMinor + overdraftLimitMinor
}

/** How much of the overdraft is currently in use. Zero when the balance is positive. */
export function overdraftUsed(balanceMinor: Minor): Minor {
  return balanceMinor < 0 ? -balanceMinor : 0
}

/**
 * Mean daily outgoing over a trailing window.
 *
 * Returns a *rate* in minor units per day, not a money amount, which is why it
 * is allowed to be fractional: rounding it here and then dividing by it would
 * push the error into the runway figure. Round it at display, not before.
 *
 * Returns null when the window is empty or nothing has gone out — you cannot
 * divide by a burn you have not observed.
 */
export function dailyBurn(totalOutMinor: Minor, windowDays: number): number | null {
  if (windowDays <= 0) return null
  if (totalOutMinor <= 0) return null
  return totalOutMinor / windowDays
}

/**
 * Whole days of headroom left at the current burn rate.
 * Null when there is no burn to measure, or when there is no headroom left.
 */
export function runwayDays(headroomMinor: Minor, burnPerDay: number | null): number | null {
  if (burnPerDay === null || burnPerDay <= 0) return null
  if (headroomMinor <= 0) return 0
  return Math.floor(headroomMinor / burnPerDay)
}

export interface SurplusInput {
  incomeMinor: Minor
  /** Costs from categories flagged is_fixed, *excluding* subscriptions. */
  fixedCostsMinor: Minor
  /** Subscriptions, counted separately so the Position screen can show them apart. */
  subscriptionsMinor: Minor
  /** The user's own figure for discretionary spend. Not calculated from history. */
  variableBudgetMinor: Minor
}

/** What is left each month once the committed spending is taken out. May be negative. */
export function monthlySurplus(input: SurplusInput): Minor {
  return (
    input.incomeMinor -
    input.fixedCostsMinor -
    input.subscriptionsMinor -
    input.variableBudgetMinor
  )
}

/**
 * Months to clear a debt at the current surplus.
 *
 * Null when the surplus is zero or negative, and the UI must say so rather than
 * render a date. A clearance date built on a negative surplus is not merely
 * imprecise, it is wrong in the direction that feels good.
 */
export function monthsToClear(debtMinor: Minor, surplusMinor: Minor): number | null {
  if (surplusMinor <= 0) return null
  if (debtMinor <= 0) return 0
  return Math.ceil(debtMinor / surplusMinor)
}

/* --------------------------------------------------------------- rates, totals */

/** Proportion of income not spent, as a 0..1 ratio. Null when income is zero. */
export function savingsRate(incomeMinor: Minor, totalOutMinor: Minor): number | null {
  if (incomeMinor === 0) return null
  return (incomeMinor - totalOutMinor) / incomeMinor
}

export interface NetWorthInput {
  assetsMinor: Minor
  accountBalancesMinor: Minor
  liabilitiesMinor: Minor
}

/**
 * Assets plus cash minus liabilities. Cash sits apart from `assets` because it
 * comes from the ledger view rather than the assets table; liabilities are
 * stored positive.
 */
export function netWorth(input: NetWorthInput): Minor {
  return input.assetsMinor + input.accountBalancesMinor - input.liabilitiesMinor
}

/* ----------------------------------------------------------------- the ladder */

export interface LadderGoal {
  id: string
  label: string
  targetMinor: Minor
  savedMinor: Minor
}

export interface LadderStep extends LadderGoal {
  /** What is still needed. Zero once the goal is funded. */
  needMinor: Minor
  /** Months of the whole surplus this goal alone takes. Null when there is no surplus. */
  months: number | null
  /** Months from now until this goal completes, given everything above it. Null when no surplus. */
  completesInMonths: number | null
}

/**
 * The allocation ladder: the entire monthly surplus goes to the first unfunded
 * goal, then the next, in the order given. Caller sorts by priority.
 *
 * With no surplus every goal returns null months — not "never", not a very large
 * number. The UI says the ladder is stalled and why.
 */
export function project(surplusMinor: Minor, goals: readonly LadderGoal[]): LadderStep[] {
  if (surplusMinor <= 0) {
    return goals.map((goal) => ({
      ...goal,
      needMinor: Math.max(0, goal.targetMinor - goal.savedMinor),
      months: null,
      completesInMonths: null,
    }))
  }

  let cumulative = 0
  return goals.map((goal) => {
    const needMinor = Math.max(0, goal.targetMinor - goal.savedMinor)
    const months = needMinor === 0 ? 0 : Math.ceil(needMinor / surplusMinor)
    cumulative += months
    return { ...goal, needMinor, months, completesInMonths: cumulative }
  })
}

/* ------------------------------------------------------------------ portfolio */

/**
 * Unrealised profit or loss on a holding.
 * `value` must be derived from a user-entered, timestamped price, and the UI
 * must show that timestamp next to anything computed from it.
 */
export function unrealised(valueMinor: Minor, costBasisMinor: Minor): Minor {
  return valueMinor - costBasisMinor
}

/** Weight of one holding in a portfolio, as a 0..1 ratio. Null when the total is zero. */
export function weight(holdingValueMinor: Minor, totalValueMinor: Minor): number | null {
  if (totalValueMinor === 0) return null
  return holdingValueMinor / totalValueMinor
}
