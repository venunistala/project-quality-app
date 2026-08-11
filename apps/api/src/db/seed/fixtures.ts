// Every seeded user shares this password - it's intentionally public
// (documented in the README), not a secret, so it's a plain constant rather
// than an env var. Seeding refuses to run at all when NODE_ENV=production
// (see assertNotProduction in run-seed.ts) specifically so this can never
// end up protecting a real account.
export const SEED_USER_PASSWORD = 'quality-lab-dev-password';

export const USER_NAMES = [
  'Ava Chen',
  'Liam Patel',
  'Noah Garcia',
  'Emma Johansson',
  'Olivia Kim',
  'Mateo Rossi',
  'Sofia Novak',
  'Ethan Brooks',
  'Isabella Silva',
  'Lucas Meyer',
  'Mia Torres',
  'Benjamin Wolfe',
] as const;

export const SERVICE_NAMES = [
  'payments-api',
  'checkout-web',
  'inventory-sync',
  'notifications',
  'auth-gateway',
  'search-indexer',
  'billing-worker',
  'reporting-service',
  'user-profile',
  'fraud-detection',
] as const;

export const TITLE_ADJECTIVES = [
  'critical',
  'routine',
  'scheduled',
  'emergency',
  'minor',
  'major',
  'security',
  'performance',
] as const;

export const TITLE_NOUNS = [
  'hotfix',
  'release',
  'patch',
  'rollout',
  'upgrade',
  'migration',
  'refactor',
  'config change',
] as const;

export const COMMENT_TEMPLATES = [
  'LGTM, ship it.',
  'Can we get another set of eyes on the migration step?',
  'Rollback plan looks solid.',
  'Holding off until the on-call handoff completes.',
  'Nice work on the perf improvements here.',
  'Double check the feature flag defaults before deploy.',
  'This unblocks the downstream team, thanks!',
  'Flaky test in CI, retried and green now.',
  'Any concerns about the DB migration in this one?',
  'Deployed and monitoring looks clean so far.',
] as const;

export const REJECTION_REASONS = [
  'Missing rollback plan.',
  'Needs a second reviewer before this can ship.',
  'Failing smoke tests in staging.',
  'Please split this into smaller releases.',
  'Blocked on the upstream dependency release.',
] as const;
