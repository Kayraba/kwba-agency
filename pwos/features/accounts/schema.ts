import { z } from 'zod'

import { parseMoney } from '@/lib/money'

export const ACCOUNT_KINDS = [
  'current',
  'savings',
  'cash',
  'credit_card',
  'loan',
  'investment',
  'other',
] as const

export const ACCOUNT_KIND_LABELS: Record<(typeof ACCOUNT_KINDS)[number], string> = {
  current: 'Current account',
  savings: 'Savings',
  cash: 'Cash',
  credit_card: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
}

/** Reads a money field from a form, in minor units. Blank means zero. */
const moneyField = (label: string, { allowNegative = false } = {}) =>
  z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim())
    .transform((value, ctx) => {
      if (value === '') return 0
      const minor = parseMoney(value)
      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: `${label} must be an amount like 12.50` })
        return z.NEVER
      }
      if (!allowNegative && minor < 0) {
        ctx.addIssue({ code: 'custom', message: `${label} cannot be negative` })
        return z.NEVER
      }
      return minor
    })

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the account a name').max(80, 'That name is too long'),
  institution: z
    .string()
    .trim()
    .max(80, 'That is too long')
    .optional()
    .transform((value) => (value ? value : null)),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Use a three-letter currency code')
    .default('GBP'),
  // Negative is allowed and expected: an overdrawn account opens below zero.
  opening_balance_minor: moneyField('Opening balance', { allowNegative: true }),
  overdraft_limit_minor: moneyField('Overdraft limit'),
})

export type AccountInput = z.infer<typeof accountInputSchema>
