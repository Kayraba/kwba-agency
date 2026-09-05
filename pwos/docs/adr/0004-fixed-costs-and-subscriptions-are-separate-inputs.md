# 4. Fixed costs and subscriptions are separate inputs to the surplus

Status: accepted · 2026-09-05

## Context

The build brief defines
`surplus = income − fixedCosts − subscriptions − variableBudget`, and separately
says fixed costs and subscriptions both come from categories flagged `is_fixed`.
Read literally, subscriptions are a subset of fixed costs and would be
subtracted twice.

## Decision

`monthlySurplus()` takes `fixedCostsMinor` and `subscriptionsMinor` as separate
figures, and its contract is that the caller must not include subscriptions in
the fixed-costs total. The Position screen shows them as two lines because
"£34 of subscriptions" is worth seeing on its own.

## Consequences

The double-count is impossible to write by accident inside the function, and
possible to write by accident at the call site. The call site therefore has one
job — split the `is_fixed` categories into subscriptions and everything else —
and that split is the only place the rule lives.

The simpler alternative, a single `committedCostsMinor`, was rejected because
losing the subscriptions line loses the one committed cost that is actually
easy to cancel.

## Superseded in part

ADR 10 settles where the two figures actually come from — the recurring rules,
split by a new `categories.is_subscription` flag — which is the "one place the
rule lives" this ADR left open.
