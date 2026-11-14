import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config: one project for every workspace that has its own `vitest.config.ts`.
 */
export default defineConfig({
  test: {
    projects: ['apps/*/vitest.config.ts', 'packages/*/vitest.config.ts'],
  },
});
