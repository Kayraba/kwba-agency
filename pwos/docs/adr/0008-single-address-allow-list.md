# 8. Authentication is a magic link to one permitted address

Status: accepted · 2026-09-05

## Context

PWOS has exactly one user. Sign-up, password reset, email verification and
account recovery are all features for a product with more than one.

## Decision

Email magic link only. `PWOS_ALLOWED_EMAIL` names the single address that may
sign in. The check runs server-side in three places: before a link is sent, in
the callback that exchanges the code, and in `getUser()` on every request.

## Consequences

There is no password to leak and no sign-up flow to abuse. A session minted
before the allow-list changed stops working the moment it does, because the
check is per-request rather than at sign-in.

The sign-in form returns the same "check your email" response whether the
address matched or not, so the page cannot be used to find out whose app it is.

Every table still carries `user_id` with RLS. That is what makes a second user
possible later without a redesign, and it is the only part of multi-user that
had to be decided now.
