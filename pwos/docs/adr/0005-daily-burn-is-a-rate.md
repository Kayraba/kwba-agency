# 5. Daily burn is a rate, and is allowed to be fractional

Status: accepted · 2026-09-05

## Context

Money in PWOS is an integer number of minor units. `dailyBurn` is defined as the
mean daily outgoing over a trailing window — £1,000.00 over 90 days is
1111.11… pence a day, which is not an integer.

## Decision

`dailyBurn()` returns a plain `number`: a rate in minor units per day, not a
money amount. `runwayDays()` divides by the unrounded rate. Rounding happens
only if the burn is displayed.

## Consequences

The no-floats rule is about *stored and transacted* amounts, not about
intermediate arithmetic — and the brief is explicit that intermediate values are
never rounded. Rounding the burn to 1111 and then dividing a £580 headroom by it
moves the runway by a day at that scale, and by more as the window shortens.

The risk is that a fractional value escapes into somewhere that expects minor
units. `assertMinor` in `lib/money.ts` throws on a non-integer, so the failure
is loud and immediate rather than a penny that quietly does not add up.
