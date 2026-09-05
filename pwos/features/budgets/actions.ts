'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { addMonths } from '@/lib/dates'
import { failure, fieldErrorsFrom, success, type ActionResult } from '@/lib/result'

import { budgetInputSchema } from './schema'
import { copyBudgets, setBudget } from './service'

function refresh() {
  revalidatePath('/money/budgets')
  revalidatePath('/position')
}

export async function setBudgetAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = budgetInputSchema.safeParse({
    category_id: formData.get('category_id'),
    month: formData.get('month'),
    target: formData.get('target') ?? '',
  })

  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await setBudget(userId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not save that budget.')
  }

  refresh()
  return success(undefined, parsed.data.target === 0 ? 'Budget cleared.' : 'Budget saved.')
}

export async function copyLastMonthAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const month = String(formData.get('month') ?? '')
  if (!/^\d{4}-\d{2}$/.test(month)) return failure('That is not a month.')

  let copied = 0
  try {
    copied = await copyBudgets(userId, addMonths(month, -1), month)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not copy those budgets.')
  }

  refresh()
  return success(
    undefined,
    copied === 0
      ? 'Nothing to copy — last month had no budgets you have not already set.'
      : `Copied ${copied} budget${copied === 1 ? '' : 's'} from last month.`,
  )
}
