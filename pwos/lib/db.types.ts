/**
 * Hand-written database types.
 *
 * These mirror supabase/migrations/*.sql. They are written by hand rather than
 * generated because the schema is small and a generated 2,000-line file is worse
 * to review than a hundred lines someone read. If they drift from the migration,
 * the migration is right.
 */

export type AccountKind =
  | 'current'
  | 'savings'
  | 'cash'
  | 'credit_card'
  | 'loan'
  | 'investment'
  | 'other'

export type FlowDirection = 'in' | 'out'

export type TxnSource = 'manual' | 'csv_import' | 'recurring' | 'correction'

export type RecurFreq = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'

export type GoalState = 'active' | 'paused' | 'achieved' | 'abandoned'

export interface ProfileRow {
  id: string
  display_name: string | null
  base_currency: string
  timezone: string
  theme: string
  created_at: string
  updated_at: string
}

export interface AccountRow {
  id: string
  user_id: string
  name: string
  institution: string | null
  kind: AccountKind
  currency: string
  opening_balance_minor: number
  overdraft_limit_minor: number
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface AccountBalanceRow {
  account_id: string
  user_id: string
  opening_balance_minor: number
  balance_minor: number
  overdraft_limit_minor: number
  headroom_minor: number
}

export interface CategoryRow {
  id: string
  user_id: string
  name: string
  direction: FlowDirection
  parent_id: string | null
  is_fixed: boolean
  colour: string | null
  created_at: string
}

export interface TransactionRow {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  direction: FlowDirection
  amount_minor: number
  currency: string
  occurred_on: string
  merchant: string | null
  notes: string | null
  source: TxnSource
  external_id: string | null
  import_id: string | null
  corrects_id: string | null
  is_void: boolean
  created_at: string
}
