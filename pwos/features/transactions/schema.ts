import { z } from 'zod'

import { isIsoDate } from '@/lib/dates'
import { parseMoney } from '@/lib/money'

const uuid = z.uuid('That is not a valid id')

export const transactionInputSchema = z.object({
  account_id: uuid,
  category_id: uuid.optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  direction: z.enum(['in', 'out']),
  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .transform((value, ctx) => {
      const minor = parseMoney(value)
      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 12.50' })
        return z.NEVER
      }
      if (minor === 0) {
        ctx.addIssue({ code: 'custom', message: 'An amount of zero would not tell you anything' })
        return z.NEVER
      }
      // The ledger stores amounts positive; `direction` carries the sign. Typing
      // "-4.50" on an expense means the same thing as "4.50", so take the size.
      return Math.abs(minor)
    }),
  occurred_on: z
    .string()
    .trim()
    .refine(isIsoDate, 'Use a real date')
    .refine((value) => value <= '2100-01-01', 'That date is too far ahead'),
  merchant: z
    .string()
    .trim()
    .max(80, 'That is too long')
    .optional()
    .transform((value) => (value ? value : null)),
  notes: z
    .string()
    .trim()
    .max(500, 'That note is too long')
    .optional()
    .transform((value) => (value ? value : null)),
})

export type TransactionInput = z.infer<typeof transactionInputSchema>

export const transactionFilterSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  categoryId: uuid.optional(),
  accountId: uuid.optional(),
  direction: z.enum(['in', 'out']).optional(),
  includeVoid: z.boolean().default(false),
})

export type TransactionFilter = z.infer<typeof transactionFilterSchema>
