import { type PlayerControllerType } from './player/player.js';

type TestHookType = {
  getPhase: () => string;
  getStats: () => unknown;
  retry: () => void;
  leave: () => void;
};

/**
 * Exposes a tiny `window.__airsongTest` hook for end-to-end tests. The whole body is behind the
 * build-time `__AIRSONG_TEST_HOOKS__` flag (false in normal builds), so it is dead-code eliminated
 * and never ships in production — verify with: `grep -r __airsongTest dist` returns nothing.
 */
export function installTestHook(controller: PlayerControllerType): void {
  if (__AIRSONG_TEST_HOOKS__) {
    const hook: TestHookType = {
      getPhase: (): string => controller.state.get().phase,
      getStats: (): unknown => controller.state.get().stats,
      retry: (): void => {
        controller.retry();
      },
      leave: (): void => {
        controller.leave();
      },
    };
    (window as unknown as { __airsongTest: TestHookType }).__airsongTest = hook;
  }
}
