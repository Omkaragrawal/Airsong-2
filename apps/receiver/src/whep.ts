import type { IceServerType, SessionModeEnum } from '@airsong/protocol';
import { ICE_GATHERING_TIMEOUT_MS, OpusParamsConst, tuneOpusSdp, waitForIceGathering } from '@airsong/sender-core';

import { buildWhepUrl, deleteWhep, postWhep } from './api.js';
import { ReceiverError, ReceiverErrorEnum } from './errors.js';

export type ConnectParamsType = {
  mode: SessionModeEnum;
  code: string;
  /** Display name shown in the sender's viewer list; '' to stay anonymous. */
  name: string;
  iceServers: IceServerType[];
  onTrack: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
};

/** One live WHEP connection. `close()` ends the session on the sender and tears down the peer. */
export type WhepHandleType = {
  pc: RTCPeerConnection;
  location: string | null;
  close: () => Promise<void>;
};

/**
 * Makes one WHEP connection attempt (reconnection/backoff is the player's job):
 * a recvonly audio offer, tuned for Opus stereo, with ICE gathered up front (no trickle),
 * POSTed in one piece; the answer is applied and the remote track surfaced via `onTrack`.
 */
export async function connectWhep(params: ConnectParamsType, signal?: AbortSignal): Promise<WhepHandleType> {
  const pc = new RTCPeerConnection({ iceServers: params.iceServers });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.addEventListener('track', (event: RTCTrackEvent): void => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    params.onTrack(stream);
  });
  pc.addEventListener('connectionstatechange', (): void => {
    params.onConnectionStateChange(pc.connectionState);
  });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Gather candidates before POSTing: the offer is sent whole, so wait (bounded) for them.
    await waitForIceGathering(pc, ICE_GATHERING_TIMEOUT_MS);
    if (signal?.aborted ?? false) {
      throw new ReceiverError(ReceiverErrorEnum.WEBRTC_FAILED, 'The connection was cancelled.');
    }

    // Tune a copy of the gathered offer (never the local description itself — some browsers
    // reject a munged local SDP), so the sender sees our Opus stereo preference.
    const localSdp = pc.localDescription?.sdp ?? offer.sdp ?? '';
    const offerSdp = tuneOpusSdp(localSdp, OpusParamsConst.RECEIVER);

    const url = buildWhepUrl(params.mode, params.code, params.name);
    const result = await postWhep(url, offerSdp, signal);
    await pc.setRemoteDescription({ type: 'answer', sdp: result.answerSdp });

    return {
      pc,
      location: result.location,
      close: async (): Promise<void> => {
        if (result.location !== null) {
          await deleteWhep(result.location);
        }
        try {
          pc.close();
        } catch {
          // Already closed.
        }
      },
    };
  } catch (error) {
    try {
      pc.close();
    } catch {
      // Already closed.
    }
    throw error;
  }
}
