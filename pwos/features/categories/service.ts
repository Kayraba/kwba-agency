import 'server-only'

import type { CategoryRow, FlowDirection } from '@/lib/db.types'
import { createClient } from '@/lib/supabase/server'

import type { CategoryInput } from './schema'

export async function listCategories(
  userId: string,
  direction?: FlowDirection,
): Promise<CategoryRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('direction', { ascending: true })
    .order('name', { ascending: true })

  if (direction) query = query.eq('direction', direction)

  const { data, error } = await query
  if (error) throw new Error(`Could not load your categories: ${error.message}`)
  return data ?? []
}

/**
 * Categories ordered so the ones you actually use are the ones under your thumb.
 *
 * Recency beats frequency here on purpose: spending comes in runs. The week you
 * are buying course books, "University" should be the first chip, even though
 * "Groceries" has more rows all year.
 *
 * One extra query over the last 200 rows. At this transaction volume that is
 * cheaper than any denormalised counter would be to keep honest.
 */
export async function listCategoriesByRecentUse(
  userId: string,
  direction: FlowDirection,
): Promise<CategoryRow[]> {
  const supabase = await createClient()

  const [categories, recent] = await Promise.all([
    listCategories(userId, direction),
    supabase
      .from('transactions')
      .select('category_id')
      .eq('user_id', userId)
      .eq('direction', direction)
      .eq('is_void', false)
      .not('category_id', 'is', null)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  if (recent.error) {
    // Ordering is a nicety; an alphabetical list is still perfectly usable.
    return categories
  }

  const rank = new Map<string, number>()
  for (const [index, row] of (recent.data ?? []).entries()) {
    if (row.category_id && !rank.has(row.category_id)) rank.set(row.category_id, index)
  }

  return [...categories].sort((a, b) => {
    const rankA = rank.get(a.id) ?? Number.POSITIVE_INFINITY
    const rankB = rank.get(b.id) ?? Number.POSITIVE_INFINITY
    if (rankA !== rankB) return rankA - rankB
    return a.name.localeCompare(b.name)
  })
}

export async function createCategory(
  userId: string,
  input: CategoryInput,
): Promise<CategoryRow> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({ ...input, user_id: userId })
    .select('*')
    .single<CategoryRow>()

  // 23505: unique (user_id, name, direction).
  if (error?.code === '23505') {
    throw new Error(`You already have a "${input.name}" category on that side.`)
  }
  if (error) throw new Error(`Could not create the category: ${error.message}`)
  return data
}

export async function updateCategory(
  userId: string,
  id: string,
  input: CategoryInput,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)

  if (error?.code === '23505') {
    throw new Error(`You already have a "${input.name}" category on that side.`)
  }
  if (error) throw new Error(`Could not save the category: ${error.message}`)
}

/**
 * Delete a category.
 *
 * Transactions reference categories ON DELETE SET NULL, so the ledger rows
 * survive and become uncategorised. Nothing financial is lost, which is why this
 * is a real delete rather than an archive.
 */
export async function deleteCategory(userId: string, id: string): Promise<number> {
  const supabase = await createClient()

  const { count } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('category_id', id)

  const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(`Could not delete the category: ${error.message}`)

  return count ?? 0
}
