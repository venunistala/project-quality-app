# 15. No hard delete on releases

## Context

Phase 3 adds the write endpoints for this release-approval tracker: create, patch, transition,
comment. A DELETE endpoint is conspicuously absent from that list, and that's deliberate rather
than an oversight — worth writing down so a future phase doesn't "fix" the gap without revisiting
the reasoning.

## Options considered

1. **`DELETE /releases/:id`, hard delete.** Standard REST completeness, simple to implement (and
   `transitions`/`comments` already cascade-delete with the release, per ADR 0002). But this is an
   audit/compliance-flavored domain — `audit_log` is explicitly append-only (ADR 0002's own
   comment: "no update or delete code path exists anywhere in this codebase for this table"), and
   separation-of-duties depends on being able to prove who approved what, permanently. A hard
   delete of a release erases exactly the history this system exists to preserve — approved,
   deployed, even rolled-back releases are precisely the records an approval-tracking system must
   never lose. `audit_log.entity_id` intentionally isn't a foreign key (ADR 0002) so that audit rows
   survive the entity they describe — a DELETE route would work against that design, not with it.
2. **`DELETE /releases/:id`, soft delete via a `deleted_at`/`is_deleted` flag.** Keeps the row and
   its history intact while letting it disappear from default listings. Real functionality some
   users will eventually want (removing a mistakenly-created draft from view), but it's a genuine
   feature with its own surface area: a new column, a migration, updating every read query's
   default filter, deciding whether `canTransition`/authorization checks need to reject actions on
   a soft-deleted release, and deciding what a soft-deleted release looks like in `GET` responses.
   None of that is asked for by the Phase 3 spec, and CLAUDE.md's "never invent requirements" rule
   argues against building it speculatively.
3. **No delete route at all, this phase.** Ship nothing. A release created in error simply stays
   in `draft` (or gets manually corrected via PATCH) rather than removed.

## Decision

Go with option 3: Phase 3 ships no DELETE route on `/releases`. The system's core value —  a
trustworthy audit trail of who did what to a release — is incompatible with hard deletion, so that
option is off the table entirely, not just deprioritized. Soft delete (option 2) is a legitimate
future feature, not a rejected idea, but it's out of scope until there's an actual product
requirement driving its shape (what should "deleted" mean for a `submitted` release awaiting
approval? Does it need its own state in `canTransition`, or a state-independent flag? Those are
real design questions this ADR isn't answering because nothing today needs them answered).

If/when soft-delete is built, it needs at minimum: a `deleted_at timestamptz` column on `releases`,
every existing read query updated to filter it out by default (with an explicit opt-in to see
deleted releases, for anyone auditing), a decision on whether `canTransition`/write services should
reject all actions against a deleted release outright, and an ADR of its own recording those
decisions — this ADR is not a placeholder for that one.

## Tradeoffs

- Gains: zero risk of ever building a delete path that quietly undermines the audit trail; no
  speculative schema/authorization surface area maintained for a feature nobody's asked for yet.
- Costs: a release created entirely by mistake has no way to be removed from the system in this
  phase — the only remedy is editing it via PATCH (while still in draft) or simply leaving it as
  permanent, low-signal history, which is a real (if minor) UX gap until soft-delete exists.
