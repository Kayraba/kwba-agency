# PWOS — Personal Wealth Operating System

A single-user finance dashboard. Phase 0 (foundation) and Phase 1 (the ledger)
are built; the phases after them are described in the master build brief and in
`docs/adr/`.

Nothing in this app is financial advice. It describes, calculates and compares,
and stops there.

## What works today

- Magic-link sign in, restricted to one email address, checked on every request.
- A protected mobile shell with bottom navigation, dark and light themes, and a
  numeric keypad wherever numbers are typed.
- Accounts: create, edit, archive, delete, with opening balance and overdraft
  limit. Balances are derived from the ledger, never stored.
- Categories: seeded defaults on first sign-in, plus full management, with a
  `fixed` flag that keeps committed costs out of the day-to-day budget.
- Quick add: open, type, tap a category, log. Three taps, under five seconds.
- The ledger: grouped by month with running totals, filtered by month and
  category, void-and-correct instead of edit.
- Position: balance, overdraft headroom and this month's flow — recorded facts
  only. Burn rate, affordability and clearance dates arrive with Phase 2.

## Getting it running

### 1. Supabase

Create a project, then in the SQL editor run `supabase/migrations/0001_init.sql`
in full. It creates every table, the derived views, the append-only trigger and
RLS on everything.

In **Authentication → Providers → Email**, turn on email sign-in and turn *off*
"Confirm email" only if you want the first magic link to sign you straight in.
In **Authentication → URL Configuration**, set the Site URL to where the app
runs and add `<site>/auth/callback` to the redirect allow-list.

### 2. Environment

```bash
cp .env.example .env.local
```

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, from Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key. Public by design; RLS is the protection |
| `PWOS_ALLOWED_EMAIL` | The one address permitted to sign in |
| `NEXT_PUBLIC_SITE_URL` | Public origin, used to build the magic-link callback |

There is no service-role key anywhere in the app. If one is ever added it goes
in a `server-only` module and never near a handler that takes user input.

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Deploy to Vercel

Import the repository, set **Root Directory** to `pwos`, and add the four
environment variables above with `NEXT_PUBLIC_SITE_URL` set to the deployment
URL. Then add that same URL plus `/auth/callback` to Supabase's redirect
allow-list.

The Supabase free tier pauses a project after a week of inactivity, so the first
request after a quiet spell can fail while the database wakes. The error
boundary in `app/(app)/error.tsx` says so rather than showing a blank screen.

## Tests

```bash
npm test          # unit: money, dates, calculations, grouping, components
npm run typecheck # tsc --noEmit
npm run e2e       # Playwright, at phone width
```

The unit suite needs nothing but Node. Two suites are opt-in because they need a
real database:

**RLS.** Proves that a second user gets zero rows from every table. Point it at
a scratch project — it creates and deletes users, so never at the one holding
real data:

```bash
PWOS_RLS_URL=https://xxxx.supabase.co \
PWOS_RLS_ANON_KEY=... \
PWOS_RLS_SERVICE_ROLE_KEY=... \
npx vitest run tests/rls
```

**The full sign-in round trip.** Generates a real magic link and follows it:

```bash
PWOS_E2E_URL=... PWOS_E2E_SERVICE_ROLE_KEY=... PWOS_E2E_EMAIL=... npm run e2e
```

`PWOS_E2E_CHROMIUM` points Playwright at an already-installed Chromium, for CI
images that pin one.

## Layout

```
app/                 routes; server components by default
  (auth)/            sign-in, unauthenticated
  (app)/             everything behind requireUser()
components/ui/       primitives: Button, Field, Money, Meter, Sheet, Chip
components/shell/    header and bottom navigation
features/<name>/     one folder per domain: service, actions, schema, components
lib/                 money, dates, auth, Supabase clients, db types
supabase/migrations/ numbered SQL, forward-only
docs/adr/            one file per decision worth defending
docs/                the master build brief this was built from
```

`features/<name>/service.ts` is the only place that queries the database.
Components call actions; actions validate and call services; services call
Postgres. A component never queries directly.

Where a feature has arithmetic that does not need the database — `derive.ts` in
accounts, `group.ts` in transactions, `calc.ts` in analytics — it lives in its
own file beside the service. `service.ts` is `server-only`, and anything that
just adds up should be testable without a database.

## The rules

`CLAUDE.md` holds the non-negotiables — integer minor units, an append-only
ledger, derived totals, RLS on every table, server-side auth, and the visual
separation of recorded facts from calculated figures. Read it before changing
anything.

Two things in the stack are named there but not yet installed, because nothing
uses them: Recharts (no charts until Phase 5) and Testing Library's jest-dom
matchers (the component tests assert on attributes directly).
