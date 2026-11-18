import { NAME_MAX_LENGTH } from '@airsong/protocol';

const STORAGE_KEY = 'airsong.name';

/** The display name the viewer last used, or '' if none/unavailable. */
export function loadName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Private mode or storage disabled: just start with no remembered name.
    return '';
  }
}

/** Persists the display name, trimmed to the protocol's maximum. Best-effort. */
export function saveName(name: string): void {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
  try {
    if (trimmed.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, trimmed);
    }
  } catch {
    // Private mode or storage disabled: the name just won't persist across visits.
  }
}
