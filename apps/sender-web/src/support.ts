type UaBrandType = { brand: string; version: string };
type UaDataType = { brands: UaBrandType[] };

/** Whether this browser exposes getDisplayMedia at all (secure context, desktop). */
export function isSharingSupported(): boolean {
  // The DOM lib types mediaDevices as always present, but it is undefined on insecure origins.
  const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
  return typeof mediaDevices?.getDisplayMedia === 'function';
}

/**
 * A caution note for browsers that cannot capture system audio, or null when the browser is a
 * Chromium one that can. Uses UA-Client-Hints brands where available (not a user-agent string sniff).
 */
export function sharingSupportNote(): string | null {
  if (!isSharingSupported()) {
    return 'This browser cannot share audio. Use Chrome or Edge on desktop.';
  }
  const uaData = (navigator as Navigator & { userAgentData?: UaDataType }).userAgentData;
  const brands = uaData?.brands ?? [];
  const isChromium = brands.some((entry): boolean => /Chromium|Google Chrome|Microsoft Edge/i.test(entry.brand));
  if (brands.length > 0 && !isChromium) {
    return 'System-audio sharing works best in Chrome or Edge; Firefox and Safari may not capture audio.';
  }
  return null;
}
