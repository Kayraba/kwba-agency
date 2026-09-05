import type { BudgetRow, CategoryRow } from '@/lib/db.types'
import type { Minor } from '@/lib/money'

/**
 * Budgets against what was actually spent.
 *
 * Pure. The target is what you said; the spend comes from the ledger; the
 * comparison is arithmetic. Nothing here decides anything — it just puts the two
 * numbers next to each other, which is the whole job.
 */

export interface BudgetLine {
  categoryId: string
  name: string
  isFixed: boolean
  isSubscription: boolean
  /** Zero when no budget has been set for this category this month. */
  targetMinor: Minor
  hasTarget: boolean
  spentMinor: Minor
  /** Negative once you are over. Not clamped: being £40 over is the useful number. */
  remainingMinor: Minor
  /** Spend as a fraction of target. Null when there is no target to measure against. */
  usedRatio: number | null
  isOver: boolean
}

/**
 * One line per outgoing category, budgeted or not.
 *
 * Unbudgeted categories are included deliberately. A category you spent £80 on
 * and never budgeted is the most interesting row on the screen, and hiding it
 * until you set a target is how a budget quietly stops matching reality.
 */
export function buildBudgetLines(
  categories: readonly CategoryRow[],
  budgets: readonly BudgetRow[],
  spendByCategory: ReadonlyMap<string, Minor>,
): BudgetLine[] {
  const targets = new Map<string, Minor>()
  for (const budget of budgets) {
    if (budget.category_id) targets.set(budget.category_id, budget.target_minor)
  }

  return categories
    .filter((category) => category.direction === 'out')
    .map((category) => {
      const targetMinor = targets.get(category.id) ?? 0
      const hasTarget = targets.has(category.id)
      const spentMinor = spendByCategory.get(category.id) ?? 0

      return {
        categoryId: category.id,
        name: category.name,
        isFixed: category.is_fixed,
        isSubscription: category.is_subscription,
        targetMinor,
        hasTarget,
        spentMinor,
        remainingMinor: targetMinor - spentMinor,
        usedRatio: hasTarget && targetMinor > 0 ? spentMinor / targetMinor : null,
        isOver: hasTarget && spentMinor > targetMinor,
      }
    })
    .sort((a, b) => {
      // Over-budget first, then budgeted, then the rest alphabetically. The
      // rows that need a decision are the ones under your thumb.
      if (a.isOver !== b.isOver) return a.isOver ? -1 : 1
      if (a.hasTarget !== b.hasTarget) return a.hasTarget ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

/**
 * The discretionary budget figure the surplus calculation uses.
 *
 * Only categories that are neither fixed nor subscriptions. Committed spending
 * reaches the surplus through the recurring rules instead, so counting a budget
 * on a fixed category here would subtract the same rent twice.
 * See docs/adr/0010-where-the-surplus-figures-come-from.md.
 */
export function variableBudgetTotal(lines: readonly BudgetLine[]): Minor {
  return lines
    .filter((line) => !line.isFixed && line.hasTarget)
    .reduce((total, line) => total + line.targetMinor, 0)
}

export interface BudgetTotals {
  targetMinor: Minor
  spentMinor: Minor
  overCount: number
  unbudgetedSpendMinor: Minor
}

export function budgetTotals(lines: readonly BudgetLine[]): BudgetTotals {
  return lines.reduce<BudgetTotals>(
    (totals, line) => ({
      targetMinor: totals.targetMinor + line.targetMinor,
      spentMinor: totals.spentMinor + line.spentMinor,
      overCount: totals.overCount + (line.isOver ? 1 : 0),
      unbudgetedSpendMinor:
        totals.unbudgetedSpendMinor + (line.hasTarget ? 0 : line.spentMinor),
    }),
    { targetMinor: 0, spentMinor: 0, overCount: 0, unbudgetedSpendMinor: 0 },
  )
}
