import { z } from 'zod'

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(40, 'Keep it short'),
  direction: z.enum(['in', 'out']),
  is_fixed: z.coerce.boolean().default(false),
  colour: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : null)),
})

export type CategoryInput = z.infer<typeof categoryInputSchema>
