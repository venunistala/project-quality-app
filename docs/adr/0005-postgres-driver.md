# 5. Postgres driver: `postgres` (postgres.js) over `pg`

## Context

Drizzle ORM is fixed by the project stack, but Drizzle needs an underlying Postgres driver to
actually open connections — it doesn't ship one itself. `apps/api` needs to pick one, used by the
Fastify app, the migration script, the reset script, and the seed script alike.

## Options considered

1. **`pg` (node-postgres).** The long-standing default, widely used, well documented. Ships a
   native binding path historically (`pg-native`, optional) and a separate `pg-pool` package for
   pooling; its core API is callback/event-emitter rooted with a promise wrapper layered on top.
2. **`postgres` (postgres.js).** Pure JavaScript, no native binding chain to install or break on
   a given OS/CI image, promise-first API designed around `async`/`await` and tagged-template
   queries, built-in connection pooling with no separate package. Drizzle's own documentation and
   examples default to it for new projects.
3. **`@vercel/postgres` or another platform-specific client.** Ties the driver to a specific
   hosting platform's connection model (e.g. HTTP-based pooling for serverless/edge). This project
   runs as a long-lived Fastify process against a plain Docker Postgres, not a serverless
   platform, so a platform-specific driver would be solving a problem this project doesn't have.

## Decision

Go with option 2: the `postgres` package. It's pure JS (nothing to compile or fail to compile on
a given Windows dev machine, Docker image, or CI runner), its promise-first API fits both
Fastify's async request handlers and the short-lived, script-style migrate/reset/seed entrypoints
better than `pg`'s older callback-rooted shape, and connection pooling is built in rather than a
separate dependency to add and configure. For a service with no unusual pooling requirements,
it's the more boring, lower-friction choice of the two.

## Tradeoffs

- Gains: no native-binding install step to go wrong across dev/CI/Docker environments; one
  package instead of `pg` + `pg-pool` (+ `@types/pg`, since `postgres` ships its own types);
  `async`/`await` throughout, including the short migrate/reset/seed scripts that only need a
  handful of statements and a clean exit.
- Costs: smaller (though still large) community/ecosystem than `pg`, which remains the more
  commonly-seen driver in tutorials and Stack Overflow answers; switching later, if ever needed,
  touches every place a raw connection is opened (the Fastify app, `migrate.ts`, `reset.ts`,
  `seed.ts`).
