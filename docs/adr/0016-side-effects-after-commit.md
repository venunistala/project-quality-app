# 16. Side effects enqueued after commit, not inside the transaction

## Context

`POST /releases/:id/transitions` needs to trigger a side effect after a successful transition (the
spec calls for "enqueue side effect" as the last step of the write path, backed by the `job_queue`
stub table — see ADR 0015's sibling note and the Phase 3 DO-NOT list ruling out a real queue this
phase). The status update, the `transitions` insert, and the `audit_log` insert are already one
atomic `db.transaction()` (ADR 0004). The question is whether the job-queue insert belongs inside
that same transaction or after it commits.

## Options considered

1. **Enqueue inside the same transaction as the status update.** If the transaction rolls back (the
   forced-failure rollback test, or any genuine DB error), the enqueue rolls back with it — no
   orphaned job for a transition that never actually happened. This is the theoretically correct
   answer, and it's exactly what the outbox pattern formalizes: write the intent-to-enqueue in the
   same transaction as the business data, and have a separate process reliably deliver it afterward.
   Implementing the delivery side (a poller reading `job_queue` and dispatching, with retry/
   dedup) is real work the Phase 3 spec explicitly rules out ("no outbox pattern... a simple
   DB-table enqueue stub is enough").
2. **Enqueue after the transaction commits**, as a separate statement. Simple: `await
   deps.enqueueJob(...)` runs only in the success branch, after `runInTransaction` returns an `'ok'`
   outcome. Correctly never enqueues a job for a transition that got rolled back (the enqueue call
   is unreachable if the transaction throws or resolves as `'stale'`). But it opens a real gap: if
   the process crashes, or the enqueue insert itself fails, in the narrow window *after* the
   transition transaction commits but *before* the enqueue insert completes, the release is left
   correctly transitioned with no corresponding job ever queued.

## Decision

Go with option 2 for this phase, with the failure window named explicitly rather than hidden. The
enqueue call sits directly after `deps.runInTransaction(...)` returns, only on the `'ok'` branch,
with a comment at the call site (`apps/api/src/services/transitions.service.ts`) spelling out
exactly what can go wrong: if the enqueue throws after the status/transitions/audit_log rows have
already committed, the release is left correctly transitioned but the side effect never fires.
Option 1's correct fix — the outbox pattern — is named as the real solution and explicitly not
built now, matching the Phase 3 spec's own instruction.

This is a deliberate, temporary gap, not an oversight: a job stub with no consumer (this phase)
can't yet cause a duplicate-dispatch problem, which is the failure mode outbox-vs-naive-enqueue
usually trades against. The gap becomes worth closing once Phase 5 gives `job_queue` a real
consumer that actually acts on missing/duplicate entries.

## Tradeoffs

- Gains: transaction stays scoped to exactly the data that must be atomic (status + transitions +
  audit_log); no risk of the enqueue statement itself causing the business transaction to roll back
  for an unrelated reason (e.g. a transient issue writing to `job_queue` shouldn't undo a
  legitimately successful approval).
- Costs: a real, named failure window exists between commit and enqueue where a transition can
  succeed with no corresponding job ever created — acceptable now because nothing consumes
  `job_queue` yet, but not acceptable once something does, at which point this ADR's "real fix"
  (outbox) needs to actually be built, not just documented.
