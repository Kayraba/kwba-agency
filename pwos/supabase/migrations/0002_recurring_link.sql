-- PWOS 0002_recurring_link.sql
-- Phase 2: tie a materialised ledger row back to the rule that predicted it.
-- Postgres 15 / Supabase. Forward-only. Safe on a database with data in it:
-- one nullable column and two indexes, no rewrite of existing rows.

-- A forecast is not a ledger row. When the date arrives and the user confirms
-- it, we insert a real transaction and record which rule produced it. Without
-- this link there is no way to tell an already-confirmed occurrence from one
-- still outstanding, and the same rent payment gets logged twice.
alter table transactions
  add column if not exists recurring_rule_id uuid
    references recurring_rules on delete set null;

-- One rule can produce at most one row per date. This is the constraint that
-- makes confirming a forecast idempotent: a double tap, a retried request or a
-- second open tab all hit the same unique index and the second one loses.
create unique index if not exists txn_recurring_occurrence_uniq
  on transactions (user_id, recurring_rule_id, occurred_on)
  where recurring_rule_id is not null;

-- Reading "what has this rule already produced" is the hot path on the Position
-- screen, so it gets its own index rather than filtering the date index.
create index if not exists txn_recurring_idx
  on transactions (user_id, recurring_rule_id)
  where recurring_rule_id is not null;

-- ON DELETE SET NULL above is deliberate: deleting a rule must never delete the
-- payments it predicted. Those are real money that really moved. The row simply
-- stops knowing which rule anticipated it.

-- Budgets are per category per period, and the app writes one row per category
-- per month. Without this, editing a budget twice creates two rows and the
-- actual-vs-target comparison silently doubles the target.
create unique index if not exists budgets_period_category_uniq
  on budgets (user_id, category_id, period_start, period_end)
  where category_id is not null;

-- The surplus calculation subtracts fixed costs and subscriptions separately,
-- so something has to tell them apart. A subscription is a fixed cost you could
-- cancel this afternoon, which is exactly why it earns its own line on the
-- Position screen instead of disappearing into a single committed-costs total.
alter table categories
  add column if not exists is_subscription boolean not null default false;

-- A subscription is a kind of fixed cost, never an alternative to one. Enforcing
-- it here means no screen has to remember to check both flags.
alter table categories
  drop constraint if exists categories_subscription_is_fixed;
alter table categories
  add constraint categories_subscription_is_fixed
    check (not is_subscription or is_fixed);

-- Seed: the default category set ships with a Subscriptions category, and an
-- existing user should not have to go and tick the box by hand.
update categories
   set is_subscription = true
 where is_fixed
   and lower(name) = 'subscriptions';

-- Later signups get it from the seed function rather than this one-off update.
create or replace function seed_default_categories(p_user uuid) returns void
language sql as $$
  insert into categories (user_id, name, direction, is_fixed, is_subscription) values
    (p_user, 'Wages',          'in',  false, false),
    (p_user, 'Business',       'in',  false, false),
    (p_user, 'Other income',   'in',  false, false),
    (p_user, 'Rent',           'out', true,  false),
    (p_user, 'Subscriptions',  'out', true,  true),
    (p_user, 'Phone',          'out', true,  false),
    (p_user, 'Gym',            'out', true,  false),
    (p_user, 'Groceries',      'out', false, false),
    (p_user, 'Food out',       'out', false, false),
    (p_user, 'Transport',      'out', false, false),
    (p_user, 'University',     'out', false, false),
    (p_user, 'Fun',            'out', false, false),
    (p_user, 'Other',          'out', false, false)
  on conflict do nothing;
$$;

-- RLS: transactions, budgets and categories already have policies from 0001, and
-- a new column inherits them. Nothing to add.
