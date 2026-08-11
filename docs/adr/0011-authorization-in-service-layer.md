# 11. Authorization enforced in the service layer, not middleware

## Context

Phase 3 needs two different questions answered on every write request: "is this a valid logged-in
user" (authentication) and "is this specific user allowed to make this specific change to this
specific release" (authorization). `packages/shared`'s `canTransition()` already encodes the
authorization rules — role requirements and the self-approval prohibition — as a pure function of
`{ from, to, actorRole, isCreator }`. The question is *where* in the request pipeline that function
gets called.

## Options considered

1. **A single `preHandler` hook does both authentication and authorization**, e.g. a
   `requireApprover` hook registered on the transition route. This is the common Fastify pattern
   for role checks, and it's tempting because it keeps route files declarative.
2. **Authentication in a `preHandler` hook (`requireAuth`); authorization inside the service
   function that handles the write**, using `canTransition()` directly.

Option 1 breaks down specifically on separation-of-duties: `canTransition()` needs `isCreator`,
which means comparing the acting user's id against `release.created_by` — and a middleware hook
runs *before* the route handler has loaded the release from the database. A hook could load the
release itself, but at that point it's no longer "middleware" in any meaningful sense — it's
duplicating exactly the DB fetch the service layer already needs to do, just relocated one file
over. Worse, every future write endpoint with its own authorization shape (PATCH's creator-only
rule, comments' any-authenticated-user rule) would need its own bespoke hook, each re-deriving
context the service already has on hand.

## Decision

Go with option 2, split cleanly:

- `requireAuth` (a Fastify `preHandler` plugin, see ADR 0009) answers **only** "is this a valid
  logged-in user," and attaches the resolved user to `request.user`. It has zero knowledge of
  roles, releases, or the state machine.
- Every write service loads the release itself (needed anyway, to check its current status/version)
  and calls `canTransition()` — or the equivalent creator-only check for PATCH — with the actual
  `isCreator` value now available. Services return a typed `WriteResult` failure (never throw an
  HTTP error) so the route layer stays a thin translator from failure kind to status code
  (see ADR 0012 for exactly how that mapping works).

## Tradeoffs

- Gains: `canTransition()` is called in exactly one place per write path, right where the release
  row it needs is already loaded — no duplicated DB fetch, no drift between what a hook checks and
  what the service checks; `requireAuth` stays genuinely reusable across every protected route
  (write and future non-write) because it never needs endpoint-specific knowledge; adding a new
  write endpoint with a new authorization shape means writing a new service function, not a new
  bespoke middleware hook.
- Costs: a request that turns out to be forbidden still pays for a DB fetch of the release before
  the rejection happens (a `preHandler`-only role check could reject some requests before touching
  the DB at all, e.g. "engineers can never call this endpoint" if that were a rule) — acceptable
  here because no such role-independent-of-data rule exists in this domain; every rule this app has
  needs the release's data to evaluate.
