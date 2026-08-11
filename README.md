# quality-lab

A release-approval tracker built as a testing and developer-tooling substrate — it exists to be tested, instrumented, and automated against, not to be shipped as a product feature-first. Phase 0 was a monorepo skeleton with no product features. **Phase 1 adds the data layer**: a real Postgres schema with checked-in migrations and a deterministic seed script — still no HTTP endpoints or UI.

## Prerequisites

- Node.js 24 (Active LTS)
- pnpm 11 (`corepack enable` or `npm i -g pnpm@11`; the repo pins `pnpm@11.18.0` via `packageManager`)
- Docker (for `pnpm db:up` — Postgres)

## Run it

```bash
pnpm install
cp .env.example .env   # sets DATABASE_URL and the docker-compose postgres vars
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

That starts the API at `http://localhost:3001` (`GET /health`) and the web app at `http://localhost:3000`, backed by a Postgres database seeded with ~200 releases spanning six months of history. `.env` is gitignored; `.env.example` documents every variable, including the single `DATABASE_URL` the API/drizzle-kit/seed scripts read (kept in sync by hand with the discrete `POSTGRES_*` vars docker-compose uses).

## Seed data

`pnpm db:seed` is a **test fixture, not demo data**: it's driven by a fixed PRNG seed (mulberry32, no dependency), so the same code produces the same 12 users, the same ~200-release status distribution, and the same relationships every run — including deliberate edge cases (a release with no comments, a very long title, unicode/emoji content, a release rejected and resubmitted 3 times, a rolled-back release, and two releases sharing one `created_at` timestamp). The one thing that isn't byte-identical run to run is the absolute timestamps: "last 6 months" is anchored to when you run the seed, not a fixed date, since the whole point is that the data looks like six months of real production history as of today. `pnpm db:seed` truncates and reloads unconditionally, so it's safe to run any number of times, not only right after `pnpm db:reset`.

Seeded users follow a predictable email pattern so tests can reference them by name: `engineer1..6@quality-lab.dev`, `approver1..4@quality-lab.dev`, `admin1..2@quality-lab.dev`.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                          quality-lab                          │
│                                                                 │
│   ┌────────────────┐          ┌────────────────────────┐      │
│   │   apps/web      │          │      apps/api           │     │
│   │   Next.js       │  ─(future)─▶  Fastify               │     │
│   │   Tailwind      │   HTTP    │   route → service       │     │
│   │   shadcn/ui     │          │   → repository (layered)│     │
│   └────────────────┘          └───────────┬──────────────┘     │
│                                            │                    │
│                                            ▼                    │
│                                  ┌────────────────────┐        │
│                                  │   Postgres 16        │        │
│                                  │   (docker-compose)    │        │
│                                  │   users, releases,    │        │
│                                  │   transitions,        │        │
│                                  │   comments, audit_log │        │
│                                  └────────────────────┘        │
│                                                                 │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  packages/shared — Zod schemas, the release state       │    │
│   │  machine (canTransition), and types imported by both    │    │
│   │  apps via the pnpm workspace protocol                   │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                 │
│   Orchestrated by pnpm workspaces + Turborepo. CI runs          │
│   lint → typecheck → test → build, plus a separate              │
│   integration job (migrate → test:integration) against a        │
│   Postgres service container.                                   │
└─────────────────────────────────────────────────────────────┘
```

`apps/api` doesn't yet have a route or service layer reading from Postgres — Phase 1 is schema, migrations, and seed data only. The `db → repository` wiring above describes what Phase 2+ will build on.

## Scripts (run from repo root, via Turborepo/pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Runs `apps/web` and `apps/api` in watch mode |
| `pnpm build` | Builds every workspace |
| `pnpm lint` | Lints every workspace (fails on any warning) |
| `pnpm typecheck` | Type-checks every workspace (including test files) |
| `pnpm test` | Runs unit tests (Vitest) — no database needed |
| `pnpm test:integration` | Runs `apps/api`'s integration tests against a real Postgres |
| `pnpm db:up` / `pnpm db:down` | Starts/stops the Postgres container |
| `pnpm db:generate` | Diffs `apps/api`'s Drizzle schema and generates a new SQL migration |
| `pnpm db:migrate` | Applies pending migrations |
| `pnpm db:reset` | Drops and recreates the `public` schema, then re-migrates (does not seed) |
| `pnpm db:seed` | Loads the deterministic fixture data (see [Seed data](#seed-data)) |

## Decisions

Non-obvious architectural decisions are recorded as ADRs in [`docs/adr`](docs/adr):

- [0001 — Monorepo with a separate API](docs/adr/0001-monorepo-with-separate-api.md)
- [0002 — Foreign-key delete semantics](docs/adr/0002-fk-delete-semantics.md)
- [0003 — Status/role representation: text + CHECK vs native pgEnum](docs/adr/0003-status-role-representation.md)
- [0004 — Denormalized release status alongside the transitions log](docs/adr/0004-denormalized-release-status.md)
- [0005 — Postgres driver: postgres.js over pg](docs/adr/0005-postgres-driver.md)

## Project rules

See [`CLAUDE.md`](CLAUDE.md) for the fixed stack, layering rules, and engineering conventions this repo follows.
