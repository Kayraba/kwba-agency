# 10. Commitments come from recurring rules, discretionary spend from budgets

Status: accepted · 2026-09-05

## Context

The surplus is `income − fixedCosts − subscriptions − variableBudget`. The build
brief says fixed costs and subscriptions "come from categories flagged
`is_fixed`", and that the variable budget is "the user's own figure, not a
calculated one".

A category flag alone cannot produce a monthly figure. It says *what kind* of
spending something is, not how much of it is coming. Deriving fixed costs from
the history of `is_fixed` categories would mean last month's rent standing in for
next month's, which is wrong in exactly the month a rent rise lands.

## Decision

- **Income, fixed costs and subscriptions** come from the active recurring rules,
  normalised to a month. A rule is a commitment by definition — that is what
  makes it recurring — so every outgoing rule counts. The only question the
  category answers is whether it is a subscription.
- **The variable budget** is the sum of this month's budget rows on categories
  that are neither fixed nor subscriptions.
- A budget on a fixed category is allowed, and is for tracking only. It does not
  feed the surplus.

## Consequences

Nothing can be double-counted. Committed money reaches the surplus through rules;
discretionary money reaches it through budgets; the two sets of categories do not
overlap, and the one case where they could — a budget set on a fixed category —
is excluded by `variableBudgetTotal` and labelled as such on the budgets screen.

The figures are exact rather than inferred. £550 rent is £550 because a rule says
so, not because £550 happened to go out in February.

The cost is that the Position screen is empty until at least one rule exists. It
says so, in those terms, and offers the two links that fix it. An empty screen
that explains itself is better than a surplus computed from one month of partial
history.

An outgoing rule with no category counts as a fixed cost rather than being
dropped. A commitment you have not categorised is still a commitment.

## Where this departs from the brief

The brief's `is_fixed` flag now drives the budget screen's grouping and the
double-count exclusion, rather than being summed directly. `is_subscription` was
added in migration 0002 because the formula needs the two apart and no existing
column could tell them apart.
