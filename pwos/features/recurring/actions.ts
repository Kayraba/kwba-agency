'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { isIsoDate } from '@/lib/dates'
import { failure, fieldErrorsFrom, success, type ActionResult } from '@/lib/result'

import { recurringInputSchema } from './schema'
import {
  OccurrenceAlreadyConfirmedError,
  confirmOccurrence,
  createRule,
  deleteRule,
  setRuleActive,
  updateRule,
} from './service'

function readForm(formData: FormData) {
  return recurringInputSchema.safeParse({
    account_id: formData.get('account_id'),
    category_id: formData.get('category_id') ?? '',
    label: formData.get('label'),
    direction: formData.get('direction'),
    amount: formData.get('amount') ?? '',
    frequency: formData.get('frequency'),
    day_of_month: formData.get('day_of_month') ?? '',
    day_of_week: formData.get('day_of_week') ?? '',
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('ends_on') ?? '',
    is_active: formData.get('is_active') !== 'false',
  })
}

function refresh() {
  revalidatePath('/position')
  revalidatePath('/money')
  revalidatePath('/money/recurring')
}

export async function createRuleAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await createRule(userId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not create the rule.')
  }

  refresh()
  return success(undefined, 'Rule added.')
}

export async function updateRuleAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That rule no longer exists.')

  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await updateRule(userId, id, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not save the rule.')
  }

  refresh()
  return success(undefined, 'Rule saved.')
}

export async function setRuleActiveAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  const active = formData.get('active') === 'true'
  if (!id) return failure('That rule no longer exists.')

  try {
    await setRuleActive(userId, id, active)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not change the rule.')
  }

  refresh()
  return success(undefined, active ? 'Rule resumed.' : 'Rule paused.')
}

export async function deleteRuleAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That rule no longer exists.')

  try {
    await deleteRule(userId, id)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not delete the rule.')
  }

  refresh()
  return success(
    undefined,
    'Rule deleted. The payments it already logged stay in the ledger.',
  )
}

/** One tap: the forecast row becomes a real transaction. */
export async function confirmOccurrenceAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const ruleId = String(formData.get('rule_id') ?? '')
  const date = String(formData.get('date') ?? '')

  if (!ruleId) return failure('That rule no longer exists.')
  if (!isIsoDate(date)) return failure('That date is not valid.')

  try {
    await confirmOccurrence(userId, ruleId, date)
  } catch (error) {
    if (error instanceof OccurrenceAlreadyConfirmedError) {
      // Not an error worth shouting about: the ledger already agrees with you.
      refresh()
      return success(undefined, 'Already logged.')
    }
    return failure(error instanceof Error ? error.message : 'Could not log that payment.')
  }

  refresh()
  return success(undefined, 'Logged.')
}
