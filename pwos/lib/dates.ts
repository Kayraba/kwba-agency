/**
 * Dates in PWOS are calendar dates, not instants. A transaction happened on a
 * day, not at a moment, so everything here works on 'YYYY-MM-DD' strings and
 * never constructs a Date in the user's local timezone by accident.
 */

export type IsoDate = string // YYYY-MM-DD
export type IsoMonth = string // YYYY-MM

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Today in the given IANA timezone, as a calendar date. Defaults to Europe/London. */
export function today(timeZone = 'Europe/London', now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return parts
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7)
}

export function startOfMonth(month: IsoMonth): IsoDate {
  return `${month}-01`
}

export function endOfMonth(month: IsoMonth): IsoDate {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${month}-${String(daysInMonth(y, m)).padStart(2, '0')}`
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}

export function addMonths(month: IsoMonth, months: number): IsoMonth {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + months
  const year = Math.floor(total / 12)
  const monthIndex = total - year * 12
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** "March 2026" — used for the ledger's month headings. */
export function formatMonth(month: IsoMonth): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTH_NAMES[m - 1] ?? month} ${y}`
}

/** "Thu 5 Mar" — used in the transaction list. */
export function formatDayShort(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`))
}

/** "5 March 2026" */
export function formatDayLong(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

/** "Today", "Yesterday", otherwise the short form. */
export function formatRelativeDay(date: IsoDate, reference: IsoDate): string {
  const delta = daysBetween(date, reference)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Yesterday'
  return formatDayShort(date)
}
