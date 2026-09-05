import { describe, expect, it } from 'vitest'

import {
  affordability,
  buildPosition,
  splitCommitments,
  type PositionInputs,
} from './derive'

/**
 * The worked example this file is written around:
 *
 *   £420 overdrawn on a £1,000 arranged overdraft  -> £580 headroom
 *   £1,400 income, £550 fixed, £34 subscriptions, £400 budget -> £416 surplus
 *   £900 out over the trailing 90 days -> £10 a day -> 58 days of runway
 *   £420 to clear at £416 a month -> 2 months, so April from a February today
 */
const worked: PositionInputs = {
  balanceMinor: -42_000,
  overdraftLimitMinor: 100_000,
  incomeMinor: 140_000,
  fixedCostsMinor: 55_000,
  subscriptionsMinor: 3_400,
  variableBudgetMinor: 40_000,
  trailingOutMinor: 90_000,
  trailingDays: 90,
  today: '2026-02-15',
}

describe('buildPosition — the worked example', () => {
  const summary = buildPosition(worked)

  it('works out the headroom and how much of the overdraft is gone', () => {
    expect(summary.overdraftUsedMinor).toBe(42_000)
    expect(summary.headroomMinor).toBe(58_000)
    expect(summary.overdraftRatio).toBeCloseTo(0.42, 10)
  })

  it('works out the surplus', () => {
    expect(summary.surplusMinor).toBe(41_600)
  })

  it('works out the burn and the runway', () => {
    expect(summary.burnPerDay).toBe(1_000)
    expect(summary.runwayDays).toBe(58)
  })

  it('works out when the overdraft clears', () => {
    expect(summary.monthsToClear).toBe(2)
    expect(summary.clearanceMonth).toBe('2026-04')
    expect(summary.clearanceBlockedBy).toBeNull()
  })
})

describe('buildPosition — when the inputs do not support an answer', () => {
  it('gives no clearance date on a negative surplus, and says why', () => {
    const summary = buildPosition({ ...worked, incomeMinor: 80_000 })
    expect(summary.surplusMinor).toBeLessThan(0)
    expect(summary.monthsToClear).toBeNull()
    expect(summary.clearanceMonth).toBeNull()
    expect(summary.clearanceBlockedBy).toBe('no-surplus')
  })

  it('gives no clearance date on a surplus of exactly zero', () => {
    const summary = buildPosition({
      ...worked,
      incomeMinor: 98_400, // 55000 + 3400 + 40000
    })
    expect(summary.surplusMinor).toBe(0)
    expect(summary.clearanceMonth).toBeNull()
    expect(summary.clearanceBlockedBy).toBe('no-surplus')
  })

  it('distinguishes "nothing to clear" from "cannot clear"', () => {
    const summary = buildPosition({ ...worked, balanceMinor: 25_000 })
    expect(summary.overdraftUsedMinor).toBe(0)
    expect(summary.monthsToClear).toBe(0)
    expect(summary.clearanceMonth).toBeNull()
    expect(summary.clearanceBlockedBy).toBe('nothing-to-clear')
  })

  it('gives no runway when nothing has gone out yet', () => {
    const summary = buildPosition({ ...worked, trailingOutMinor: 0 })
    expect(summary.burnPerDay).toBeNull()
    expect(summary.runwayDays).toBeNull()
  })

  it('gives no overdraft ratio when there is no overdraft', () => {
    const summary = buildPosition({ ...worked, overdraftLimitMinor: 0, balanceMinor: 5_000 })
    expect(summary.overdraftRatio).toBeNull()
    expect(summary.headroomMinor).toBe(5_000)
  })

  it('does not go negative on the runway when the headroom is spent', () => {
    const summary = buildPosition({ ...worked, balanceMinor: -100_000 })
    expect(summary.headroomMinor).toBe(0)
    expect(summary.runwayDays).toBe(0)
  })

  it('rolls the clearance month over a year boundary', () => {
    const summary = buildPosition({ ...worked, today: '2026-11-20' })
    expect(summary.clearanceMonth).toBe('2027-01')
  })
})

describe('affordability', () => {
  const summary = buildPosition(worked)

  it('shows the headroom and runway that would be left', () => {
    // £120 against £580 of headroom at £10 a day.
    expect(affordability(summary, 12_000)).toEqual({
      amountMinor: 12_000,
      headroomAfterMinor: 46_000,
      runwayAfterDays: 46,
      runwayCostDays: 12,
      withinHeadroom: true,
      withinBalance: false,
    })
  })

  it('says when something would take you past the arranged limit', () => {
    const result = affordability(summary, 60_000)
    expect(result.withinHeadroom).toBe(false)
    expect(result.headroomAfterMinor).toBe(-2_000)
    expect(result.runwayAfterDays).toBe(0)
  })

  it('distinguishes spending your own money from spending the overdraft', () => {
    const positive = buildPosition({ ...worked, balanceMinor: 25_000 })
    expect(affordability(positive, 10_000).withinBalance).toBe(true)
    expect(affordability(positive, 30_000).withinBalance).toBe(false)
    expect(affordability(positive, 30_000).withinHeadroom).toBe(true)
  })

  it('leaves the runway cost null when there is no burn to price it against', () => {
    const noBurn = buildPosition({ ...worked, trailingOutMinor: 0 })
    const result = affordability(noBurn, 12_000)
    expect(result.runwayAfterDays).toBeNull()
    expect(result.runwayCostDays).toBeNull()
    expect(result.headroomAfterMinor).toBe(46_000)
  })

  it('changes nothing for an amount of zero', () => {
    const result = affordability(summary, 0)
    expect(result.headroomAfterMinor).toBe(summary.headroomMinor)
    expect(result.runwayCostDays).toBe(0)
  })
})

describe('splitCommitments', () => {
  const categories = [
    { id: 'rent', is_subscription: false },
    { id: 'subs', is_subscription: true },
  ] as never

  const rule = (patch: Record<string, unknown>) =>
    ({
      id: 'r',
      user_id: 'u',
      account_id: 'a',
      category_id: null,
      label: 'Rule',
      direction: 'out',
      amount_minor: 1_000,
      frequency: 'monthly',
      day_of_month: 1,
      day_of_week: null,
      starts_on: '2026-01-01',
      ends_on: null,
      is_active: true,
      created_at: '',
      updated_at: '',
      ...patch,
    }) as never

  it('separates income, subscriptions and everything else committed', () => {
    expect(
      splitCommitments(
        [
          rule({ direction: 'in', amount_minor: 140_000 }),
          rule({ category_id: 'rent', amount_minor: 55_000 }),
          rule({ category_id: 'subs', amount_minor: 999 }),
          rule({ category_id: 'subs', amount_minor: 2_401 }),
        ],
        categories,
      ),
    ).toEqual({ incomeMinor: 140_000, fixedCostsMinor: 55_000, subscriptionsMinor: 3_400 })
  })

  it('treats an uncategorised outgoing rule as a fixed commitment', () => {
    expect(
      splitCommitments([rule({ category_id: null, amount_minor: 2_000 })], categories),
    ).toMatchObject({ fixedCostsMinor: 2_000, subscriptionsMinor: 0 })
  })

  it('ignores paused rules', () => {
    expect(
      splitCommitments([rule({ amount_minor: 55_000, is_active: false })], categories),
    ).toEqual({ incomeMinor: 0, fixedCostsMinor: 0, subscriptionsMinor: 0 })
  })

  it('normalises every frequency to a month before adding up', () => {
    // £20 a week and £60 a quarter: 20*52/12 + 60/3 = 86.666… + 20 = £106.67
    expect(
      splitCommitments(
        [
          rule({ amount_minor: 2_000, frequency: 'weekly' }),
          rule({ amount_minor: 6_000, frequency: 'quarterly' }),
        ],
        categories,
      ).fixedCostsMinor,
    ).toBe(10_667)
  })

  it('is all zeros with no rules', () => {
    expect(splitCommitments([], categories)).toEqual({
      incomeMinor: 0,
      fixedCostsMinor: 0,
      subscriptionsMinor: 0,
    })
  })
})
