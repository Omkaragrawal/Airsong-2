import { defineConfig } from 'vitest/config';

/**
 * Vitest settings shared by every workspace that uses Vitest.
 * A workspace's `vitest.config.ts` merges this with its own settings through `mergeConfig`.
 */
export default defineConfig({
  test: {},
});
