import { type IceServerType, iceServersResponseSchema } from '@airsong/protocol';

const ICE_TIMEOUT_MS = 8000;

/**
 * Fetches STUN/TURN servers from the server. Returns `[]` on any failure (timeout, offline, or a
 * not-yet-implemented endpoint) so negotiation still proceeds with host candidates only.
 */
export async function getIceServers(): Promise<IceServerType[]> {
  const controller = new AbortController();
  const timer = setTimeout((): void => {
    controller.abort();
  }, ICE_TIMEOUT_MS);
  try {
    const response = await fetch('/api/ice-servers', { signal: controller.signal });
    if (!response.ok) {
      return [];
    }
    const body: unknown = await response.json();
    const parsed = iceServersResponseSchema.safeParse(body);
    return parsed.success ? parsed.data.iceServers : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
