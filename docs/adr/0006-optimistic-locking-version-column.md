# 6. Optimistic-locking `version` column, added ahead of its use

## Context

`releases` is the only row in this schema that gets mutated repeatedly over its lifecycle —
every transition updates its denormalized `status` and `updated_at` (see ADR 0004). Phase 3 will
need optimistic concurrency control on those updates, so two concurrent actors acting on the same
release don't silently clobber each other's change. That needs a counter column. Adding it once
Phase 2 has shipped and real rows exist means a migration plus backfilling a `NOT NULL` column
across whatever data is live by then; adding it now, while this table only holds reseedable
fixture data, costs nothing by comparison.

Note: `releases` already had a column named `version` — the unique business release identifier
(e.g. `payments-api@v1.3.0`), required by Phase 1's schema. Since the conventional name for an
optimistic-lock counter is also `version` (Rails/Hibernate/JPA all use it), giving the new column
that name required renaming the existing business identifier to `release_label` first.

## Options considered

1. **Defer the column to Phase 3, added alongside the locking logic itself.** Simplest possible
   Phase 1 scope, but this is exactly the migration-plus-backfill cost being avoided — by the
   time Phase 3 lands, `releases` will hold real data instead of reseedable fixtures, making the
   `NOT NULL` backfill a real operational step instead of a non-event.
2. **Use Postgres's built-in `xmin` system column instead of a dedicated one.** No schema change
   at all — every row already has a hidden `xmin` that changes on every update, and it's a
   well-known optimistic-locking trick. But `xmin` wraps around over a table's long-term life,
   isn't visible in `\d` output or ORM tooling, and isn't something a query can meaningfully
   inspect or reason about. quality-lab exists to be tested and instrumented against; a column
   nobody can see fails that purpose.
3. **Add an explicit `version integer not null default 1` column now, unused until Phase 3 wires
   up the actual check-and-increment logic.** Visible, conventional, and ORM-friendly from day
   one, at the cost of sitting idle through the rest of this phase and Phase 2.

## Decision

Go with option 3: `releases.version` is now `integer not null default 1`. Nothing reads or
increments it yet — no WHERE-clause version check, no increment-on-update, no trigger (this
project doesn't use triggers/stored procedures, see CLAUDE.md and ADR 0004). That logic is
explicitly Phase 3's job. The pre-existing business release identifier moved to
`releases.release_label` (text, unique) to free up the conventional `version` name.

## Tradeoffs

- Gains: Phase 3 adds a `WHERE version = :expected` clause and an increment, not a migration and
  a backfill; the column's name is immediately recognizable to anyone who's used an ORM with
  built-in optimistic locking, rather than needing a comment to explain a differently-named field.
- Costs: the column does nothing for two phases before it's used, which is a small amount of
  schema noise to carry; the rename of the pre-existing `version` column touches already-built
  seed script and integration test code right now — which is exactly the cost this ADR chooses to
  pay early, on purpose, while the table only holds fixture data.
