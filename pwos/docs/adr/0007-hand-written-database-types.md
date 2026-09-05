# 7. Database types are written by hand

Status: accepted · 2026-09-05

## Context

`supabase gen types typescript` produces a `Database` type that the client can
be parameterised with, giving fully typed queries.

## Decision

`lib/db.types.ts` is written by hand and mirrors the migrations. The Supabase
client is not parameterised with a generated `Database` type.

## Consequences

The file is about a hundred lines that someone can read in a code review, rather
than two thousand generated ones that nobody does. It also removes a generation
step from the workflow, which at one developer is a step that would be skipped.

The cost is that the types can drift from the schema. The migration is the
source of truth, the RLS suite runs against a real database, and the schema is
small enough that drift shows up on the next query rather than in production.

Revisit if the schema passes roughly twenty tables, or as soon as a second
person is writing migrations.
