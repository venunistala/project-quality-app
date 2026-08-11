import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Integration tests need a real Postgres - they run separately via
    // test:integration/vitest.integration.config.ts, never as part of the
    // fast, DB-free `test` script.
    exclude: [...configDefaults.exclude, 'test/integration/**'],
  },
});
