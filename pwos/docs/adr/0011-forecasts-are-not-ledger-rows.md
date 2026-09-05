# 11. A forecast is never written to the ledger until it is confirmed

Status: accepted · 2026-09-05

## Context

Recurring rules predict payments. The obvious implementation is a job that
inserts the transaction when the date arrives.

## Decision

Occurrences are computed on read, in memory, by `occurrencesBetween`. Nothing is
written until the user taps "Log it". Migration 0002 adds
`transactions.recurring_rule_id` and a unique index on
`(user_id, recurring_rule_id, occurred_on)`.

## Consequences

The ledger holds what happened, not what a rule expected. That is what keeps it
trustworthy: a standing order that failed, a subscription cancelled mid-month, a
landlord who took the rent on the 3rd — none of them quietly become a fact
because a cron job fired.

It also means no cron job, no worker, and nothing to go wrong while the free-tier
project is paused. The forecast is correct the moment the page loads, however
long the app has been sitting idle.

Confirming is idempotent because the unique index says so rather than because the
handler is careful. A double tap, a retried request or a second tab all fail at
the database and the action reports "already logged".

A voided occurrence returns to due, and re-confirming restores the voided row
rather than inserting a second one — the voided row still occupies that
(rule, date) slot, and voiding is how you say the payment did not happen.

Deleting a rule sets the column to null rather than cascading. The payments it
predicted really moved; forgetting which rule anticipated them is fine, losing
them is not.

## The cost

Every read of the Position screen expands the rules. The expansion is bounded by
the window (this month and next) and by a hard limit of 120 iterations per rule,
and it is two queries either way. If it ever matters, the fix is caching the
expansion, not writing rows early.
