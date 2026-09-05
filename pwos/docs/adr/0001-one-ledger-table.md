# 1. One ledger table, not one per direction

Status: accepted · 2026-09-05

## Context

Volume 4 of the specification calls for `income_transactions` and
`expense_transactions` as separate tables.

## Decision

A single `transactions` table with a `direction` enum (`in` / `out`).

## Consequences

Cash flow, budgets, net worth and every report need both sides at once. Two
tables would make each of those a UNION, and every bug in them would have to be
fixed twice. The `direction` column costs one byte and the indexes are the same
either way.

Amounts are stored positive; `direction` carries the sign. `lib/money.ts`
exposes `signed(direction, amount)` so nothing else has to remember that.
