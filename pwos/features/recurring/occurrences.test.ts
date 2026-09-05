import { describe, expect, it } from 'vitest'

import { monthlyRate, monthlyTotal, occurrencesBetween, type Schedule } from './occurrences'

const rule = (patch: Partial<Schedule>): Schedule => ({
  frequency: 'monthly',
  starts_on: '2026-01-01',
  ends_on: null,
  day_of_month: null,
  day_of_week: null,
  is_active: true,
  ...patch,
})

describe('occurrencesBetween — monthly family', () => {
  it('falls on the same day each month', () => {
    expect(
      occurrencesBetween(rule({ starts_on: '2026-01-05' }), '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'])
  })

  it('prefers day_of_month over the start date’s day', () => {
    expect(
      occurrencesBetween(
        rule({ starts_on: '2026-01-05', day_of_month: 28 }),
        '2026-01-01',
        '2026-02-28',
      ),
    ).toEqual(['2026-01-28', '2026-02-28'])
  })

  it('clamps the 31st to the end of a short month rather than skipping it', () => {
    // Rent on the 31st still has to come out in February.
    expect(
      occurrencesBetween(rule({ day_of_month: 31 }), '2026-01-01', '2026-04-30'),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('clamps to the 29th in a leap year', () => {
    expect(
      occurrencesBetween(
        rule({ starts_on: '2024-01-01', day_of_month: 31 }),
        '2024-02-01',
        '2024-02-29',
      ),
    ).toEqual(['2024-02-29'])
  })

  it('steps three months for quarterly and twelve for yearly', () => {
    expect(
      occurrencesBetween(
        rule({ frequency: 'quarterly', starts_on: '2026-01-15' }),
        '2026-01-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])

    expect(
      occurrencesBetween(
        rule({ frequency: 'yearly', starts_on: '2026-06-01' }),
        '2026-01-01',
        '2028-12-31',
      ),
    ).toEqual(['2026-06-01', '2027-06-01', '2028-06-01'])
  })

  it('does not drift when the window starts years after the rule did', () => {
    expect(
      occurrencesBetween(
        rule({ starts_on: '2020-03-10' }),
        '2026-03-01',
        '2026-04-30',
      ),
    ).toEqual(['2026-03-10', '2026-04-10'])
  })
})

describe('occurrencesBetween — weekly family', () => {
  it('steps seven days from the start date', () => {
    expect(
      occurrencesBetween(
        rule({ frequency: 'weekly', starts_on: '2026-03-02' }),
        '2026-03-01',
        '2026-03-31',
      ),
    ).toEqual(['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23', '2026-03-30'])
  })

  it('moves the anchor forward to the rule’s weekday', () => {
    // 2 March 2026 is a Monday; day_of_week 5 is Friday.
    expect(
      occurrencesBetween(
        rule({ frequency: 'weekly', starts_on: '2026-03-02', day_of_week: 5 }),
        '2026-03-01',
        '2026-03-20',
      ),
    ).toEqual(['2026-03-06', '2026-03-13', '2026-03-20'])
  })

  it('steps fourteen days for fortnightly', () => {
    expect(
      occurrencesBetween(
        rule({ frequency: 'fortnightly', starts_on: '2026-03-02' }),
        '2026-03-01',
        '2026-04-01',
      ),
    ).toEqual(['2026-03-02', '2026-03-16', '2026-03-30'])
  })

  it('lands on the right dates when the window opens mid-cycle', () => {
    expect(
      occurrencesBetween(
        rule({ frequency: 'weekly', starts_on: '2026-01-01' }),
        '2026-03-01',
        '2026-03-15',
      ),
    ).toEqual(['2026-03-05', '2026-03-12'])
  })
})

describe('occurrencesBetween — boundaries', () => {
  it('produces nothing for an inactive rule', () => {
    expect(
      occurrencesBetween(rule({ is_active: false }), '2026-01-01', '2026-12-31'),
    ).toEqual([])
  })

  it('never runs before the start date', () => {
    expect(
      occurrencesBetween(rule({ starts_on: '2026-06-01' }), '2026-01-01', '2026-05-31'),
    ).toEqual([])
  })

  it('stops at the end date, inclusive', () => {
    expect(
      occurrencesBetween(
        rule({ starts_on: '2026-01-10', ends_on: '2026-03-10' }),
        '2026-01-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
  })

  it('includes both ends of the window', () => {
    expect(
      occurrencesBetween(rule({ starts_on: '2026-03-01' }), '2026-03-01', '2026-03-01'),
    ).toEqual(['2026-03-01'])
  })

  it('returns nothing for a backwards window', () => {
    expect(occurrencesBetween(rule({}), '2026-04-01', '2026-03-01')).toEqual([])
  })
})

describe('monthlyRate', () => {
  it('normalises every frequency to a month', () => {
    expect(monthlyRate(1_000, 'weekly')).toBeCloseTo(4_333.333, 3)
    expect(monthlyRate(1_000, 'fortnightly')).toBeCloseTo(2_166.667, 3)
    expect(monthlyRate(55_000, 'monthly')).toBe(55_000)
    expect(monthlyRate(30_000, 'quarterly')).toBe(10_000)
    expect(monthlyRate(120_000, 'yearly')).toBe(10_000)
  })

  it('uses 52 weeks a year, not four weeks a month', () => {
    // Four-weeks-a-month understates a weekly cost by about 8%, which is a month
    // of rent over a year on a big enough figure.
    expect(monthlyRate(1_000, 'weekly')).toBeGreaterThan(4_000)
  })
})

describe('monthlyTotal', () => {
  it('sums exact rates and rounds once', () => {
    // 1000*52/12 = 4333.33…, twice over is 8666.66…, which rounds to 8667 —
    // not 4333 + 4333 = 8666.
    expect(
      monthlyTotal([
        { amount_minor: 1_000, frequency: 'weekly' },
        { amount_minor: 1_000, frequency: 'weekly' },
      ]),
    ).toBe(8_667)
  })

  it('is zero for no rules', () => {
    expect(monthlyTotal([])).toBe(0)
  })

  it('returns a whole number of minor units', () => {
    const total = monthlyTotal([{ amount_minor: 999, frequency: 'weekly' }])
    expect(Number.isInteger(total)).toBe(true)
  })
})
