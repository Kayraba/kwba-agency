/**
 * Money in PWOS is an integer number of minor units (pence for GBP).
 *
 * There are no floats anywhere in this file's return values. Every function
 * takes and returns integers, and the only place a decimal point exists is at
 * the boundary: `parseMoney` reading what the user typed, and `formatMoney`
 * writing what the user reads.
 *
 * Rounding is half-up and happens once, at display.
 */

export type Minor = number
export type CurrencyCode = string

export class MoneyError extends Error {}

const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER

function assertMinor(value: number, label = 'amount'): asserts value is Minor {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of minor units, got ${value}`)
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range`)
  }
}

/** Minor units per major unit. Only currencies PWOS actually handles. */
const EXPONENTS: Record<string, number> = {
  GBP: 2,
  EUR: 2,
  USD: 2,
  JPY: 0,
}

export function exponentFor(currency: CurrencyCode): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2
}

/**
 * Parse user input into minor units.
 *
 * Accepts "12", "12.5", "12.50", "1,234.56", "£12.50", "-3.99", "(3.99)".
 * Rejects anything with more decimal places than the currency has, because
 * silently rounding what someone typed is how a ledger stops being trusted.
 *
 * Returns null on anything it cannot read. Callers decide what to tell the user.
 */
export function parseMoney(input: string, currency: CurrencyCode = 'GBP'): Minor | null {
  if (typeof input !== 'string') return null

  let s = input.trim()
  if (s === '') return null

  // Accountant-style negatives: (12.34)
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  // Strip currency symbols and thousands separators, keep digits, dot, sign.
  s = s.replace(/[£$€\s,]/g, '')

  if (s.startsWith('-')) {
    negative = !negative
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }

  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null

  const exponent = exponentFor(currency)
  const [whole = '', fraction = ''] = s.split('.')

  if (fraction.length > exponent) return null

  const padded = fraction.padEnd(exponent, '0')
  const digits = `${whole === '' ? '0' : whole}${padded}`

  const value = Number(digits)
  if (!Number.isSafeInteger(value)) return null

  return negative ? -value : value
}

export interface FormatOptions {
  /** Show the currency symbol. Default true. */
  symbol?: boolean
  /** Drop ".00" on whole amounts. Default false. */
  compactZeros?: boolean
  /** Always show a leading + on positive values. Default false. */
  signed?: boolean
  /** Locale for grouping. Default 'en-GB'. */
  locale?: string
}

/** Format minor units for display. This is the only function that produces a decimal point. */
export function formatMoney(
  minor: Minor,
  currency: CurrencyCode = 'GBP',
  options: FormatOptions = {},
): string {
  assertMinor(minor)

  const { symbol = true, compactZeros = false, signed = false, locale = 'en-GB' } = options
  const exponent = exponentFor(currency)
  const negative = minor < 0
  const abs = Math.abs(minor)

  const divisor = 10 ** exponent
  const whole = Math.trunc(abs / divisor)
  const fraction = abs % divisor

  const showFraction = !(compactZeros && fraction === 0) && exponent > 0

  const wholeText = whole.toLocaleString(locale)
  const body = showFraction
    ? `${wholeText}.${String(fraction).padStart(exponent, '0')}`
    : wholeText

  const symbolText = symbol ? symbolFor(currency) : ''
  const sign = negative ? '-' : signed && minor > 0 ? '+' : ''

  return `${sign}${symbolText}${body}`
}

export function symbolFor(currency: CurrencyCode): string {
  switch (currency.toUpperCase()) {
    case 'GBP':
      return '£'
    case 'USD':
      return '$'
    case 'EUR':
      return '€'
    case 'JPY':
      return '¥'
    default:
      return `${currency.toUpperCase()} `
  }
}

/* ------------------------------------------------------------------ arithmetic */

export function add(a: Minor, b: Minor): Minor {
  assertMinor(a, 'a')
  assertMinor(b, 'b')
  const total = a + b
  assertMinor(total, 'sum')
  return total
}

export function subtract(a: Minor, b: Minor): Minor {
  return add(a, -b)
}

export function negate(a: Minor): Minor {
  assertMinor(a)
  return -a
}

export function absolute(a: Minor): Minor {
  assertMinor(a)
  return Math.abs(a)
}

export function sum(values: readonly Minor[]): Minor {
  return values.reduce<Minor>((acc, value) => add(acc, value), 0)
}

/**
 * Multiply by a plain number (a rate, a quantity, a fraction) and round half-up.
 *
 * Half-up on the absolute value, so -0.5 rounds to -1 rather than 0. Symmetric
 * rounding is what a person expects when they see a negative total.
 */
export function multiply(minor: Minor, factor: number): Minor {
  assertMinor(minor)
  if (!Number.isFinite(factor)) throw new MoneyError(`factor must be finite, got ${factor}`)
  const raw = minor * factor
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw))
  const result = rounded === 0 ? 0 : rounded
  assertMinor(result, 'product')
  return result
}

/** Divide into `n` parts with the remainder spread over the earliest parts. Total is preserved. */
export function allocate(minor: Minor, parts: number): Minor[] {
  assertMinor(minor)
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`parts must be a positive integer, got ${parts}`)
  }
  const sign = minor < 0 ? -1 : 1
  const abs = Math.abs(minor)
  const base = Math.floor(abs / parts)
  const remainder = abs - base * parts
  return Array.from({ length: parts }, (_, index) =>
    sign * (base + (index < remainder ? 1 : 0)),
  )
}

/** Ledger rows are stored positive with a direction. This applies the sign. */
export function signed(direction: 'in' | 'out', amountMinor: Minor): Minor {
  assertMinor(amountMinor)
  if (amountMinor < 0) throw new MoneyError('ledger amounts are stored positive')
  return direction === 'in' ? amountMinor : -amountMinor
}

/** Percentage of `part` in `whole`, as a 0..1 ratio. Null when whole is 0. */
export function ratio(part: Minor, whole: Minor): number | null {
  assertMinor(part, 'part')
  assertMinor(whole, 'whole')
  if (whole === 0) return null
  return part / whole
}

/** Format a 0..1 ratio as a percentage string. Null in, em dash out. */
export function formatPercent(value: number | null, decimals = 0): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(decimals)}%`
}

export { MAX_SAFE_MINOR }
