import { type PeerConnectionType } from './webrtc_types.js';

export const ICE_GATHERING_TIMEOUT_MS = 2000;

/**
 * Waits until the connection has gathered its ICE candidates, or until the timeout.
 * The answer is sent in one piece with its candidates inside, so it has to wait for them;
 * the timeout keeps one slow network interface from holding the answer back.
 */
export function waitForIceGathering(pc: PeerConnectionType, timeoutMs = ICE_GATHERING_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    };
    const onStateChange = (): void => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);
    pc.addEventListener('icegatheringstatechange', onStateChange);
  });
}
