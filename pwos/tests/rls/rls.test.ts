/**
 * Row Level Security, proved rather than assumed.
 *
 * Creates two real users in a Supabase project, writes a row into every table as
 * the first, and checks that the second sees nothing and can write nothing on the
 * first's behalf. RLS is the only thing standing between the two, so it is the
 * one thing worth testing against a real database instead of a mock.
 *
 * Opt-in. Point it at a scratch project — it creates and deletes users:
 *
 *   PWOS_RLS_URL=https://xxxx.supabase.co \
 *   PWOS_RLS_ANON_KEY=... \
 *   PWOS_RLS_SERVICE_ROLE_KEY=... \
 *   npx vitest run tests/rls
 *
 * Never point it at the project holding real data.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.PWOS_RLS_URL
const anonKey = process.env.PWOS_RLS_ANON_KEY
const serviceKey = process.env.PWOS_RLS_SERVICE_ROLE_KEY
const configured = Boolean(url && anonKey && serviceKey)

/** Every table the migration creates. A new table without a row here is a gap. */
const TABLES = [
  'accounts',
  'categories',
  'transactions',
  'recurring_rules',
  'budgets',
  'goals',
  'goal_contributions',
  'import_batches',
] as const

const VIEWS = ['account_balances', 'goal_progress'] as const

interface Actor {
  id: string
  email: string
  client: SupabaseClient
}

const password = 'rls-test-password-6f2a'

describe.skipIf(!configured)('row level security', () => {
  let admin: SupabaseClient
  let alice: Actor
  let bob: Actor
  let aliceAccountId: string
  let aliceGoalId: string

  async function makeUser(label: string): Promise<Actor> {
    const email = `pwos-rls-${label}-${Date.now()}@example.test`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Could not create ${label}: ${error?.message}`)

    const client = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(`Could not sign in ${label}: ${signInError.message}`)

    return { id: data.user.id, email, client }
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    alice = await makeUser('alice')
    bob = await makeUser('bob')

    // Alice fills every table with one row of her own.
    const insert = async (table: string, row: Record<string, unknown>) => {
      const { data, error } = await alice.client
        .from(table)
        .insert({ ...row, user_id: alice.id })
        .select('id')
        .single()
      if (error) throw new Error(`Seeding ${table} failed: ${error.message}`)
      return data.id as string
    }

    await alice.client.from('profiles').insert({ id: alice.id })
    await bob.client.from('profiles').insert({ id: bob.id })

    aliceAccountId = await insert('accounts', {
      name: 'Alice current',
      kind: 'current',
      opening_balance_minor: 10_000,
      overdraft_limit_minor: 50_000,
    })
    const categoryId = await insert('categories', { name: 'Groceries', direction: 'out' })
    await insert('transactions', {
      account_id: aliceAccountId,
      category_id: categoryId,
      direction: 'out',
      amount_minor: 1_234,
      occurred_on: '2026-03-01',
    })
    await insert('recurring_rules', {
      account_id: aliceAccountId,
      label: 'Rent',
      direction: 'out',
      amount_minor: 55_000,
      frequency: 'monthly',
      starts_on: '2026-01-01',
    })
    await insert('budgets', {
      category_id: categoryId,
      period_start: '2026-03-01',
      period_end: '2026-03-31',
      target_minor: 20_000,
    })
    aliceGoalId = await insert('goals', { label: 'Emergency fund', target_minor: 300_000 })
    await insert('goal_contributions', {
      goal_id: aliceGoalId,
      amount_minor: 5_000,
      occurred_on: '2026-03-01',
    })
    await insert('import_batches', { kind: 'bank_csv', filename: 'march.csv' })
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    for (const actor of [alice, bob]) {
      if (actor) await admin.auth.admin.deleteUser(actor.id)
    }
  }, 60_000)

  it('gives the owner her own rows', async () => {
    for (const table of TABLES) {
      const { data, error } = await alice.client.from(table).select('id')
      expect(error, `${table} as owner`).toBeNull()
      expect(data?.length, `${table} as owner`).toBeGreaterThan(0)
    }
  })

  it.each(TABLES)('returns zero rows from %s to another user', async (table) => {
    const { data, error } = await bob.client.from(table).select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it.each(VIEWS)('returns zero rows from the %s view to another user', async (view) => {
    const { data, error } = await bob.client.from(view).select('*')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('does not leak another user’s profile', async () => {
    const { data } = await bob.client.from('profiles').select('*').eq('id', alice.id)
    expect(data).toEqual([])
  })

  it('refuses a write stamped with another user’s id', async () => {
    const { error } = await bob.client.from('accounts').insert({
      user_id: alice.id,
      name: 'Injected',
      kind: 'current',
    })
    expect(error).not.toBeNull()
    // 42501: insufficient privilege — the WITH CHECK clause rejected it.
    expect(error?.code).toBe('42501')
  })

  it('refuses an update to another user’s row', async () => {
    const { data, error } = await bob.client
      .from('accounts')
      .update({ name: 'Taken over' })
      .eq('id', aliceAccountId)
      .select('id')

    // RLS makes the row invisible, so the update matches nothing rather than failing.
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: still } = await alice.client
      .from('accounts')
      .select('name')
      .eq('id', aliceAccountId)
      .single()
    expect(still?.name).toBe('Alice current')
  })

  it('refuses a delete of another user’s row', async () => {
    await bob.client.from('goals').delete().eq('id', aliceGoalId)
    const { data } = await alice.client.from('goals').select('id').eq('id', aliceGoalId)
    expect(data).toHaveLength(1)
  })

  it('refuses to log the same recurring occurrence twice', async () => {
    // The unique index from migration 0002 is what makes confirming a forecast
    // idempotent. Without it, a double tap logs the rent twice.
    const { data: rule } = await alice.client
      .from('recurring_rules')
      .select('id, account_id')
      .eq('user_id', alice.id)
      .single()

    const occurrence = {
      user_id: alice.id,
      account_id: rule!.account_id,
      direction: 'out',
      amount_minor: 55_000,
      occurred_on: '2026-04-01',
      source: 'recurring',
      recurring_rule_id: rule!.id,
    }

    const { error: first } = await alice.client.from('transactions').insert(occurrence)
    expect(first).toBeNull()

    const { error: second } = await alice.client.from('transactions').insert(occurrence)
    expect(second?.code).toBe('23505')

    // A different date from the same rule is fine.
    const { error: other } = await alice.client
      .from('transactions')
      .insert({ ...occurrence, occurred_on: '2026-05-01' })
    expect(other).toBeNull()
  })

  it('will not let a category be a subscription without being fixed', async () => {
    const { error } = await alice.client.from('categories').insert({
      user_id: alice.id,
      name: 'Impossible',
      direction: 'out',
      is_fixed: false,
      is_subscription: true,
    })
    // 23514: check constraint violation.
    expect(error?.code).toBe('23514')
  })

  it('keeps the ledger append-only even for the owner', async () => {
    const { data: row } = await alice.client
      .from('transactions')
      .select('id, amount_minor')
      .eq('user_id', alice.id)
      .is('recurring_rule_id', null)
      .single()

    const { error } = await alice.client
      .from('transactions')
      .update({ amount_minor: 999_999 })
      .eq('id', row!.id)

    expect(error?.message).toMatch(/append-only/)

    // Voiding is the one edit that is allowed.
    const { error: voidError } = await alice.client
      .from('transactions')
      .update({ is_void: true })
      .eq('id', row!.id)
    expect(voidError).toBeNull()
  })
})

describe.skipIf(configured)('row level security', () => {
  it('is skipped without a scratch Supabase project configured', () => {
    expect(configured).toBe(false)
  })
})
