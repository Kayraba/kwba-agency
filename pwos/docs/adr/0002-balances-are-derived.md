# 2. Balances are a view, never a column

Status: accepted · 2026-09-05

## Context

Every account screen needs a current balance. The obvious implementation is a
`current_balance_minor` column kept up to date on write.

## Decision

`account_balances` is a view: opening balance plus the sum of the non-void
ledger rows. There is no stored balance anywhere.

## Consequences

The number on the screen and the number the ledger implies cannot disagree,
because they are the same number. No backfill job, no drift, no reconciliation
screen.

The cost is a `SUM` per read. At one person's transaction volume this is
irrelevant for years. If it ever stops being irrelevant, the fix is a
materialised view refreshed on write — and a new ADR saying what made it
necessary, with the measurement that showed it.
