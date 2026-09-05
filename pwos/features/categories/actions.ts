'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth'
import { failure, fieldErrorsFrom, success, type ActionResult } from '@/lib/result'

import { categoryInputSchema } from './schema'
import { createCategory, deleteCategory, updateCategory } from './service'

function readForm(formData: FormData) {
  return categoryInputSchema.safeParse({
    name: formData.get('name'),
    direction: formData.get('direction'),
    is_fixed: formData.get('is_fixed') === 'on' || formData.get('is_fixed') === 'true',
    colour: formData.get('colour') ?? '',
  })
}

function refresh() {
  revalidatePath('/money/categories')
  revalidatePath('/money')
  revalidatePath('/position')
}

export async function createCategoryAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await createCategory(userId, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not create the category.')
  }

  refresh()
  return success(undefined, 'Category added.')
}

export async function updateCategoryAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That category no longer exists.')

  const parsed = readForm(formData)
  if (!parsed.success) {
    return failure('Check the highlighted fields.', fieldErrorsFrom(parsed.error.issues))
  }

  try {
    await updateCategory(userId, id, parsed.data)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not save the category.')
  }

  refresh()
  return success(undefined, 'Category saved.')
}

export async function deleteCategoryAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId()
  const id = String(formData.get('id') ?? '')
  if (!id) return failure('That category no longer exists.')

  let orphaned = 0
  try {
    orphaned = await deleteCategory(userId, id)
  } catch (error) {
    return failure(error instanceof Error ? error.message : 'Could not delete the category.')
  }

  refresh()
  return success(
    undefined,
    orphaned > 0
      ? `Category deleted. ${orphaned} transaction${orphaned === 1 ? '' : 's'} are now uncategorised.`
      : 'Category deleted.',
  )
}
