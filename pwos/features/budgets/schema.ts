import { z } from 'zod'

import { parseMoney } from '@/lib/money'

export const budgetInputSchema = z.object({
  category_id: z.uuid('That is not a valid category'),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'That is not a month'),
  target: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === '') return 0
      const minor = parseMoney(value)
      if (minor === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount like 200.00' })
        return z.NEVER
      }
      if (minor < 0) {
        ctx.addIssue({ code: 'custom', message: 'A budget cannot be negative' })
        return z.NEVER
      }
      return minor
    }),
})

export type BudgetInput = z.infer<typeof budgetInputSchema>
