# PWOS — Project Rules for Claude Code

Read this before every task. If a request conflicts with these rules, say so and stop.

## What this is

Personal Wealth Operating System. A single-user web app for one person: a UK computer
science student who runs a small web agency, works shift hours, holds a small Trading 212
portfolio, and is clearing an overdraft. Not a SaaS product. Not multi-tenant. Not a startup.

The measure of success is that the owner opens it daily and trusts the numbers. Every
feature is judged against that, not against a spec document.

## Non-negotiables

1. **Money is stored as integer minor units** (`amount_minor BIGINT`, pence). Never floats.
   Currency is a separate column, ISO 4217. Formatting happens in the UI only.
2. **The ledger is append-only.** Corrections are new rows referencing the original via
   `corrects_id`. Never UPDATE a settled financial row's amount or date.
3. **Balances and totals are derived**, never stored as the source of truth. Cache in a
   materialised view or computed column if performance requires it, and document why.
4. **Every table has `user_id` and RLS enabled** with `auth.uid() = user_id` on all four
   operations. A table without RLS does not ship.
5. **Facts, calculations, and AI output are visually distinguished** in the UI. Anything the
   model wrote is labelled as such. No projection is presented as a certainty.
6. **No financial advice.** The app describes, calculates, and compares. It does not
   recommend buying or selling a specific security, and it never states or implies an
   expected return.
7. **Server-side auth on every route.** Never trust a client-supplied `user_id`.
8. **No secrets in client code.** No service-role key outside server-only modules.

## Stack

- Next.js (App Router), React, TypeScript strict mode
- Tailwind CSS
- Supabase: Postgres, Auth, Storage, RLS
- Recharts for charts
- Vitest + Testing Library; Playwright for the critical E2E path
- Vercel for deploy, GitHub for source

Do not add a dependency without stating what it replaces and why the built-in option fails.

## Layout

```
app/                 routes, server components by default
components/ui/       primitives only (Button, Field, Money, Meter)
features/<name>/     one folder per domain: components, hooks, service, types, tests
lib/                 supabase clients, money, dates, formatting
supabase/migrations/ numbered SQL, forward-only
docs/adr/            one file per architectural decision
```

Business logic lives in `features/<name>/service.ts`. Components call hooks; hooks call
services; services call the database. A component never queries the database directly.

## Money and calculation rules

Implement these once in `lib/money.ts` and `features/analytics/calc.ts`, with unit tests
covering the worked examples in the build brief. Never reimplement them inline.

- `surplus = income - fixedCosts - subscriptions - variableBudget` (monthly, minor units)
- `headroom = overdraftLimit + balance` (balance is negative when overdrawn)
- `savingsRate = (income - totalSpend) / income`, returns null when income is 0
- `netWorth = assets - liabilities`, both derived from their own tables
- `runwayDays = floor(headroom / dailyBurn)`, dailyBurn from trailing 90-day mean
- Portfolio P/L is `value - costBasis`. Do not compute annualised or expected returns.

Rounding: half-up, at the point of display only. Never round intermediate values.

## Definition of done

A feature ships when: it works on a 375px screen; it has loading, empty, and error states;
inputs are validated server-side; RLS is proven by a test that queries as another user and
gets zero rows; the service layer has unit tests; and the migration runs clean on an empty
database.

## Working style

- Build one phase at a time. Do not start the next phase until the current one is deployed.
- Prefer deleting a feature to half-building it.
- When a requirement is ambiguous, choose the simpler option and record it in `docs/adr/`.
- Never generate placeholder or seeded fake financial data in the owner's account.
