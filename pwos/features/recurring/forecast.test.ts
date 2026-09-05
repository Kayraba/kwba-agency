import { describe, expect, it } from 'vitest'

import type { RecurringRuleRow } from '@/lib/db.types'

import { buildForecast, forecastTotals, type MaterialisedRow } from './forecast'

const makeRule = (patch: Partial<RecurringRuleRow>): RecurringRuleRow => ({
  id: 'rule-1',
  user_id: 'u',
  account_id: 'acc-1',
  category_id: 'cat-1',
  label: 'Rent',
  direction: 'out',
  amount_minor: 55_000,
  frequency: 'monthly',
  day_of_month: 1,
  day_of_week: null,
  starts_on: '2026-01-01',
  ends_on: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...patch,
})

const materialised = (patch: Partial<MaterialisedRow>): MaterialisedRow => ({
  id: 'txn-1',
  recurring_rule_id: 'rule-1',
  occurred_on: '2026-03-01',
  is_void: false,
  ...patch,
})

describe('buildForecast', () => {
  const rules = [
    makeRule({}),
    makeRule({
      id: 'rule-2',
      label: 'Wages',
      direction: 'in',
      amount_minor: 140_000,
      day_of_month: 28,
    }),
  ]

  it('expands each rule across the window and sorts by date', () => {
    const rows = buildForecast(rules, [], '2026-03-01', '2026-04-30', '2026-03-15')
    expect(rows.map((row) => `${row.date} ${row.label}`)).toEqual([
      '2026-03-01 Rent',
      '2026-03-28 Wages',
      '2026-04-01 Rent',
      '2026-04-28 Wages',
    ])
  })

  it('marks a past date with no ledger row as due', () => {
    const rows = buildForecast(rules, [], '2026-03-01', '2026-03-31', '2026-03-15')
    expect(rows[0]).toMatchObject({ date: '2026-03-01', status: 'due', transactionId: null })
    expect(rows[1]).toMatchObject({ date: '2026-03-28', status: 'upcoming' })
  })

  it('treats today as due, not upcoming', () => {
    const rows = buildForecast([makeRule({})], [], '2026-03-01', '2026-03-31', '2026-03-01')
    expect(rows[0]?.status).toBe('due')
  })

  it('marks an occurrence with a ledger row as confirmed and carries its id', () => {
    const rows = buildForecast(
      [makeRule({})],
      [materialised({ id: 'txn-abc' })],
      '2026-03-01',
      '2026-03-31',
      '2026-03-15',
    )
    expect(rows[0]).toMatchObject({ status: 'confirmed', transactionId: 'txn-abc' })
  })

  it('sends a voided occurrence back to due, keeping the row it came from', () => {
    // Voiding is how you say it did not happen. The forecast has to agree.
    const rows = buildForecast(
      [makeRule({})],
      [materialised({ id: 'txn-abc', is_void: true })],
      '2026-03-01',
      '2026-03-31',
      '2026-03-15',
    )
    expect(rows[0]).toMatchObject({ status: 'due', transactionId: 'txn-abc' })
  })

  it('does not match a ledger row from a different rule on the same date', () => {
    const rows = buildForecast(
      [makeRule({})],
      [materialised({ recurring_rule_id: 'rule-99' })],
      '2026-03-01',
      '2026-03-31',
      '2026-03-15',
    )
    expect(rows[0]?.status).toBe('due')
  })

  it('ignores manual rows, which carry no rule id', () => {
    const rows = buildForecast(
      [makeRule({})],
      [materialised({ recurring_rule_id: null })],
      '2026-03-01',
      '2026-03-31',
      '2026-03-15',
    )
    expect(rows[0]?.status).toBe('due')
  })

  it('leaves out inactive rules entirely', () => {
    const rows = buildForecast(
      [makeRule({ is_active: false })],
      [],
      '2026-03-01',
      '2026-03-31',
      '2026-03-15',
    )
    expect(rows).toEqual([])
  })

  it('gives each row a key that is stable and unique', () => {
    const rows = buildForecast(rules, [], '2026-03-01', '2026-04-30', '2026-03-15')
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })
})

describe('forecastTotals', () => {
  const rows = buildForecast(
    [
      makeRule({}),
      makeRule({ id: 'rule-2', label: 'Wages', direction: 'in', amount_minor: 140_000, day_of_month: 28 }),
    ],
    [materialised({})],
    '2026-03-01',
    '2026-03-31',
    '2026-03-30',
  )

  it('separates what is already in the ledger from what is not', () => {
    expect(forecastTotals(rows)).toEqual({
      confirmedOutMinor: 55_000,
      confirmedInMinor: 0,
      outstandingOutMinor: 0,
      outstandingInMinor: 140_000,
      dueCount: 1,
    })
  })

  it('is all zeros for an empty forecast', () => {
    expect(forecastTotals([])).toEqual({
      confirmedInMinor: 0,
      confirmedOutMinor: 0,
      outstandingInMinor: 0,
      outstandingOutMinor: 0,
      dueCount: 0,
    })
  })
})
