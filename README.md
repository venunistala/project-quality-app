# quality-lab

A release-approval tracker built as a testing and developer-tooling substrate — it exists to be tested, instrumented, and automated against, not to be shipped as a product feature-first. This is the **Phase 0 scaffold**: a monorepo skeleton that builds, lints, type-checks, tests, and runs green in CI, with no product features yet.

## Prerequisites

- Node.js 24 (Active LTS)
- pnpm 11 (`corepack enable` or `npm i -g pnpm@11`; the repo pins `pnpm@11.18.0` via `packageManager`)
- Docker (only needed for `pnpm db:up` — Postgres isn't wired into the API yet in Phase 0)

## Run it

```bash
pnpm install
pnpm dev
```

That starts the API at `http://localhost:3001` (`GET /health`) and the web app at `http://localhost:3000`. Both boot with built-in defaults — no `.env` file is required for Phase 0 (copy `.env.example` to `.env` if you want to override ports/log level, or run `pnpm db:up` to bring up Postgres for later phases).

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
│                                    (not wired in Phase 0)       │
│                                            ▼                    │
│                                  ┌────────────────────┐        │
│                                  │   Postgres 16        │        │
│                                  │   (docker-compose)    │        │
│                                  └────────────────────┘        │
│                                                                 │
│   ┌──────────────────────────────────────────────────────┐    │
│   │  packages/shared — Zod schemas + types, imported by    │    │
│   │  both apps via the pnpm workspace protocol             │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                 │
│   Orchestrated by pnpm workspaces + Turborepo. CI runs          │
│   lint → typecheck → test → build on every push/PR.            │
└─────────────────────────────────────────────────────────────┘
```

## Scripts (run from repo root, via Turborepo)

| Command | What it does |
|---|---|
| `pnpm dev` | Runs `apps/web` and `apps/api` in watch mode |
| `pnpm build` | Builds every workspace |
| `pnpm lint` | Lints every workspace (fails on any warning) |
| `pnpm typecheck` | Type-checks every workspace |
| `pnpm test` | Runs unit tests (Vitest) |
| `pnpm db:up` / `pnpm db:down` | Starts/stops the Postgres container |

## Decisions

Non-obvious architectural decisions are recorded as ADRs in [`docs/adr`](docs/adr):

- [0001 — Monorepo with a separate API](docs/adr/0001-monorepo-with-separate-api.md)

## Project rules

See [`CLAUDE.md`](CLAUDE.md) for the fixed stack, layering rules, and engineering conventions this repo follows.
