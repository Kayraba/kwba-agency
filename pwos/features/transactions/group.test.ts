import { describe, expect, it } from 'vitest'

import { groupByMonth, totalsOf, type Groupable } from './group'

const row = (
  occurred_on: string,
  direction: 'in' | 'out',
  amount_minor: number,
  is_void = false,
): Groupable => ({ occurred_on, direction, amount_minor, is_void })

describe('totalsOf', () => {
  it('sums each side and nets them', () => {
    expect(
      totalsOf([row('2026-03-01', 'in', 140_000), row('2026-03-02', 'out', 4_250)]),
    ).toEqual({ inMinor: 140_000, outMinor: 4_250, netMinor: 135_750 })
  })

  it('goes negative when more went out than came in', () => {
    expect(totalsOf([row('2026-03-02', 'out', 4_250)]).netMinor).toBe(-4_250)
  })

  it('excludes voided rows from the totals', () => {
    const rows = [row('2026-03-01', 'out', 1_000), row('2026-03-02', 'out', 9_999, true)]
    expect(totalsOf(rows)).toEqual({ inMinor: 0, outMinor: 1_000, netMinor: -1_000 })
  })

  it('is zero for no rows', () => {
    expect(totalsOf([])).toEqual({ inMinor: 0, outMinor: 0, netMinor: 0 })
  })
})

describe('groupByMonth', () => {
  it('groups by calendar month, newest first', () => {
    const groups = groupByMonth([
      row('2026-03-05', 'out', 500),
      row('2026-03-01', 'in', 1_000),
      row('2026-02-27', 'out', 250),
      row('2025-12-31', 'out', 100),
    ])

    expect(groups.map((g) => g.month)).toEqual(['2026-03', '2026-02', '2025-12'])
    expect(groups[0]?.rows).toHaveLength(2)
    expect(groups[0]?.totals).toEqual({ inMinor: 1_000, outMinor: 500, netMinor: 500 })
  })

  it('keeps the order it was given inside each month', () => {
    const groups = groupByMonth([
      row('2026-03-05', 'out', 300),
      row('2026-03-05', 'out', 100),
      row('2026-03-04', 'out', 200),
    ])
    expect(groups[0]?.rows.map((r) => r.amount_minor)).toEqual([300, 100, 200])
  })

  it('does not straddle a year boundary', () => {
    const groups = groupByMonth([row('2026-01-01', 'out', 1), row('2025-01-01', 'out', 1)])
    expect(groups.map((g) => g.month)).toEqual(['2026-01', '2025-01'])
  })

  it('returns nothing for no rows', () => {
    expect(groupByMonth([])).toEqual([])
  })
})
