Create a CLAUDE.md at the repo root with these project rules, then stop.

PROJECT: quality-lab — a release approval tracker built as a testing and
developer-tooling substrate. It exists to be tested, instrumented, and
automated against, not to be a product.

STACK (fixed, do not substitute):
- pnpm workspaces + Turborepo monorepo
- apps/web: Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- apps/api: Fastify, TypeScript, Zod, Drizzle ORM, Postgres
- packages/shared: shared types, Zod schemas, state machine definition
- Docker Compose for Postgres; GitHub Actions for CI
- Vitest for unit/integration, Playwright for E2E

RULES:
- TypeScript strict mode. No `any`. No non-null assertions without a comment.
- Layering is enforced: route → service → repository. Services never import
  Fastify types. Repositories never contain business rules.
- All request/response shapes defined once in Zod, in packages/shared, and
  reused by both apps.
- No secrets in code. .env.example is committed; .env is gitignored.
- Every non-obvious decision gets a short ADR in docs/adr/NNNN-title.md
  (context, options, decision, tradeoff).
- Conventional commits. Small, logically separate commits.
- Prefer the boring solution. Do not add dependencies without saying why.
- Never invent requirements. If something is ambiguous, ask me.