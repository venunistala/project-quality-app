# 9. Session-based auth: Postgres-backed sessions, hashed cookie token, no signing

## Context

Phase 3 needs to know who is making a request before any authorization decision can be made.
CLAUDE.md and the Phase 3 spec both call this "deliberately simple, not the interesting part" —
the interesting work is authorization (ADR 0011) and the transactional writes it gates. The DO-NOT
list explicitly rules out OAuth, JWT, refresh tokens, and any RBAC framework. What's needed is the
smallest mechanism that correctly answers "is this a valid logged-in user" on every request,
survives a process restart, and works if the API is ever run behind a load balancer with more than
one instance.

## Options considered

1. **In-memory session store.** Zero new tables, trivial to implement. Dies on every restart
   (every logged-in user is silently logged out) and cannot be shared across horizontally-scaled
   instances — a request could land on an instance that never saw the login. Explicitly ruled out
   by the Phase 3 spec.
2. **JWT in the cookie, no server-side session record.** Stateless, no DB round-trip to check a
   session. But revocation (logout) becomes either impossible before expiry or requires a
   server-side denylist anyway — which is a session store by another name, just for the exception
   case instead of the common one. Also explicitly ruled out by the spec (no JWT).
3. **Postgres-backed sessions, opaque random token in the cookie, only the token's hash stored.**
   One extra table, one indexed lookup per authenticated request (already an existing cost pattern
   in this codebase — every read endpoint already does at least one DB round trip). Survives
   restarts and works identically across any number of API instances since they all share the same
   Postgres.

## Decision

Go with option 3. A new `sessions` table stores `user_id`, `token_hash`, and `expires_at`. The
session cookie carries a raw 256-bit random token (`crypto.randomBytes(32)`, base64url-encoded);
only `sha256(token)` is ever persisted, so a leaked `sessions` row (a DB dump, a careless query
log) cannot be replayed as a valid cookie value. SHA-256, not argon2/bcrypt: the token is already
maximal CSPRNG entropy, not a user-chosen secret, so a slow KDF defends against nothing here and
would tax the DB-lookup hot path of every authenticated request for no benefit — argon2id is
reserved for passwords (ADR 0010), where the threat (offline brute-force of a low-entropy,
user-chosen secret) is real.

The cookie itself is **not** signed (no `COOKIE_SECRET`/HMAC via `@fastify/cookie`'s signing
option). A forged or tampered token simply won't hash to any row in `sessions` — the DB lookup
already provides the integrity guarantee signing exists to give. Skipping it also means Phase 3
introduces no new secret/env var, so CI needs no changes to support auth.

TTL is 24 hours, **absolute**, not sliding — `expires_at` is set once at login and never extended.
A sliding window would mean writing to `sessions` on every authenticated request just to push the
expiry out, which is exactly the kind of complexity this phase's "not the interesting part" framing
argues against. Logout is a hard `DELETE FROM sessions`, not a soft revoke — unlike `transitions`/
`audit_log`, session rows are not audit data.

A `requireAuth` Fastify plugin resolves the cookie to a session/user pair and attaches it to the
request. It answers only "is this a valid logged-in user" — see ADR 0011 for why role/permission
decisions are deliberately kept out of it.

## Tradeoffs

- Gains: survives restarts and horizontal scaling for free (shared Postgres, no sticky sessions
  needed); logout is an immediate, real revocation (`DELETE`, not "wait for JWT expiry"); no new
  secret to manage or leak; a leaked session table doesn't hand out usable credentials.
- Costs: every authenticated request pays one extra indexed DB lookup (`sessions` joined to
  `users`) that a stateless JWT wouldn't need; a fixed 24h TTL means a user mid-session at the
  24-hour mark is logged out regardless of activity, which a sliding window would avoid; expired
  session rows are not proactively swept (no cron in this repo yet — see the idempotency-store ADR
  0014 for the same lazy-expiry tradeoff applied to another table), so `sessions` grows unboundedly
  until something cleans it up, which is acceptable fixture-scale but would need addressing before
  this is a real production system.
