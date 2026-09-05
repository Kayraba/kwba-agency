import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatMonth,
  formatRelativeDay,
  isIsoDate,
  monthOf,
  startOfMonth,
  today,
} from './dates'

describe('dates', () => {
  it('validates ISO dates including month length', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-1-01')).toBe(false)
    expect(isIsoDate(20260101)).toBe(false)
  })

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  it('derives the calendar day in a timezone, not the server locale', () => {
    // 00:30 UTC on 6 March is still 5 March in New York.
    const instant = new Date('2026-03-06T00:30:00Z')
    expect(today('Europe/London', instant)).toBe('2026-03-06')
    expect(today('America/New_York', instant)).toBe('2026-03-05')
  })

  it('walks months and days without timezone drift', () => {
    expect(monthOf('2026-03-05')).toBe('2026-03')
    expect(startOfMonth('2026-03')).toBe('2026-03-01')
    expect(endOfMonth('2026-02')).toBe('2026-02-28')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30)
  })

  it('formats for the ledger', () => {
    expect(formatMonth('2026-03')).toBe('March 2026')
    expect(formatRelativeDay('2026-03-05', '2026-03-05')).toBe('Today')
    expect(formatRelativeDay('2026-03-04', '2026-03-05')).toBe('Yesterday')
    expect(formatRelativeDay('2026-03-01', '2026-03-05')).toBe('Sun 1 Mar')
  })
})
