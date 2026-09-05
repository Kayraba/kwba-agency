import {
  dailyBurn,
  headroom,
  monthlySurplus,
  monthsToClear,
  overdraftUsed,
  runwayDays,
} from '@/features/analytics/calc'
import { monthlyTotal } from '@/features/recurring/occurrences'
import { addMonths, monthOf, type IsoDate, type IsoMonth } from '@/lib/dates'
import type { CategoryRow, RecurringRuleRow } from '@/lib/db.types'
import type { Minor } from '@/lib/money'

/**
 * The Position screen, computed.
 *
 * Every figure on that screen comes from here, and every one of them is either a
 * recorded fact passed in, or one of the functions in
 * `features/analytics/calc.ts` applied to those facts. Nothing is invented and
 * nothing is smoothed. Where the inputs do not support an answer the field is
 * `null` and the screen says so.
 */

export interface PositionInputs {
  /** Sum of open account balances. Negative when overdrawn. */
  balanceMinor: Minor
  overdraftLimitMinor: Minor
  /** Expected monthly income, from the active incoming recurring rules. */
  incomeMinor: Minor
  /** Committed monthly outgoings that are not subscriptions. */
  fixedCostsMinor: Minor
  subscriptionsMinor: Minor
  /** The user's own discretionary figure, from this month's budgets. */
  variableBudgetMinor: Minor
  /** Total 'out' over the trailing window, for the burn rate. */
  trailingOutMinor: Minor
  trailingDays: number
  today: IsoDate
}

export interface PositionSummary {
  balanceMinor: Minor
  overdraftLimitMinor: Minor
  overdraftUsedMinor: Minor
  headroomMinor: Minor
  /** Overdraft used as a fraction of the limit. Null when there is no overdraft. */
  overdraftRatio: number | null

  incomeMinor: Minor
  fixedCostsMinor: Minor
  subscriptionsMinor: Minor
  variableBudgetMinor: Minor
  /** Income minus everything committed. Negative when the plan does not balance. */
  surplusMinor: Minor

  /** Minor units a day, unrounded. Null when nothing has gone out in the window. */
  burnPerDay: number | null
  runwayDays: number | null

  /** Whole months to clear the overdraft. Null on a zero or negative surplus. */
  monthsToClear: number | null
  /** The month it clears, if it clears. Null for the same reason. */
  clearanceMonth: IsoMonth | null
  /** Why there is no clearance date, when there is none. */
  clearanceBlockedBy: 'no-surplus' | 'nothing-to-clear' | null
}

export function buildPosition(inputs: PositionInputs): PositionSummary {
  const used = overdraftUsed(inputs.balanceMinor)
  const available = headroom(inputs.balanceMinor, inputs.overdraftLimitMinor)

  const surplusMinor = monthlySurplus({
    incomeMinor: inputs.incomeMinor,
    fixedCostsMinor: inputs.fixedCostsMinor,
    subscriptionsMinor: inputs.subscriptionsMinor,
    variableBudgetMinor: inputs.variableBudgetMinor,
  })

  const burnPerDay = dailyBurn(inputs.trailingOutMinor, inputs.trailingDays)
  const months = monthsToClear(used, surplusMinor)

  return {
    balanceMinor: inputs.balanceMinor,
    overdraftLimitMinor: inputs.overdraftLimitMinor,
    overdraftUsedMinor: used,
    headroomMinor: available,
    overdraftRatio: inputs.overdraftLimitMinor > 0 ? used / inputs.overdraftLimitMinor : null,

    incomeMinor: inputs.incomeMinor,
    fixedCostsMinor: inputs.fixedCostsMinor,
    subscriptionsMinor: inputs.subscriptionsMinor,
    variableBudgetMinor: inputs.variableBudgetMinor,
    surplusMinor,

    burnPerDay,
    runwayDays: runwayDays(available, burnPerDay),

    monthsToClear: months,
    // months of 0 means there is nothing to clear, which is not a date.
    clearanceMonth: months !== null && months > 0 ? addMonths(monthOf(inputs.today), months) : null,
    clearanceBlockedBy: months === null ? 'no-surplus' : months === 0 ? 'nothing-to-clear' : null,
  }
}

export interface Affordability {
  amountMinor: Minor
  headroomAfterMinor: Minor
  /** Runway once the money has gone, at the same burn rate. Null without a burn. */
  runwayAfterDays: number | null
  /** Days of runway this purchase costs. Null without a burn. */
  runwayCostDays: number | null
  /** False when the purchase would take you past the arranged overdraft limit. */
  withinHeadroom: boolean
  /** True when it fits without touching the overdraft at all. */
  withinBalance: boolean
}

/**
 * What a purchase would do to your position.
 *
 * Describes, does not judge. It returns the resulting headroom and runway and
 * lets the screen show them; it does not decide whether you can "afford" it,
 * because that word means something different on the 3rd than on the 28th.
 */
export function affordability(summary: PositionSummary, amountMinor: Minor): Affordability {
  const headroomAfterMinor = summary.headroomMinor - amountMinor
  const runwayAfterDays = runwayDays(headroomAfterMinor, summary.burnPerDay)

  return {
    amountMinor,
    headroomAfterMinor,
    runwayAfterDays,
    runwayCostDays:
      summary.runwayDays !== null && runwayAfterDays !== null
        ? summary.runwayDays - runwayAfterDays
        : null,
    withinHeadroom: headroomAfterMinor >= 0,
    withinBalance: summary.balanceMinor - amountMinor >= 0,
  }
}

/* --------------------------------------------------------- commitments split */

export interface Commitments {
  incomeMinor: Minor
  fixedCostsMinor: Minor
  subscriptionsMinor: Minor
}

/**
 * Split the active recurring rules into the three figures the surplus needs.
 *
 * A recurring rule is a commitment whatever category it carries — that is what
 * makes it recurring. So every outgoing rule counts, and the only question is
 * whether its category is marked a subscription, because a cost you could cancel
 * this afternoon deserves its own line.
 *
 * Budgets cover the discretionary categories instead, which is why nothing here
 * can double-count with `variableBudgetTotal`. See
 * docs/adr/0010-where-the-surplus-figures-come-from.md.
 */
export function splitCommitments(
  rules: readonly RecurringRuleRow[],
  categories: readonly CategoryRow[],
): Commitments {
  const subscriptionCategories = new Set(
    categories.filter((category) => category.is_subscription).map((category) => category.id),
  )

  const active = rules.filter((rule) => rule.is_active)
  const incoming = active.filter((rule) => rule.direction === 'in')
  const outgoing = active.filter((rule) => rule.direction === 'out')

  const subscriptions = outgoing.filter(
    (rule) => rule.category_id !== null && subscriptionCategories.has(rule.category_id),
  )
  const fixed = outgoing.filter(
    (rule) => rule.category_id === null || !subscriptionCategories.has(rule.category_id),
  )

  return {
    incomeMinor: monthlyTotal(incoming),
    fixedCostsMinor: monthlyTotal(fixed),
    subscriptionsMinor: monthlyTotal(subscriptions),
  }
}
