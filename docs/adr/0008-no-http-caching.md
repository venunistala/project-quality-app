# 8. No HTTP caching — `Cache-Control: no-store` on every response

## Context

Phase 2's four GET endpoints serve seeded, effectively-static data — nothing in this phase writes
to the database, so the same request returns the same shape for as long as the phase lasts.
"Sensible cache headers" could mean anything from no headers at all to a positive TTL; we need to
pick one and be explicit about why, per CLAUDE.md's requirement to document non-obvious API-shape
decisions.

## Options considered

1. **No cache headers at all.** Leaves caching behavior to whatever sits in front of the API
   (browser heuristics, a future reverse proxy) — unpredictable, and not "sensible" by omission.
2. **A positive `Cache-Control: public, max-age=N`.** Technically defensible today, since the data
   genuinely doesn't change during this phase. But it bakes in an assumption — "this response is
   safe to serve stale for `N` seconds" — that becomes actively wrong the moment Phase 3 adds
   writes, and nothing in this phase's scope would remember to revisit it before that happens.
3. **`Cache-Control: no-store` explicitly, on every response.** Correct today (no correctness
   upside to caching data that doesn't change, but also no risk), and — more importantly — stays
   correct without being revisited once writes exist, since it makes no assumption about write
   frequency at all.

## Decision

Go with option 3: every response carries `Cache-Control: no-store`, set once via a Fastify
`onSend` hook rather than per-route boilerplate. This is deliberately also a "no ETag/
Last-Modified either" decision — conditional-GET support is a legitimate reading of "sensible
cache headers" too, but it adds real implementation surface (a stable ETag computation for list
responses, `If-None-Match`/304 handling per route) for a phase whose explicit scope is reads-only
with no caching layer. A reasonable follow-up, not something folded in here.

## Tradeoffs

- Gains: never needs revisiting when Phase 3 adds writes; zero risk of ever serving stale
  approval-state data to a client that assumed a cached response was current; zero new
  infrastructure (no cache store, no invalidation logic).
- Costs: no performance benefit from caching even during this phase, when it would have been free
  (the data genuinely doesn't change yet) — a deliberately conservative choice trading a small,
  currently-unrealized performance win for correctness-by-construction later.
