import 'server-only'

import { listAccounts } from '@/features/accounts/service'
import { sumAccounts } from '@/features/accounts/derive'
import { buildBudgetLines, variableBudgetTotal } from '@/features/budgets/derive'
import { listBudgets, spendByCategory } from '@/features/budgets/service'
import { listCategories } from '@/features/categories/service'
import { forecastTotals, type Forecast, type ForecastTotals } from '@/features/recurring/forecast'
import { getForecast, listRules } from '@/features/recurring/service'
import { outTotalBetween } from '@/features/transactions/service'
import { addDays, addMonths, endOfMonth, monthOf, startOfMonth, type IsoDate } from '@/lib/dates'

import { buildPosition, splitCommitments, type PositionSummary } from './derive'

/** The trailing window the burn rate is measured over. Ninety days, per the brief. */
export const BURN_WINDOW_DAYS = 90

export interface PositionView {
  summary: PositionSummary
  /** This month and next, so the screen can show what is still coming. */
  forecast: Forecast[]
  forecastTotals: ForecastTotals
  accountCount: number
  /** True when there is nothing behind the plan yet, so the screen can say so. */
  hasCommitments: boolean
  hasBudget: boolean
  burnWindowDays: number
}

/**
 * Everything the Position screen needs, in one place.
 *
 * Six queries, all of them small, then pure functions. The screen itself does no
 * arithmetic — if a number is wrong, it is wrong in `derive.ts` or in
 * `analytics/calc.ts`, and there is a test there that should have caught it.
 */
export async function getPositionView(userId: string, today: IsoDate): Promise<PositionView> {
  const month = monthOf(today)
  const windowStart = addDays(today, -BURN_WINDOW_DAYS)

  const [accounts, rules, categories, budgets, spend, trailingOutMinor, forecast] =
    await Promise.all([
      listAccounts(userId),
      listRules(userId, { includeInactive: false }),
      listCategories(userId),
      listBudgets(userId, month),
      spendByCategory(userId, month),
      outTotalBetween(userId, windowStart, today),
      getForecast(userId, startOfMonth(month), endOfMonth(addMonths(month, 1)), today),
    ])

  const cash = sumAccounts(accounts)
  const commitments = splitCommitments(rules, categories)
  const budgetLines = buildBudgetLines(categories, budgets, spend)

  const summary = buildPosition({
    balanceMinor: cash.balanceMinor,
    overdraftLimitMinor: cash.overdraftLimitMinor,
    incomeMinor: commitments.incomeMinor,
    fixedCostsMinor: commitments.fixedCostsMinor,
    subscriptionsMinor: commitments.subscriptionsMinor,
    variableBudgetMinor: variableBudgetTotal(budgetLines),
    trailingOutMinor,
    trailingDays: BURN_WINDOW_DAYS,
    today,
  })

  return {
    summary,
    forecast,
    forecastTotals: forecastTotals(forecast),
    accountCount: accounts.length,
    hasCommitments: rules.length > 0,
    hasBudget: budgets.length > 0,
    burnWindowDays: BURN_WINDOW_DAYS,
  }
}
