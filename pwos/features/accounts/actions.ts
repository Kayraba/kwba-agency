'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { failure, fieldErrorsFrom, success, type ActionResult } from '@/lib/result'

import { accountInputSchema } from './schema'
import {
  AccountInUseError,
  createAccount,
  deleteAccount,
  setArchived,
  updateAccount,
} from './service'

function readForm(formData: FormData) {
  return accountInputSchema.safeParse({
    name: formData.get('name'),
    institution: formData.get('institution') ?? undefined,
    kind: formData.get('kind'),
    currency: formData.get('currency') ?? 'GBP',
    opening_balance_minor: formData.get('opening_balance') ?? '',
    overdraft_limit_minor: formData.get('overdraft_limit') ?? '',
  })
}

function refresh() {
  revalidatePath('/money/accounts')
  revalidatePath('/money')
  revalidatePath('/position')
}

export async function createAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await createAccount(userId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not create the account.')
  }

  refresh()
  return success(undefined, 'Account added.')
}

export async function updateAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That account no longer exists.')

  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await updateAccount(userId, id, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not save the account.')
  }

  refresh()
  return success(undefined, 'Account saved.')
}

export async function setArchivedAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  const archived = formData.get('archived') === 'true'
  if (!id) return failure('That account no longer exists.')

  try {
    await setArchived(userId, id, archived)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not archive the account.')
  }

  refresh()
  return success(undefined, archived ? 'Account archived.' : 'Account restored.')
}

export async function deleteAccountAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That account no longer exists.')

  try {
    await deleteAccount(userId, id)
  } catch (error) {
    if (error instanceof AccountInUseError) {
      return failure(
        'This account has transactions against it, so deleting it would orphan real history. Archive it instead.',
      )
    }
    return failure(error instanceof Error ? error.message : 'Could not delete the account.')
  }

  refresh()
  return success(undefined, 'Account deleted.')
}
