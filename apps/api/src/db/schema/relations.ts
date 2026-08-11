import { relations } from 'drizzle-orm';
import { comments } from './comments.js';
import { credentials } from './credentials.js';
import { releases } from './releases.js';
import { transitions } from './transitions.js';
import { users } from './users.js';

// Pure FK-join metadata for Drizzle's relational query API (db.query.*) -
// no conditionals, no computed values, nothing that changes based on data.
// Not a schema/migration change; confirmed via a no-op `db:generate`.

export const releasesRelations = relations(releases, ({ one, many }) => ({
  creator: one(users, {
    fields: [releases.createdBy],
    references: [users.id],
  }),
  transitions: many(transitions),
  comments: many(comments),
}));

export const transitionsRelations = relations(transitions, ({ one }) => ({
  release: one(releases, {
    fields: [transitions.releaseId],
    references: [releases.id],
  }),
  actor: one(users, {
    fields: [transitions.actorId],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  release: one(releases, {
    fields: [comments.releaseId],
    references: [releases.id],
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many, one }) => ({
  releasesCreated: many(releases),
  credential: one(credentials, {
    fields: [users.id],
    references: [credentials.userId],
  }),
}));

export const credentialsRelations = relations(credentials, ({ one }) => ({
  user: one(users, {
    fields: [credentials.userId],
    references: [users.id],
  }),
}));
