'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { failure, fieldErrorsFrom, success, type ActionResult } from '@/lib/result'

import { transactionInputSchema } from './schema'
import {
  correctTransaction,
  createTransaction,
  unvoidTransaction,
  voidTransaction,
} from './service'

function readForm(formData: FormData) {
  return transactionInputSchema.safeParse({
    account_id: formData.get('account_id'),
    category_id: formData.get('category_id') ?? '',
    direction: formData.get('direction'),
    amount: formData.get('amount') ?? '',
    occurred_on: formData.get('occurred_on'),
    merchant: formData.get('merchant') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  })
}

function refresh() {
  revalidatePath('/money')
  revalidatePath('/position')
  revalidatePath('/money/accounts')
}

export async function createTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await createTransaction(userId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not save that transaction.')
  }

  refresh()
  return success(undefined, 'Logged.')
}

export async function voidTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That transaction no longer exists.')

  try {
    await voidTransaction(userId, id)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not void that transaction.')
  }

  refresh()
  return success(undefined, 'Voided. It stays in the history, but no longer counts.')
}

export async function unvoidTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That transaction no longer exists.')

  try {
    await unvoidTransaction(userId, id)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not restore that transaction.')
  }

  refresh()
  return success(undefined, 'Restored.')
}

export async function correctTransactionAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const originalId = String(formData.get('original_id') ?? '')
  if (!originalId) return failure('That transaction no longer exists.')

  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await correctTransaction(userId, originalId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not correct that transaction.')
  }

  refresh()
  return success(undefined, 'Corrected. The original stays in the history, voided.')
}
