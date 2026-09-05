# 6. A settled row is voided and replaced, never edited

Status: accepted · 2026-09-05

## Context

Mistakes get typed. The obvious affordance is an edit form.

## Decision

`amount_minor`, `occurred_on`, `direction` and `account_id` are immutable after
insert, enforced by the `transactions_no_edit` trigger. The UI offers "void" and
"correct". Correcting writes a new row with `corrects_id` pointing at the
original and voids the original. Both rows stay.

## Consequences

A figure that was right in March is still right in March, however many times you
revisit it. That is the entire reason for keeping historical reports.

Voided rows appear in the list, struck through, and are excluded from every
total. This is deliberate: the history should show that a mistake was made and
fixed, not that it never happened.

`correctTransaction` writes the replacement first and voids the original second.
If the void fails, the replacement is deleted rather than left alongside the
original — two live rows would double-count, which is worse than the correction
failing.

Category, merchant and notes remain editable. None of them changes a balance.
