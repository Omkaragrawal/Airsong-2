export type WakeLockControllerType = {
  acquire: () => Promise<void>;
  release: () => Promise<void>;
};

/**
 * Keeps the screen awake while listening, where the Screen Wake Lock API is available. The lock
 * is dropped by the browser when the tab is hidden, so it is re-acquired on `visibilitychange`.
 * Everything degrades silently when the API is missing or a request is denied.
 */
export function createWakeLock(): WakeLockControllerType {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  const supported = 'wakeLock' in navigator;

  const request = async (): Promise<void> => {
    if (!supported || sentinel !== null || document.visibilityState !== 'visible') {
      return;
    }
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', (): void => {
        sentinel = null;
      });
    } catch {
      // Denied or unsupported: listening continues without keeping the screen on.
    }
  };

  const onVisibility = (): void => {
    if (wanted && document.visibilityState === 'visible') {
      void request();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const acquire = async (): Promise<void> => {
    wanted = true;
    await request();
  };

  const release = async (): Promise<void> => {
    wanted = false;
    const current = sentinel;
    sentinel = null;
    if (current !== null) {
      try {
        await current.release();
      } catch {
        // Already released.
      }
    }
  };

  return { acquire, release };
}
