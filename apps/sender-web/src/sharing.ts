import { NAME_MAX_LENGTH, PlatformEnum } from '@airsong/protocol';
import {
  type CreatePeerConnectionType,
  SenderSession,
  type TransportStateEnum,
  type ViewerType,
  type WarningListenerType,
  WebSignalingTransport,
} from '@airsong/sender-core';

import { captureDisplayAudio, createTestToneTrack } from './capture.js';
import { type SenderWebErrorEnum, toSenderError } from './errors.js';
import { createEventStream } from './event_stream.js';
import { getIceServers } from './net.js';

export enum SharePhaseEnum {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  SHARING = 'SHARING',
  ERROR = 'ERROR',
}

export type ShareStateType = {
  phase: SharePhaseEnum;
  code: string | null;
  transportState: TransportStateEnum | null;
  viewers: ViewerType[];
  errorKind: SenderWebErrorEnum | null;
  discoverable: boolean;
  useTestTone: boolean;
};

export type ShareListenerType = (state: ShareStateType) => void;

export type SharingControllerType = {
  getState: () => ShareStateType;
  subscribe: (listener: ShareListenerType) => () => void;
  setDiscoverable: (value: boolean) => void;
  setUseTestTone: (value: boolean) => void;
  start: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

function resolveName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : 'Airsong sender';
}

/**
 * Owns a sharing session: captures audio, builds a {@link SenderSession} + {@link WebSignalingTransport},
 * and exposes an observable state (phase, code, viewers, transport state) for the UI.
 */
export function createSharingController(): SharingControllerType {
  let state: ShareStateType = {
    phase: SharePhaseEnum.IDLE,
    code: null,
    transportState: null,
    viewers: [],
    errorKind: null,
    discoverable: true,
    useTestTone: false,
  };
  const listeners = new Set<ShareListenerType>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };
  const patch = (partial: Partial<ShareStateType>): void => {
    state = { ...state, ...partial };
    notify();
  };

  const onWarning: WarningListenerType = (message, cause) => {
    console.warn('[airsong-sender]', message, cause);
  };

  const createPeerConnection: CreatePeerConnectionType = (config) =>
    new RTCPeerConnection({ iceServers: config.iceServers });

  let session: SenderSession | null = null;
  let transport: WebSignalingTransport | null = null;
  let audioTrack: MediaStreamTrack | null = null;
  let stopViewerListener: (() => void) | null = null;
  let stopStateListener: (() => void) | null = null;

  const cleanup = async (): Promise<void> => {
    stopViewerListener?.();
    stopViewerListener = null;
    stopStateListener?.();
    stopStateListener = null;
    const activeTransport = transport;
    transport = null;
    if (activeTransport !== null) {
      try {
        await activeTransport.stop();
      } catch {
        // Best-effort: the server expires the session on its own if the delete fails.
      }
    }
    session?.close();
    session = null;
    if (audioTrack !== null) {
      audioTrack.stop();
      audioTrack = null;
    }
  };

  const start = async (name: string): Promise<void> => {
    if (state.phase === SharePhaseEnum.STARTING || state.phase === SharePhaseEnum.SHARING) {
      return;
    }
    patch({ phase: SharePhaseEnum.STARTING, errorKind: null, viewers: [], code: null });
    try {
      const track = state.useTestTone && __AIRSONG_TEST_TONE__ ? createTestToneTrack() : await captureDisplayAudio();
      audioTrack = track;
      // If the user stops sharing from the browser's own control bar, end the session too.
      track.addEventListener('ended', (): void => {
        void stop();
      });

      const activeSession = new SenderSession({ createPeerConnection, getIceServers, onWarning });
      session = activeSession;
      stopViewerListener = activeSession.onViewerChange((viewers): void => {
        patch({ viewers });
      });
      await activeSession.setTrack(track);

      const activeTransport = new WebSignalingTransport({
        baseUrl: '',
        eventStream: createEventStream,
        session: activeSession,
        onWarning,
      });
      transport = activeTransport;
      stopStateListener = activeTransport.onStateChange((transportState): void => {
        patch({ transportState });
      });

      const created = await activeTransport.start({
        name: resolveName(name),
        platform: PlatformEnum.WEB,
        discoverable: state.discoverable,
      });
      patch({ phase: SharePhaseEnum.SHARING, code: created.code });
    } catch (error) {
      await cleanup();
      patch({ phase: SharePhaseEnum.ERROR, errorKind: toSenderError(error).kind });
    }
  };

  const stop = async (): Promise<void> => {
    await cleanup();
    patch({ phase: SharePhaseEnum.IDLE, code: null, transportState: null, viewers: [], errorKind: null });
  };

  return {
    getState: (): ShareStateType => state,
    subscribe: (listener: ShareListenerType): (() => void) => {
      listeners.add(listener);
      listener(state);
      return (): void => {
        listeners.delete(listener);
      };
    },
    // Silent (no re-render): the checkbox already reflects the change; the value is read at start().
    setDiscoverable: (value: boolean): void => {
      state = { ...state, discoverable: value };
    },
    setUseTestTone: (value: boolean): void => {
      state = { ...state, useTestTone: value };
    },
    start,
    stop,
  };
}
