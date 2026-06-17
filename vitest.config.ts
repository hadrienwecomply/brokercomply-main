import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    include: ['{packages,tools}/**/__tests__/**/*.test.ts'],
    // Integration suites share a single Postgres instance; run files serially
    // so their setup/teardown can't clobber each other's state.
    fileParallelism: false,
  },
});
