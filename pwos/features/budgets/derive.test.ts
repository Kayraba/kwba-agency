import { describe, expect, it } from 'vitest'

import type { BudgetRow, CategoryRow } from '@/lib/db.types'

import { budgetTotals, buildBudgetLines, variableBudgetTotal } from './derive'

const category = (patch: Partial<CategoryRow> & { id: string; name: string }): CategoryRow => ({
  user_id: 'u',
  direction: 'out',
  parent_id: null,
  is_fixed: false,
  is_subscription: false,
  colour: null,
  created_at: '2026-01-01T00:00:00Z',
  ...patch,
})

const budget = (categoryId: string, targetMinor: number): BudgetRow => ({
  id: `b-${categoryId}`,
  user_id: 'u',
  category_id: categoryId,
  period_start: '2026-03-01',
  period_end: '2026-03-31',
  target_minor: targetMinor,
  created_at: '2026-03-01T00:00:00Z',
})

const categories = [
  category({ id: 'groceries', name: 'Groceries' }),
  category({ id: 'fun', name: 'Fun' }),
  category({ id: 'rent', name: 'Rent', is_fixed: true }),
  category({ id: 'subs', name: 'Subscriptions', is_fixed: true, is_subscription: true }),
  category({ id: 'wages', name: 'Wages', direction: 'in' }),
]

describe('buildBudgetLines', () => {
  it('leaves income categories out', () => {
    const lines = buildBudgetLines(categories, [], new Map())
    expect(lines.map((line) => line.categoryId)).not.toContain('wages')
  })

  it('compares spend against target', () => {
    const lines = buildBudgetLines(
      categories,
      [budget('groceries', 20_000)],
      new Map([['groceries', 14_250]]),
    )
    const groceries = lines.find((line) => line.categoryId === 'groceries')

    expect(groceries).toMatchObject({
      targetMinor: 20_000,
      spentMinor: 14_250,
      remainingMinor: 5_750,
      usedRatio: 0.7125,
      isOver: false,
      hasTarget: true,
    })
  })

  it('reports how far over, not zero', () => {
    const lines = buildBudgetLines(
      categories,
      [budget('fun', 5_000)],
      new Map([['fun', 9_000]]),
    )
    const fun = lines.find((line) => line.categoryId === 'fun')
    expect(fun).toMatchObject({ remainingMinor: -4_000, isOver: true })
    expect(fun?.usedRatio).toBeCloseTo(1.8, 10)
  })

  it('keeps a category that was spent on but never budgeted', () => {
    const lines = buildBudgetLines(categories, [], new Map([['fun', 8_000]]))
    const fun = lines.find((line) => line.categoryId === 'fun')
    expect(fun).toMatchObject({ hasTarget: false, targetMinor: 0, spentMinor: 8_000 })
    expect(fun?.usedRatio).toBeNull()
    expect(fun?.isOver).toBe(false)
  })

  it('does not divide by a zero target', () => {
    const lines = buildBudgetLines(categories, [budget('fun', 0)], new Map([['fun', 500]]))
    expect(lines.find((line) => line.categoryId === 'fun')?.usedRatio).toBeNull()
  })

  it('puts over-budget rows first, then budgeted, then the rest', () => {
    const lines = buildBudgetLines(
      categories,
      [budget('groceries', 20_000), budget('fun', 5_000)],
      new Map([
        ['fun', 9_000],
        ['groceries', 1_000],
      ]),
    )
    expect(lines.map((line) => line.categoryId)).toEqual(['fun', 'groceries', 'rent', 'subs'])
  })
})

describe('variableBudgetTotal', () => {
  it('counts only discretionary categories', () => {
    // Rent reaches the surplus through its recurring rule. Counting its budget
    // here as well would subtract the same £550 twice.
    const lines = buildBudgetLines(
      categories,
      [budget('groceries', 20_000), budget('fun', 5_000), budget('rent', 55_000)],
      new Map(),
    )
    expect(variableBudgetTotal(lines)).toBe(25_000)
  })

  it('ignores categories with no target set', () => {
    const lines = buildBudgetLines(categories, [], new Map([['fun', 9_000]]))
    expect(variableBudgetTotal(lines)).toBe(0)
  })
})

describe('budgetTotals', () => {
  it('adds up targets, spend, breaches and unbudgeted spend', () => {
    const lines = buildBudgetLines(
      categories,
      [budget('groceries', 20_000), budget('fun', 5_000)],
      new Map([
        ['groceries', 14_250],
        ['fun', 9_000],
        ['rent', 55_000],
      ]),
    )

    expect(budgetTotals(lines)).toEqual({
      targetMinor: 25_000,
      spentMinor: 78_250,
      overCount: 1,
      unbudgetedSpendMinor: 55_000,
    })
  })

  it('is all zeros with nothing to add up', () => {
    expect(budgetTotals([])).toEqual({
      targetMinor: 0,
      spentMinor: 0,
      overCount: 0,
      unbudgetedSpendMinor: 0,
    })
  })
})
