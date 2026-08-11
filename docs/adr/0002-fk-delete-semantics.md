# 2. Foreign-key delete semantics across the data layer

## Context

Every foreign key in the release-approval schema (`releases.created_by`, `transitions.actor_id`,
`transitions.release_id`, `comments.author_id`, `comments.release_id`, `audit_log.actor_id`)
needs an explicit `onDelete` behavior. Postgres defaults to `NO ACTION` if unspecified, which
just defers the same problem to whoever writes the first delete query. This is an
audit/compliance-flavored domain: `audit_log` is explicitly append-only, and separation-of-duties
depends on knowing who acted on a release. We need a policy that doesn't let a delete silently
erase or orphan that history.

## Options considered

1. **Cascade everywhere.** Deleting a user deletes everything they ever touched; deleting a
   release deletes its transitions/comments. Simplest to reason about, but a single user delete
   could silently wipe out approval history and audit trail for releases other people also acted
   on — unacceptable for an audit-flavored domain.
2. **Restrict everywhere.** Nothing can ever be deleted if anything references it. Maximally
   safe, but makes even routine cleanup (e.g. deleting a mistakenly-created draft release with
   no history) impossible without manually deleting children first.
3. **Split by origin: `RESTRICT` on every FK pointing at `users`, `CASCADE` on every FK pointing
   at `releases`.** A release and its transitions/comments are one aggregate — deleting the
   release deleting its children is expected. A user, however, is a shared identity referenced
   from many releases; deleting one should never be a side effect of deleting something else,
   and should fail loudly if that user has any recorded activity.

## Decision

Go with option 3: `releases.created_by`, `transitions.actor_id`, `comments.author_id`, and
`audit_log.actor_id` are all `onDelete: 'restrict'`. `transitions.release_id` and
`comments.release_id` are `onDelete: 'cascade'`. `audit_log.entity_id` is intentionally **not**
a foreign key at all — it's polymorphic (`entity_type` names which table it points at), so no
single-table FK constraint can express it, and the audit trail is meant to survive the entity
it describes.

Concretely: a user becomes effectively un-deletable the moment they've created a release, made a
transition, left a comment, or appear in `audit_log`. The only users a `DELETE FROM users` can
remove are accounts that never did anything. A real "remove a user" feature would need a
`deactivated_at` flag, not a hard delete — that's out of scope for this phase, which ships no
delete routes at all. Deleting a release, by contrast, cleanly cascades its own transitions and
comments, but does **not** touch `audit_log` rows referencing it — those rows persist by value,
because the audit trail is meant to outlive the entity it describes.

## Tradeoffs

- Gains: identity/attribution can never be silently lost to a cascading delete; a release delete
  cleanly removes its own aggregate without manual cleanup; the policy is a single, memorable
  rule (`users` = restrict, `releases` = cascade) rather than six independent judgment calls.
- Costs: there is no way to hard-delete a user once they have any activity, which will eventually
  require a soft-delete/deactivation mechanism; `audit_log` referencing a deleted release's
  `entity_id` by value only means a later join from `audit_log` back to `releases` can return no
  row, which any future reporting code must expect.
