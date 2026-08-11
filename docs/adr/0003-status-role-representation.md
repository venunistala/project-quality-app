# 3. Status and role columns: text + CHECK, not native pgEnum

## Context

`users.role`, `releases.status`, `transitions.from_status`, and `transitions.to_status` are all
closed unions (`'engineer' | 'approver' | 'admin'`; the six release statuses). CLAUDE.md requires
the union be defined once, in `packages/shared`, and imported by the Drizzle schema — not
redeclared in SQL by hand. Postgres offers two ways to enforce a closed set of string values at
the column level: a native `pgEnum` type, or a plain `text` column with a `CHECK` constraint.

## Options considered

1. **Native Postgres `pgEnum`.** Drizzle can declare `pgEnum('release_status', RELEASE_STATUSES)`
   directly from the shared array, so it's still "defined once." Enforced at the type-system
   level inside Postgres, slightly smaller storage. But alterations are awkward: removing or
   reordering a value isn't supported at all, and adding a value (`ALTER TYPE ... ADD VALUE`)
   can't run inside the same transaction as other schema changes in older Postgres versions and
   interacts poorly with concurrent migrations. quality-lab exists to be tested and iterated on
   quickly — this is friction we'd hit early and often.
2. **`text` + `CHECK` constraint, generated from the same shared array.** Same "single source of
   truth" property — the CHECK's value list is built from `RELEASE_STATUSES`/`USER_ROLES` at
   schema-definition time, not hand-typed. Altering the set of legal values is an ordinary
   `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` migration, no different in kind from any
   other schema change, and composes normally with drizzle-kit's generate-and-diff workflow.
3. **No DB-level enforcement, validate only in the Zod layer.** Simplest schema, but a raw
   `INSERT` (as used directly by the seed script and by integration tests probing constraints)
   could write a garbage status with nothing to stop it — fails CLAUDE.md's spirit of catching
   invalid state as early as possible, and removes a class of test we explicitly want (a
   CHECK-violation integration test).

## Decision

Go with option 2: every status/role column is `text`, constrained by a `CHECK` whose value list
is generated from the corresponding shared array (`RELEASE_STATUSES` for status columns,
`USER_ROLES` for `users.role`). The array lives once in `packages/shared`; the schema file
imports it and builds both the column type and the CHECK expression from it, so there is exactly
one place that ever lists `'draft' | 'submitted' | 'approved' | ...` by hand.

## Tradeoffs

- Gains: evolving the status/role set later is an ordinary migration, not a special case;
  insert-time protection is equivalent to a native enum (invalid values are rejected by
  Postgres, not just by application code); the shared array stays the actual single source of
  truth rather than being shadowed by a separately-defined SQL type.
- Costs: no Postgres-level type name to lean on for things like automatic ORDER BY-by-definition-order
  or `\d` showing a distinct enum type; a `text` column is technically less self-documenting in a
  raw `psql` session than a named enum type would be.
