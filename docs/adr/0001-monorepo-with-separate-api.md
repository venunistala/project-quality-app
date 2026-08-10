# 1. Monorepo with a separate API app

## Context

`quality-lab` needs a web UI (Next.js/Tailwind/shadcn) and a backend (Fastify/Drizzle/Postgres), plus shared types/schemas consumed by both. We need to decide how these pieces are organized and how the web app talks to the backend.

## Options considered

1. **Single Next.js app, API routes inside it.** Simplest to run (one process, one deploy), but couples the release-approval domain logic to Next's request lifecycle, makes route→service→repository layering awkward to enforce, and this project exists specifically to be tested/instrumented as a backend — API routes buried inside Next make that harder to isolate.
2. **Separate repos for web and api.** Clean separation, but shared Zod schemas would need to be published/versioned as an external package, adding release overhead this project doesn't need yet.
3. **Monorepo (pnpm workspaces + Turborepo) with `apps/web`, `apps/api`, and `packages/shared`.** One repo, one CI pipeline, shared types imported directly (no publishing step), each app still runs and deploys independently.

## Decision

Go with option 3: a pnpm + Turborepo monorepo, `apps/web` (Next.js) and `apps/api` (Fastify) as independent deployable apps, `packages/shared` holding the Zod schemas and types both apps import directly via the workspace protocol.

## Tradeoffs

- Gains: single install/lint/typecheck/test/build pipeline; shared request/response shapes are always in sync (no drift between a published package version and its consumers); route→service→repository layering is enforced naturally since the API is its own process with no framework leaking into web.
- Costs: two runtimes to run locally in dev (`turbo run dev` starts both); Turborepo/pnpm workspace config is one more thing to maintain versus a single app; deploying now means shipping two artifacts (a Next.js build and a Fastify Docker image) instead of one.
