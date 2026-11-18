import { SessionModeEnum } from '@airsong/protocol';

import { getIceServers, getSessionSummary } from '../api.js';
import { ReceiverErrorEnum, toReceiverError, userMessageFor } from '../errors.js';
import { createStore, type StoreType } from '../store.js';
import { button, create, mount } from '../ui/dom.js';
import { connectWhep, type WhepHandleType } from '../whep.js';

import { createAudio } from './audio.js';
import { createStatsPoller, type PlaybackStatsType } from './stats.js';
import { createWakeLock, type WakeLockControllerType } from './wake_lock.js';

export enum PlayerPhaseEnum {
  CONNECTING = 'CONNECTING',
  PLAYING = 'PLAYING',
  AUTOPLAY_BLOCKED = 'AUTOPLAY_BLOCKED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}

export type PlayerStateType = {
  phase: PlayerPhaseEnum;
  code: string;
  sessionName: string | null;
  errorKind: ReceiverErrorEnum | null;
  stats: PlaybackStatsType | null;
  volumeSupported: boolean;
};

export type PlayerDepsType = {
  mode: SessionModeEnum;
  code: string;
  name: string;
  onLeave: () => void;
};

export type PlayerControllerType = {
  readonly element: HTMLElement;
  readonly state: StoreType<PlayerStateType>;
  retry: () => void;
  leave: () => void;
  dispose: () => void;
};

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const DISCONNECT_GRACE_MS = 5000;
const RETRIABLE = new Set<ReceiverErrorEnum>([
  ReceiverErrorEnum.SERVER_UNREACHABLE,
  ReceiverErrorEnum.TIMEOUT,
  ReceiverErrorEnum.WEBRTC_FAILED,
]);

export function createPlayer(deps: PlayerDepsType): PlayerControllerType {
  const element = create('section', { className: 'player' });
  const audio = createAudio();
  const wakeLock: WakeLockControllerType = createWakeLock();

  const state = createStore<PlayerStateType>({
    phase: PlayerPhaseEnum.CONNECTING,
    code: deps.code,
    sessionName: null,
    errorKind: null,
    stats: null,
    volumeSupported: audio.volumeSupported,
  });

  let handle: WhepHandleType | null = null;
  let stopStats: (() => void) | null = null;
  let connectAbort: AbortController | null = null;
  let disconnectTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let attempt = 0;
  let disposed = false;
  // Read through a getter so narrowing from one guard does not make later guards look dead to
  // the type checker (dispose() flips this from another closure, after the awaits in start()).
  const isDisposed = (): boolean => disposed;

  const patch = (partial: Partial<PlayerStateType>): void => {
    state.set({ ...state.get(), ...partial });
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearDisconnectTimer = (): void => {
    if (disconnectTimer !== null) {
      window.clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  };

  const teardownConnection = async (): Promise<void> => {
    if (stopStats !== null) {
      stopStats();
      stopStats = null;
    }
    if (connectAbort !== null) {
      connectAbort.abort();
      connectAbort = null;
    }
    const current = handle;
    handle = null;
    if (current !== null) {
      await current.close();
    }
  };

  const scheduleReconnect = (): void => {
    if (isDisposed()) {
      return;
    }
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 15000;
    attempt += 1;
    patch({ phase: PlayerPhaseEnum.RECONNECTING });
    clearReconnectTimer();
    reconnectTimer = window.setTimeout((): void => {
      reconnectTimer = null;
      void start();
    }, delay);
  };

  const reconnect = async (): Promise<void> => {
    clearDisconnectTimer();
    await teardownConnection();
    scheduleReconnect();
  };

  const startPlayingUi = (): void => {
    patch({ phase: PlayerPhaseEnum.PLAYING, errorKind: null });
    void wakeLock.acquire();
    if (handle !== null && stopStats === null) {
      stopStats = createStatsPoller(handle.pc, (stats: PlaybackStatsType): void => {
        patch({ stats });
      });
    }
  };

  const tryPlay = async (): Promise<void> => {
    try {
      await audio.play();
      startPlayingUi();
    } catch {
      // Autoplay policy blocked playback until a user gesture.
      patch({ phase: PlayerPhaseEnum.AUTOPLAY_BLOCKED });
    }
  };

  const onTrack = (stream: MediaStream): void => {
    audio.attach(stream);
    void tryPlay();
  };

  const onConnectionStateChange = (connState: RTCPeerConnectionState): void => {
    if (isDisposed()) {
      return;
    }
    if (connState === 'connected') {
      attempt = 0;
      clearDisconnectTimer();
    } else if (connState === 'failed') {
      void reconnect();
    } else if (connState === 'disconnected') {
      disconnectTimer ??= window.setTimeout((): void => {
        disconnectTimer = null;
        void reconnect();
      }, DISCONNECT_GRACE_MS);
    }
  };

  const start = async (): Promise<void> => {
    if (isDisposed()) {
      return;
    }
    clearReconnectTimer();
    patch({ phase: attempt === 0 ? PlayerPhaseEnum.CONNECTING : PlayerPhaseEnum.RECONNECTING, errorKind: null });
    const abort = new AbortController();
    connectAbort = abort;
    try {
      const summaryPromise =
        deps.mode === SessionModeEnum.WEB
          ? getSessionSummary(deps.code, abort.signal).catch((): null => null)
          : Promise.resolve(null);
      const ice = await getIceServers(abort.signal);
      const summary = await summaryPromise;
      if (disposed) {
        return;
      }
      if (summary !== null) {
        patch({ sessionName: summary.name });
      }
      handle = await connectWhep(
        {
          mode: deps.mode,
          code: deps.code,
          name: deps.name,
          iceServers: ice.iceServers,
          onTrack,
          onConnectionStateChange,
        },
        abort.signal,
      );
    } catch (error) {
      if (isDisposed()) {
        return;
      }
      const received = toReceiverError(error);
      if (RETRIABLE.has(received.kind)) {
        scheduleReconnect();
      } else {
        patch({ phase: PlayerPhaseEnum.ERROR, errorKind: received.kind });
      }
    }
  };

  const retry = (): void => {
    attempt = 0;
    void (async (): Promise<void> => {
      await teardownConnection();
      await start();
    })();
  };

  const dispose = (): void => {
    disposed = true;
    clearReconnectTimer();
    clearDisconnectTimer();
    void teardownConnection();
    void wakeLock.release();
    audio.destroy();
  };

  const leave = (): void => {
    dispose();
    deps.onLeave();
  };

  // --- rendering -----------------------------------------------------------
  const render = (current: PlayerStateType): void => {
    const children: Node[] = [];

    const title = create('h1', { className: 'player__title', text: current.sessionName ?? 'Session' });
    const codeLine = create('p', { className: 'player__code', text: `Code ${current.code}` });
    children.push(title, codeLine);

    const statusText: Record<PlayerPhaseEnum, string> = {
      [PlayerPhaseEnum.CONNECTING]: 'Connecting…',
      [PlayerPhaseEnum.PLAYING]: 'Playing',
      [PlayerPhaseEnum.AUTOPLAY_BLOCKED]: userMessageFor(ReceiverErrorEnum.AUTOPLAY_BLOCKED),
      [PlayerPhaseEnum.RECONNECTING]: 'Reconnecting…',
      [PlayerPhaseEnum.ERROR]: current.errorKind !== null ? userMessageFor(current.errorKind) : 'Error',
    };
    children.push(
      create('p', {
        className: `player__status player__status--${current.phase.toLowerCase()}`,
        text: statusText[current.phase],
      }),
    );

    if (current.phase === PlayerPhaseEnum.AUTOPLAY_BLOCKED) {
      children.push(
        button('Tap to play', 'btn btn--primary', (): void => {
          void tryPlay();
        }),
      );
    }

    if (current.phase === PlayerPhaseEnum.ERROR) {
      children.push(button('Try again', 'btn btn--primary', retry));
    }

    if (current.phase === PlayerPhaseEnum.PLAYING && current.stats !== null) {
      const { bitrateKbps, packetsLost, jitterMs, jitterBufferMs } = current.stats;
      const stats = create('dl', { className: 'stats' });
      const rows: readonly (readonly [string, string])[] = [
        ['Bitrate', `${String(bitrateKbps)} kbps`],
        ['Lost', String(packetsLost)],
        ['Jitter', `${String(jitterMs)} ms`],
        ['Latency', `${String(jitterBufferMs)} ms`],
      ];
      for (const [label, value] of rows) {
        stats.append(create('dt', { text: label }), create('dd', { text: value }));
      }
      children.push(stats);
    }

    if (current.volumeSupported) {
      const slider = create('input', {
        className: 'volume',
        attrs: { 'type': 'range', 'min': '0', 'max': '100', 'value': '100', 'aria-label': 'Volume' },
      });
      slider.addEventListener('input', (): void => {
        audio.setVolume(Number(slider.value) / 100);
      });
      children.push(slider);
    }

    children.push(button('Leave', 'btn btn--ghost', leave));
    mount(element, ...children);
  };

  state.subscribe(render);
  void start();

  return { element, state, retry, leave, dispose };
}
