import { describe, expect, it } from 'vitest'
import {
  dailyBurn,
  headroom,
  monthlySurplus,
  monthsToClear,
  netWorth,
  overdraftUsed,
  project,
  runwayDays,
  savingsRate,
  unrealised,
  weight,
} from './calc'

describe('cash position', () => {
  it('adds the overdraft limit to a negative balance', () => {
    // £420 overdrawn against a £1,000 limit leaves £580.
    expect(headroom(-42_000, 100_000)).toBe(58_000)
    expect(headroom(25_000, 100_000)).toBe(125_000)
    expect(headroom(-100_000, 100_000)).toBe(0)
  })

  it('reports overdraft use only when overdrawn', () => {
    expect(overdraftUsed(-42_000)).toBe(42_000)
    expect(overdraftUsed(0)).toBe(0)
    expect(overdraftUsed(500)).toBe(0)
  })
})

describe('dailyBurn and runwayDays', () => {
  it('returns a rate, unrounded', () => {
    // £900 out over 90 days = 1000 minor units a day.
    expect(dailyBurn(90_000, 90)).toBe(1_000)
    // Deliberately not an integer: 100000/90.
    expect(dailyBurn(100_000, 90)).toBeCloseTo(1111.111, 3)
  })

  it('refuses to invent a burn it has not observed', () => {
    expect(dailyBurn(0, 90)).toBeNull()
    expect(dailyBurn(-1, 90)).toBeNull()
    expect(dailyBurn(90_000, 0)).toBeNull()
  })

  it('floors the runway and returns null without a burn', () => {
    expect(runwayDays(58_000, 1_000)).toBe(58)
    expect(runwayDays(58_999, 1_000)).toBe(58)
    expect(runwayDays(58_000, null)).toBeNull()
    expect(runwayDays(58_000, 0)).toBeNull()
  })

  it('is zero, not negative, when the headroom is gone', () => {
    expect(runwayDays(0, 1_000)).toBe(0)
    expect(runwayDays(-500, 1_000)).toBe(0)
  })
})

describe('monthlySurplus', () => {
  const base = {
    incomeMinor: 140_000,
    fixedCostsMinor: 55_000,
    subscriptionsMinor: 3_400,
    variableBudgetMinor: 40_000,
  }

  it('subtracts committed spending from income', () => {
    expect(monthlySurplus(base)).toBe(41_600)
  })

  it('goes negative rather than clamping', () => {
    expect(monthlySurplus({ ...base, incomeMinor: 80_000 })).toBe(-18_400)
  })
})

describe('monthsToClear', () => {
  it('rounds up to the month the debt actually clears', () => {
    expect(monthsToClear(42_000, 41_600)).toBe(2)
    expect(monthsToClear(41_600, 41_600)).toBe(1)
  })

  it('returns null on a zero or negative surplus rather than a flattering date', () => {
    expect(monthsToClear(42_000, 0)).toBeNull()
    expect(monthsToClear(42_000, -1)).toBeNull()
  })

  it('is zero when there is nothing to clear', () => {
    expect(monthsToClear(0, 41_600)).toBe(0)
  })

  it('rounds up on a single penny over the boundary', () => {
    expect(monthsToClear(100_001, 100_000)).toBe(2)
  })
})

describe('savingsRate', () => {
  it('is null when there is no income to divide by', () => {
    expect(savingsRate(0, 50_000)).toBeNull()
  })

  it('computes the proportion kept, and goes negative when overspending', () => {
    expect(savingsRate(100_000, 75_000)).toBe(0.25)
    expect(savingsRate(100_000, 120_000)).toBeCloseTo(-0.2, 10)
    expect(savingsRate(100_000, 0)).toBe(1)
  })
})

describe('netWorth', () => {
  it('adds assets and cash, subtracts liabilities', () => {
    expect(
      netWorth({ assetsMinor: 250_000, accountBalancesMinor: -42_000, liabilitiesMinor: 900_000 }),
    ).toBe(-692_000)
  })
})

describe('project — the allocation ladder', () => {
  const goals = [
    { id: 'a', label: 'Clear overdraft', targetMinor: 100_000, savedMinor: 0 },
    { id: 'b', label: 'Emergency fund', targetMinor: 300_000, savedMinor: 50_000 },
    { id: 'c', label: 'Laptop', targetMinor: 120_000, savedMinor: 120_000 },
  ]

  it('gives the whole surplus to each goal in turn', () => {
    const steps = project(50_000, goals)
    expect(steps.map((s) => s.months)).toEqual([2, 5, 0])
    expect(steps.map((s) => s.completesInMonths)).toEqual([2, 7, 7])
    expect(steps.map((s) => s.needMinor)).toEqual([100_000, 250_000, 0])
  })

  it('returns null months on a zero surplus', () => {
    const steps = project(0, goals)
    expect(steps.map((s) => s.months)).toEqual([null, null, null])
    expect(steps.map((s) => s.completesInMonths)).toEqual([null, null, null])
    expect(steps.map((s) => s.needMinor)).toEqual([100_000, 250_000, 0])
  })

  it('returns null months on a negative surplus', () => {
    expect(project(-1, goals).every((s) => s.months === null)).toBe(true)
  })

  it('treats an already-funded goal as zero months, not a skipped row', () => {
    const [step] = project(50_000, [
      { id: 'c', label: 'Laptop', targetMinor: 120_000, savedMinor: 130_000 },
    ])
    expect(step).toMatchObject({ needMinor: 0, months: 0, completesInMonths: 0 })
  })

  it('takes exactly one month when the need equals the surplus', () => {
    const [step] = project(50_000, [
      { id: 'x', label: 'Exact', targetMinor: 50_000, savedMinor: 0 },
    ])
    expect(step?.months).toBe(1)
  })

  it('rounds up a penny over the boundary', () => {
    const [step] = project(50_000, [
      { id: 'x', label: 'One penny over', targetMinor: 50_001, savedMinor: 0 },
    ])
    expect(step?.months).toBe(2)
  })

  it('returns an empty ladder for no goals', () => {
    expect(project(50_000, [])).toEqual([])
  })
})

describe('portfolio', () => {
  it('is value minus cost basis, and nothing else', () => {
    expect(unrealised(125_000, 100_000)).toBe(25_000)
    expect(unrealised(90_000, 100_000)).toBe(-10_000)
  })

  it('weights a holding, and returns null against an empty portfolio', () => {
    expect(weight(25_000, 100_000)).toBe(0.25)
    expect(weight(0, 0)).toBeNull()
  })
})
