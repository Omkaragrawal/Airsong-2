/// <reference types="vite/client" />

/** Injected by the Electron preload (sender-desktop); absent in a plain browser. */
type AirsongHostType = {
  platform: string;
  canHostLocal: boolean;
};

/* eslint-disable @typescript-eslint/consistent-type-definitions -- augmenting the browser's Window requires interface */
interface Window {
  airsongHost?: AirsongHostType;
}
/* eslint-enable @typescript-eslint/consistent-type-definitions */

/**
 * Replaced at build time by a literal `true`/`false` (vite.config.ts `define`). Normal builds set
 * it `false`, so the dev/test tone source folds out and never ships.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- build-time define token, by the __NAME__ convention
declare const __AIRSONG_TEST_TONE__: boolean;
