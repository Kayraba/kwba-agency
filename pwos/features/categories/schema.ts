import { z } from 'zod'

export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the category a name').max(40, 'Keep it short'),
    direction: z.enum(['in', 'out']),
    is_fixed: z.coerce.boolean().default(false),
    is_subscription: z.coerce.boolean().default(false),
    colour: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5')
      .optional()
      .or(z.literal(''))
      .transform((value) => (value ? value : null)),
  })
  .transform((value) => ({
    ...value,
    // A subscription is a kind of fixed cost. The database has the same check,
    // but fixing it here means the UI never has to render an impossible state.
    is_fixed: value.is_fixed || value.is_subscription,
    // Only outgoing money can be a fixed cost; income arriving on a schedule is
    // a recurring rule, not a commitment.
    ...(value.direction === 'in' ? { is_fixed: false, is_subscription: false } : {}),
  }))

export type CategoryInput = z.infer<typeof categoryInputSchema>
