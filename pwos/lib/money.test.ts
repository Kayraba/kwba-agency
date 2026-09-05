import { describe, expect, it } from 'vitest'
import {
  MoneyError,
  absolute,
  add,
  allocate,
  formatMoney,
  formatPercent,
  multiply,
  negate,
  parseMoney,
  ratio,
  signed,
  subtract,
  sum,
} from './money'

describe('parseMoney', () => {
  it('reads plain and decimal amounts', () => {
    expect(parseMoney('12')).toBe(1200)
    expect(parseMoney('12.5')).toBe(1250)
    expect(parseMoney('12.50')).toBe(1250)
    expect(parseMoney('0.01')).toBe(1)
    expect(parseMoney('.99')).toBe(99)
  })

  it('strips symbols, spaces and thousands separators', () => {
    expect(parseMoney('£1,234.56')).toBe(123456)
    expect(parseMoney('  £ 40 ')).toBe(4000)
    expect(parseMoney('$9.99', 'USD')).toBe(999)
  })

  it('handles negatives in both notations', () => {
    expect(parseMoney('-3.99')).toBe(-399)
    expect(parseMoney('(3.99)')).toBe(-399)
    expect(parseMoney('(-3.99)')).toBe(399)
  })

  it('rejects more decimals than the currency has rather than rounding', () => {
    expect(parseMoney('12.345')).toBeNull()
    expect(parseMoney('1.5', 'JPY')).toBeNull()
  })

  it('respects zero-decimal currencies', () => {
    expect(parseMoney('1500', 'JPY')).toBe(1500)
  })

  it('returns null on junk', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('   ')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('.')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('12-')).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formats positive and negative amounts', () => {
    expect(formatMoney(1250)).toBe('£12.50')
    expect(formatMoney(-1250)).toBe('-£12.50')
    expect(formatMoney(0)).toBe('£0.00')
  })

  it('groups thousands', () => {
    expect(formatMoney(123456789)).toBe('£1,234,567.89')
  })

  it('can drop trailing zeros and force a sign', () => {
    expect(formatMoney(4000, 'GBP', { compactZeros: true })).toBe('£40')
    expect(formatMoney(4050, 'GBP', { compactZeros: true })).toBe('£40.50')
    expect(formatMoney(4000, 'GBP', { signed: true })).toBe('+£40.00')
    expect(formatMoney(-4000, 'GBP', { signed: true })).toBe('-£40.00')
    expect(formatMoney(1250, 'GBP', { symbol: false })).toBe('12.50')
  })

  it('handles zero-decimal currencies', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500')
  })

  it('refuses non-integer input', () => {
    expect(() => formatMoney(12.5)).toThrow(MoneyError)
  })

  it('round-trips through parseMoney', () => {
    for (const value of [0, 1, -1, 99, 1250, -123456789]) {
      expect(parseMoney(formatMoney(value))).toBe(value)
    }
  })
})

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(1000, 250)).toBe(1250)
    expect(subtract(1000, 250)).toBe(750)
    expect(subtract(250, 1000)).toBe(-750)
  })

  it('negates, absolutes and sums', () => {
    expect(negate(1250)).toBe(-1250)
    expect(absolute(-1250)).toBe(1250)
    expect(sum([100, 250, -50])).toBe(300)
    expect(sum([])).toBe(0)
  })

  it('rejects floats', () => {
    expect(() => add(10.5, 1)).toThrow(MoneyError)
  })

  it('multiplies with symmetric half-up rounding', () => {
    expect(multiply(1000, 0.2)).toBe(200)
    expect(multiply(1, 0.5)).toBe(1)
    expect(multiply(-1, 0.5)).toBe(-1)
    expect(multiply(333, 1 / 3)).toBe(111)
    expect(multiply(100, 0)).toBe(0)
  })

  it('allocates without losing or inventing a penny', () => {
    expect(allocate(1000, 3)).toEqual([334, 333, 333])
    expect(sum(allocate(1000, 3))).toBe(1000)
    expect(allocate(-1000, 3)).toEqual([-334, -333, -333])
    expect(sum(allocate(-1000, 3))).toBe(-1000)
    expect(allocate(2, 5)).toEqual([1, 1, 0, 0, 0])
  })

  it('applies ledger direction', () => {
    expect(signed('in', 1250)).toBe(1250)
    expect(signed('out', 1250)).toBe(-1250)
    expect(() => signed('in', -1)).toThrow(MoneyError)
  })
})

describe('ratio and percent', () => {
  it('returns null when the whole is zero', () => {
    expect(ratio(100, 0)).toBeNull()
    expect(formatPercent(null)).toBe('—')
  })

  it('computes a ratio and formats it', () => {
    expect(ratio(2500, 10000)).toBe(0.25)
    expect(formatPercent(0.25)).toBe('25%')
    expect(formatPercent(0.2537, 1)).toBe('25.4%')
  })
})
