# 3. Profiles are created in application code, not by a database trigger

Status: accepted · 2026-09-05

## Context

A new user has a row in `auth.users` and nothing else. Something has to create
their `profiles` row and seed the default categories. The usual Supabase
pattern is an `AFTER INSERT` trigger on `auth.users`.

## Decision

`features/profile/service.ts` creates the profile on first sight of a user who
does not have one, and calls `seed_default_categories` on the same trip. The
protected layout calls it, so it happens once, before any page renders.

## Consequences

The migration touches only the `public` schema, which means it runs on any
Postgres and needs no privileges on `auth`. It also means the bootstrap is
visible in the code path rather than in a trigger nobody remembers.

The cost is one extra `select` per request. It is wrapped in React's `cache()`,
so it is one query per request rather than one per component.

Two simultaneous first requests could both try to insert. The categories seed is
`ON CONFLICT DO NOTHING` and the profile insert is on a primary key, so the
loser of the race fails cleanly rather than duplicating anything.
