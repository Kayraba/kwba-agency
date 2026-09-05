import { formatMoney, type FormatOptions, type Minor } from '@/lib/money'

type Tone = 'auto' | 'neutral' | 'positive' | 'negative' | 'muted'

const TONES: Record<Exclude<Tone, 'auto'>, string> = {
  neutral: 'text-ink',
  positive: 'text-positive',
  negative: 'text-negative',
  muted: 'text-ink-muted',
}

export interface MoneyProps extends FormatOptions {
  minor: Minor
  currency?: string
  tone?: Tone
  /**
   * Marks this as a figure PWOS calculated rather than one the user recorded.
   * Renders with the dotted underline defined in globals.css and needs a `source`.
   */
  calculated?: boolean
  /** Where a calculated figure came from. Shown on hover and to screen readers. */
  source?: string
  className?: string
}

/**
 * The only component that renders money.
 *
 * Formatting lives in lib/money.ts; this adds the tone and the fact-versus-
 * calculation distinction the design system requires.
 */
export function Money({
  minor,
  currency = 'GBP',
  tone = 'auto',
  calculated = false,
  source,
  className = '',
  ...format
}: MoneyProps) {
  const resolved: Exclude<Tone, 'auto'> =
    tone === 'auto' ? (minor < 0 ? 'negative' : minor > 0 ? 'positive' : 'muted') : tone

  const text = formatMoney(minor, currency, format)

  return (
    <span
      className={['tabular', TONES[resolved], calculated ? 'calculated' : '', className].join(' ')}
      {...(calculated && source ? { title: source, 'aria-description': source } : {})}
    >
      {text}
    </span>
  )
}
