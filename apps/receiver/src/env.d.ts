/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build-time flags. `interface` (not `type`) is required to merge with Vite's ImportMetaEnv.
/* eslint-disable @typescript-eslint/consistent-type-definitions */
interface ImportMetaEnv {
  /** Set to '1' only in test builds; surfaced via the `__AIRSONG_TEST_HOOKS__` define below. */
  readonly VITE_TEST_HOOKS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/* eslint-enable @typescript-eslint/consistent-type-definitions */

/**
 * Replaced at build time by a literal `true`/`false` (vite.config.ts `define`). In normal builds
 * it is `false`, so the test-hook block folds away and never ships in the bundle.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- build-time define token, by the __NAME__ convention
declare const __AIRSONG_TEST_HOOKS__: boolean;
