# 9. PWOS lives in `pwos/` inside the agency repository

Status: accepted · 2026-09-05

## Context

The repository already holds the KWBA agency site: an Express server, a static
`public/` directory, CommonJS, deployed to Render. PWOS is a Next.js app on
Vercel with its own dependency tree and module system.

## Decision

PWOS is a self-contained directory with its own `package.json`, lockfile,
tooling and deployment. Nothing at the repository root changes.

## Consequences

The agency deployment is untouched: Render still builds from the root, and the
root `package.json` gains no dependencies. Vercel points at `pwos/` as its root
directory.

Next has to be told where its root is, because it otherwise infers the parent
directory from the lockfile it finds there — hence `turbopack.root` and
`outputFileTracingRoot` in `next.config.ts`.

The alternative, a separate repository, was rejected only because the GitHub
access for this work is scoped to this one. If PWOS outgrows that, moving the
directory out is a `git filter-repo` away and nothing in the app depends on its
parent.
