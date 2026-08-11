# 13. Optimistic locking vs `SELECT ... FOR UPDATE`

## Context

`releases.version` (ADR 0006) exists specifically so Phase 3 can prevent lost updates when two
actors race to change the same release — e.g. two approvers both loading a `submitted` release and
both clicking approve. Postgres offers (at least) two well-known ways to make that safe: optimistic
concurrency control (a version counter checked at write time) and pessimistic locking
(`SELECT ... FOR UPDATE`, which holds a row lock for the duration of a transaction).

## Options considered

1. **`SELECT ... FOR UPDATE` inside the write transaction.** The first transaction to reach the
   release row locks it; a second concurrent transaction touching the same row blocks until the
   first commits or rolls back, then proceeds against the now-current row. No client-visible
   version field needed at all — the database serializes the actual contention.
2. **Optimistic locking via `releases.version`.** No lock is held; instead, the client must have
   fetched the release (and its version) before writing, and the write is conditional:
   `UPDATE ... WHERE id = ? AND version = ?`. If another write landed in between, the conditional
   update affects zero rows and the client is told to refetch.

## Decision

Go with option 2, optimistic locking, for this domain's actual traffic shape. Release approval
actions are human-paced — someone reads a release, decides, and clicks approve/reject minutes
(sometimes longer) after loading it. `SELECT ... FOR UPDATE` held across that whole read-decide-write
span isn't realistic (nobody holds a DB transaction open while a human reads a page), and holding it
only around the write itself doesn't solve the actual problem here, which is two people making a
decision based on the *same stale view* of the release, not two statements racing microseconds
apart. Optimistic locking's central assumption — conflicts are rare, most requests won't collide —
matches this domain: most releases are only ever acted on by one person at a time, and the two
concurrent-approval scenario the spec explicitly tests for is the deliberate exception, not the
common case.

`releases.version` is also client-visible and testable in a way row locks aren't: every write
response returns the new version, every GET includes the current version, and the 409 payload
tells the client exactly what to refetch. That observability is part of what this project exists to
demonstrate (per CLAUDE.md, quality-lab is "a testing and developer-tooling substrate").

**When this would flip**: if a release ever became a genuinely hot row — many actors routinely
racing to write the same release within milliseconds of each other (not humans, but e.g. automated
systems repeatedly retrying against the same release) — optimistic locking's failure mode is
wasted work: every loser refetches and resubmits, and under high enough contention nobody ever
wins cleanly. `SELECT ... FOR UPDATE` would then be the better trade, since it serializes contenders
instead of making them all fail and retry. Nothing in this domain's actual usage pattern points
that direction today.

## Tradeoffs

- Gains: no lock held across human think-time; conflicts are cheap to detect and cheap to recover
  from (refetch, no wasted transaction); the version is a first-class, client-visible value instead
  of an invisible DB-internal lock.
- Costs: under genuinely high contention on one row, optimistic locking wastes more work than a row
  lock would (every loser's transaction ran to completion before finding out it lost); every write
  endpoint must remember to thread `expectedVersion` through, and every failure path must remember
  to surface the current version so the client can actually recover — that discipline is manual,
  not enforced by the database the way a lock's blocking behavior would be.
