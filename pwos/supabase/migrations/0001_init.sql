-- PWOS 0001_init.sql
-- Phases 0-3: identity, ledger, recurring, budgets, goals.
-- Postgres 15 / Supabase. Forward-only. Run on an empty database.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- helpers

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- identity

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  base_currency char(3)     not null default 'GBP',
  timezone      text        not null default 'Europe/London',
  theme         text        not null default 'system',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- accounts

create type account_kind as enum
  ('current','savings','cash','credit_card','loan','investment','other');

create table accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  name            text not null,
  institution     text,
  kind            account_kind not null default 'current',
  currency        char(3) not null default 'GBP',
  -- opening_balance_minor is the only stored balance; current balance is derived
  opening_balance_minor bigint not null default 0,
  overdraft_limit_minor bigint not null default 0 check (overdraft_limit_minor >= 0),
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index accounts_user_idx on accounts (user_id) where is_archived = false;
create trigger accounts_updated before update on accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- categories

create type flow_direction as enum ('in','out');

create table categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  direction  flow_direction not null,
  parent_id  uuid references categories on delete set null,
  is_fixed   boolean not null default false,   -- rent, subscriptions: excluded from day-to-day budget
  colour     text,
  created_at timestamptz not null default now(),
  unique (user_id, name, direction)
);

create index categories_user_idx on categories (user_id, direction);

-- ---------------------------------------------------------------- ledger

create type txn_source as enum ('manual','csv_import','recurring','correction');

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  account_id    uuid not null references accounts on delete restrict,
  category_id   uuid references categories on delete set null,
  direction     flow_direction not null,
  amount_minor  bigint not null check (amount_minor > 0),  -- always positive; direction carries sign
  currency      char(3) not null default 'GBP',
  occurred_on   date not null,
  merchant      text,
  notes         text,
  source        txn_source not null default 'manual',
  external_id   text,                                       -- broker/bank row id, for dedupe
  import_id     uuid,
  corrects_id   uuid references transactions on delete set null,
  is_void       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index txn_user_date_idx  on transactions (user_id, occurred_on desc);
create index txn_account_idx    on transactions (account_id, occurred_on desc);
create index txn_category_idx   on transactions (user_id, category_id);
create unique index txn_external_uniq
  on transactions (user_id, external_id) where external_id is not null;

-- Append-only guard: amount, date, direction and account are immutable once written.
create or replace function transactions_immutable() returns trigger
language plpgsql as $$
begin
  if (new.amount_minor, new.occurred_on, new.direction, new.account_id)
     is distinct from (old.amount_minor, old.occurred_on, old.direction, old.account_id) then
    raise exception 'transactions are append-only: void this row and insert a correction';
  end if;
  return new;
end $$;

create trigger transactions_no_edit before update on transactions
  for each row execute function transactions_immutable();

-- Derived balance per account.
create view account_balances as
select a.id as account_id,
       a.user_id,
       a.opening_balance_minor
         + coalesce(sum(case when t.direction = 'in' then t.amount_minor
                             else -t.amount_minor end), 0) as balance_minor,
       a.overdraft_limit_minor,
       a.opening_balance_minor
         + coalesce(sum(case when t.direction = 'in' then t.amount_minor
                             else -t.amount_minor end), 0)
         + a.overdraft_limit_minor as headroom_minor
from accounts a
left join transactions t
  on t.account_id = a.id and t.is_void = false
group by a.id;

-- ---------------------------------------------------------------- recurring

create type recur_freq as enum ('weekly','fortnightly','monthly','quarterly','yearly');

create table recurring_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  account_id    uuid not null references accounts on delete cascade,
  category_id   uuid references categories on delete set null,
  label         text not null,
  direction     flow_direction not null,
  amount_minor  bigint not null check (amount_minor > 0),
  frequency     recur_freq not null,
  day_of_month  smallint check (day_of_month between 1 and 31),
  day_of_week   smallint check (day_of_week between 0 and 6),
  starts_on     date not null,
  ends_on       date,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index recurring_user_idx on recurring_rules (user_id) where is_active;
create trigger recurring_updated before update on recurring_rules
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- budgets

create table budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  category_id   uuid references categories on delete cascade,
  period_start  date not null,
  period_end    date not null,
  target_minor  bigint not null check (target_minor >= 0),
  created_at    timestamptz not null default now(),
  check (period_end > period_start)
);

create index budgets_user_period_idx on budgets (user_id, period_start desc);

-- ---------------------------------------------------------------- goals

create type goal_state as enum ('active','paused','achieved','abandoned');

create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  label         text not null,
  description   text,
  target_minor  bigint not null check (target_minor > 0),
  priority      integer not null default 100,   -- lower runs first in the ladder
  target_date   date,
  state         goal_state not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index goals_user_priority_idx on goals (user_id, priority) where state = 'active';
create trigger goals_updated before update on goals
  for each row execute function set_updated_at();

create table goal_contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  goal_id      uuid not null references goals on delete cascade,
  amount_minor bigint not null check (amount_minor <> 0),
  occurred_on  date not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index goal_contrib_idx on goal_contributions (goal_id, occurred_on desc);

create view goal_progress as
select g.id as goal_id, g.user_id, g.label, g.target_minor, g.priority, g.state,
       coalesce(sum(c.amount_minor), 0) as saved_minor,
       greatest(g.target_minor - coalesce(sum(c.amount_minor), 0), 0) as remaining_minor
from goals g
left join goal_contributions c on c.goal_id = g.id
group by g.id;

-- ---------------------------------------------------------------- imports

create table import_batches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  kind          text not null,            -- 't212_transactions', 'bank_csv', ...
  filename      text,
  row_count     integer not null default 0,
  inserted_count integer not null default 0,
  skipped_count integer not null default 0,
  status        text not null default 'pending',
  error         text,
  created_at    timestamptz not null default now()
);

create index import_user_idx on import_batches (user_id, created_at desc);

-- ---------------------------------------------------------------- RLS

alter table profiles            enable row level security;
alter table accounts            enable row level security;
alter table categories          enable row level security;
alter table transactions        enable row level security;
alter table recurring_rules     enable row level security;
alter table budgets             enable row level security;
alter table goals               enable row level security;
alter table goal_contributions  enable row level security;
alter table import_batches      enable row level security;

create policy own_row on profiles
  using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','recurring_rules',
                           'budgets','goals','goal_contributions','import_batches']
  loop
    execute format(
      'create policy own_row on %I using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t);
  end loop;
end $$;

-- Views inherit RLS from their base tables when created with security_invoker.
alter view account_balances set (security_invoker = on);
alter view goal_progress    set (security_invoker = on);

-- ---------------------------------------------------------------- seed defaults

create or replace function seed_default_categories(p_user uuid) returns void
language sql as $$
  insert into categories (user_id, name, direction, is_fixed) values
    (p_user, 'Wages',          'in',  false),
    (p_user, 'Business',       'in',  false),
    (p_user, 'Other income',   'in',  false),
    (p_user, 'Rent',           'out', true),
    (p_user, 'Subscriptions',  'out', true),
    (p_user, 'Phone',          'out', true),
    (p_user, 'Gym',            'out', true),
    (p_user, 'Groceries',      'out', false),
    (p_user, 'Food out',       'out', false),
    (p_user, 'Transport',      'out', false),
    (p_user, 'University',     'out', false),
    (p_user, 'Fun',            'out', false),
    (p_user, 'Other',          'out', false)
  on conflict do nothing;
$$;
