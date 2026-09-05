import { z } from 'zod'

import { isIsoDate } from '@/lib/dates'
import { parseMoney } from '@/lib/money'

export const FREQUENCIES = [
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'yearly',
] as const

export const FREQUENCY_LABELS: Record<(typeof FREQUENCIES)[number], string> = {
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
  quarterly: 'Every three months',
  yearly: 'Every year',
}

/** Frequencies that repeat on a day of the month rather than a day of the week. */
export const MONTHLY_FAMILY = ['monthly', 'quarterly', 'yearly'] as const

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

const uuid = z.uuid('That is not a valid id')

const optionalNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim())
    .transform((value, ctx) => {
      if (value === '') return null
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be between ${min} and ${max}` })
        return z.NEVER
      }
      return parsed
    })

export const recurringInputSchema = z
  .object({
    account_id: uuid,
    category_id: uuid
      .optional()
      .nullable()
      .or(z.literal(''))
      .transform((value) => (value ? value : null)),
    label: z.string().trim().min(1, 'Give the rule a name').max(60, 'Keep it short'),
    direction: z.enum(['in', 'out']),
    amount: z
      .string()
      .trim()
      .min(1, 'Enter an amount')
      .transform((value, ctx) => {
        const minor = parseMoney(value)
        if (minor === null) {
          ctx.addIssue({ code: 'custom', message: 'Enter an amount like 550.00' })
          return z.NEVER
        }
        if (minor === 0) {
          ctx.addIssue({ code: 'custom', message: 'A rule for nothing would not forecast anything' })
          return z.NEVER
        }
        return Math.abs(minor)
      }),
    frequency: z.enum(FREQUENCIES),
    day_of_month: optionalNumber('Day of the month', 1, 31),
    day_of_week: optionalNumber('Day of the week', 0, 6),
    starts_on: z.string().trim().refine(isIsoDate, 'Use a real date'),
    ends_on: z
      .string()
      .optional()
      .transform((value) => (value ?? '').trim())
      .transform((value, ctx) => {
        if (value === '') return null
        if (!isIsoDate(value)) {
          ctx.addIssue({ code: 'custom', message: 'Use a real date, or leave it blank' })
          return z.NEVER
        }
        return value
      }),
    is_active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.ends_on && value.ends_on < value.starts_on) {
      ctx.addIssue({
        code: 'custom',
        path: ['ends_on'],
        message: 'The end date cannot be before the start date',
      })
    }
  })
  .transform((value) => {
    // Keep only the day field the frequency actually uses. Storing both would
    // leave a stale weekday on a rule that is now monthly, and the occurrence
    // calculation would have to guess which one was meant.
    const monthly = (MONTHLY_FAMILY as readonly string[]).includes(value.frequency)
    return {
      ...value,
      day_of_month: monthly ? value.day_of_month : null,
      day_of_week: monthly ? null : value.day_of_week,
    }
  })

export type RecurringInput = z.infer<typeof recurringInputSchema>
