# 14. Idempotency keys vs optimistic locking

## Context

Phase 3 has two mechanisms that both sound like "prevent a write from happening the wrong number
of times": optimistic locking (`releases.version`, ADR 0013) and an `Idempotency-Key` header on
`POST /releases` and `POST /releases/:id/transitions`. It would be easy to assume one makes the
other redundant. It doesn't — they answer different questions.

## Options considered

1. **Optimistic locking alone is enough.** If a retried request carries the same
   `expectedVersion` the client already used, and the first attempt already succeeded and bumped
   the version, the retry's conditional `UPDATE ... WHERE version = :expected` affects zero rows —
   indistinguishable from a genuine conflict. The client would see `409 CONFLICT_STALE_VERSION` for
   what was actually its own already-applied change, and "refetch and retry" is the wrong advice:
   there's nothing to retry, the write already happened.
2. **Idempotency keys alone are enough.** Without a version check, two *different* clients racing
   to approve the same release with genuinely different intent (one approving, one rejecting)
   would need some other mechanism to ensure only one wins — an idempotency key doesn't help here
   at all, since each client's key is different and both requests are entirely legitimate up until
   one should be told "the state moved out from under you."
3. **Both, addressing different failure modes.** Optimistic locking answers *"is this write still
   valid given the release's current state"* (a race between distinct actors/intents). Idempotency
   keys answer *"have I already told the server to do this exact thing"* (a retry of one actor's
   single logical intent — double-click, client timeout-and-retry, network doubt about whether the
   first attempt landed).

## Decision

Go with option 3: implement both, because they solve different problems and neither substitutes
for the other. Concretely: a transition request that includes both `expectedVersion` and an
`Idempotency-Key` is first checked against the idempotency store (`apps/api/src/services/
idempotency.service.ts`) — if the exact same key with the exact same body already produced a
stored response, that response is replayed verbatim and the optimistic-lock check never runs a
second time. Only a request that isn't a replay reaches the `canTransition`/version-check path.

The idempotency key tuple is `(key, userId, method, requestPath)` with `requestPath` as the
*literal* invoked path (not a route template plus a nullable `releaseId` column) — Postgres treats
every `NULL` as distinct in a unique index, so a nullable column would silently fail to deduplicate
`POST /releases` requests, which have no release id at all.

## Tradeoffs

- Gains: a client that legitimately retries a request after a timeout gets back the exact response
  its first attempt produced, not a spurious 409; a client racing another actor for the same row
  still gets correctly told "the state moved," because the version check still runs for any request
  that isn't a verified replay.
- Costs: one more table, one more DB round-trip on the two write endpoints that accept the header,
  and a second axis of complexity to reason about per request (is this a replay? is this stale?) —
  justified here because the two failure modes are genuinely different and conflating them produces
  wrong client-facing behavior in both directions (spurious conflicts on retries, or missed
  conflicts on real races if idempotency were mistaken for sufficient locking).
