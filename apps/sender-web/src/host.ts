/** Whether the host (the Electron shell) can run a local-mode server. False in a plain browser. */
export function canHostLocal(): boolean {
  return window.airsongHost?.canHostLocal === true;
}
