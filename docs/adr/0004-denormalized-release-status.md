# 4. Denormalized `releases.status` alongside the append-only `transitions` log

## Context

A release's current state is fully derivable from its `transitions` history — the status after
the last transition *is* the current status. We still need to decide whether `releases` carries
its own `status` column (denormalized, duplicating information already in `transitions`) or
whether every read that needs "what state is this release in" derives it from the transition log.

## Options considered

1. **No `releases.status` column; derive current status from `transitions` on every read.**
   Single source of truth, zero risk of the two disagreeing. But the single most common query
   this system will ever run — "list/filter releases by status" (the approver queue, dashboards)
   — becomes a correlated subquery or window function picking the latest transition per release,
   on every request, instead of a plain indexed column scan. It also makes "releases with no
   transitions yet" a special case to handle everywhere current status is needed.
2. **`releases.status` as the only record of state; drop `transitions` entirely.** Fast reads,
   but throws away the audit trail this domain explicitly requires (who moved what, when, why) —
   not viable given `audit_log` and the state-machine's role/separation-of-duties rules need a
   real history to check against.
3. **Both: `releases.status` denormalized as current state, `transitions` as the append-only
   source of truth for history.** Every write that changes status writes both: an INSERT into
   `transitions` and an UPDATE of `releases.status` (plus `updated_at`), inside one service-layer
   transaction. Reads that only need "what state is it in now" hit the cheap indexed column;
   reads that need history or need to verify a transition is legal hit `transitions`.

## Decision

Go with option 3: keep both. `releases.status` is the denormalized current state, kept in sync
with `transitions` exclusively by the (future) service layer performing both writes in a single
transaction — never by a database trigger (CLAUDE.md explicitly forbids triggers/stored
procedures) and never by application code outside the service layer. `transitions` remains the
authoritative history and the only place separation-of-duties / state-machine legality is
actually checked against past events.

## Tradeoffs

- Gains: the dominant query pattern (filter/list releases by status) is a plain indexed column
  scan, not an aggregation over history, on a table that will hold hundreds of rows per service
  in production; `releases(status)` (see index list) does real work instead of being unusable;
  "what's this release's status" has one obvious place to look for callers that don't care about
  history.
- Costs: two representations of the same fact now exist, and nothing but application discipline
  (a single transactional write path in the service layer) keeps them consistent — a bug that
  writes a transition without updating `releases.status`, or vice versa, produces a silently
  inconsistent row that no constraint catches; every write path that changes status must remember
  to touch both tables.
