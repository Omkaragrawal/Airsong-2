import { ErrorCodeEnum, type IceServerType } from '@airsong/protocol';

import { waitForIceGathering } from './gather.js';
import { OpusParamsConst, tuneOpusSdp } from './opus.js';
import { SenderError } from './sender_error.js';
import {
  type CreatePeerConnectionType,
  type MediaTrackType,
  type PeerConnectionType,
  type RtpSenderType,
} from './webrtc_types.js';

/** Default limit on receivers per session. Each one is a separate encode and upload on the sender. */
export const MAX_VIEWERS = 5;

/** Upper limit for the encoder, a little above the Opus target so short peaks aren't cut. */
const MAX_BITRATE_BPS = 160_000;

export enum ViewerStateEnum {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}

export type ViewerType = {
  id: string;
  name: string;
  state: ViewerStateEnum;
};

export type ViewerChangeListenerType = (viewers: ViewerType[]) => void;

/** Receives problems the session recovered from, so the app can log or show them. */
export type WarningListenerType = (message: string, cause?: unknown) => void;

/** The result of {@link SenderSession.answer}: the answer SDP plus the attempt's generation. */
export type AnswerResultType = {
  sdp: string;
  /** Identifies this connection attempt; pass to {@link SenderSession.removeViewerIfCurrent}. */
  generation: number;
};

export type SenderSessionOptionsType = {
  createPeerConnection: CreatePeerConnectionType;
  getIceServers: () => Promise<IceServerType[]>;
  maxViewers?: number;
  onWarning?: WarningListenerType;
};

type ViewerEntryType = {
  viewer: ViewerType;
  pc: PeerConnectionType;
  audioSender: RtpSenderType;
  /** The answer() attempt that registered this connection, so a stale cleanup can be told apart. */
  generation: number;
  onConnectionStateChange: () => void;
};

/** The per-connection parts of a viewer entry, bundled so addViewer stays within the parameter limit. */
type ViewerConnectionType = {
  pc: PeerConnectionType;
  audioSender: RtpSenderType;
  generation: number;
};

/** Holds one peer connection per receiver and answers their offers with the current audio track. */
export class SenderSession {
  private readonly createPeerConnection: CreatePeerConnectionType;

  private readonly getIceServers: () => Promise<IceServerType[]>;

  private readonly maxViewers: number;

  private readonly onWarning: WarningListenerType;

  private readonly entries = new Map<string, ViewerEntryType>();

  private readonly listeners = new Set<ViewerChangeListenerType>();

  private track: MediaTrackType | null = null;

  /** Offers being answered right now. They count towards the limit so two at once can't both take the last place. */
  private pendingCount = 0;

  /** Monotonic counter handing each answer() attempt a unique, increasing generation. */
  private generationCounter = 0;

  /** The generation that currently owns each viewer id; a later attempt or removeViewer() moves it on. */
  private readonly currentGeneration = new Map<string, number>();

  /** Number of default names given out so far, for "Listener 1", "Listener 2" and so on. */
  private defaultNameCount = 0;

  private closed = false;

  public constructor(options: SenderSessionOptionsType) {
    this.createPeerConnection = options.createPeerConnection;
    this.getIceServers = options.getIceServers;
    this.maxViewers = options.maxViewers ?? MAX_VIEWERS;
    this.onWarning = options.onWarning ?? ((): void => undefined);
  }

  public get viewers(): ViewerType[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.viewer }));
  }

  /** Calls the listener with the viewer list whenever it changes. Returns a function that stops the calls. */
  public onViewerChange(listener: ViewerChangeListenerType): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  /** Sets the audio track that every receiver hears, now and for later joins. Pass `null` to send silence. */
  public async setTrack(track: MediaTrackType | null): Promise<void> {
    this.track = track;
    const entries = [...this.entries.values()];
    const results = await Promise.allSettled(entries.map((entry) => entry.audioSender.replaceTrack(track)));
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        this.onWarning(`Could not switch the audio track for viewer ${entries[index]?.viewer.id ?? ''}`, result.reason);
      }
    }
  }

  /**
   * Answers a receiver's SDP offer and returns the answer SDP (with ICE candidates) plus this
   * attempt's generation. Throws a `SenderError` when the session is full or closed, the offer
   * can't be used, or a newer offer for the same viewer superseded this one.
   */
  public async answer(viewerId: string, offerSdp: string, viewerName?: string): Promise<AnswerResultType> {
    this.assertOpen();
    // A receiver that restarts sends a new offer; its old connection is replaced.
    this.removeViewer(viewerId);
    if (this.entries.size + this.pendingCount >= this.maxViewers) {
      throw new SenderError(ErrorCodeEnum.SESSION_FULL, `The session already has ${this.maxViewers} viewers`);
    }

    // Claim the latest generation for this viewer. A later answer() claims a higher one, and
    // removeViewer() clears the claim, so an attempt that finishes afterwards can tell it is stale.
    this.generationCounter += 1;
    const generation = this.generationCounter;
    this.currentGeneration.set(viewerId, generation);

    this.pendingCount += 1;
    let pc: PeerConnectionType | undefined;
    try {
      pc = this.createPeerConnection({ iceServers: await this.getIceServers() });
      const { answerSdp, audioSender, track } = await this.negotiate(pc, offerSdp);
      // Checked again because `close()` may have run while the answer was being made.
      this.assertOpen();
      // Register only if this is still the latest attempt for the viewer; a newer offer or a
      // VIEWER_LEFT (removeViewer) in the meantime makes this one stale, so it must not clobber them.
      if (this.currentGeneration.get(viewerId) !== generation) {
        throw new SenderError(
          ErrorCodeEnum.SESSION_NOT_FOUND,
          'The offer was superseded by a newer one for the same viewer, or the viewer left',
        );
      }
      this.addViewer(
        { id: viewerId, name: this.resolveName(viewerName), state: ViewerStateEnum.CONNECTING },
        { pc, audioSender, generation },
      );
      await this.catchUpTrack(viewerId, audioSender, track);
      return { sdp: answerSdp, generation };
    } catch (error) {
      pc?.close();
      // A failed attempt must not leave its generation claim behind — but only clear it when it is
      // still ours, so a newer attempt that already replaced the claim keeps it.
      if (this.currentGeneration.get(viewerId) === generation) {
        this.currentGeneration.delete(viewerId);
      }
      throw error;
    } finally {
      this.pendingCount -= 1;
    }
  }

  /** Disconnects one receiver. Does nothing when the id is unknown. */
  public removeViewer(viewerId: string): void {
    // Clear the claim first, so an in-flight answer() for this viewer sees it is no longer current.
    this.currentGeneration.delete(viewerId);
    const entry = this.entries.get(viewerId);
    if (entry === undefined) {
      return;
    }
    this.entries.delete(viewerId);
    this.disconnect(entry);
    this.notify();
  }

  /**
   * Removes the viewer only if the connection currently registered for it is the one from
   * `generation`. Lets a failed answer post clean up its own connection without removing a newer
   * offer that replaced it while the post was in flight.
   */
  public removeViewerIfCurrent(viewerId: string, generation: number): void {
    const entry = this.entries.get(viewerId);
    if (entry?.generation === generation) {
      this.removeViewer(viewerId);
    }
  }

  /** Disconnects every receiver. The session can't be used afterwards. */
  public close(): void {
    this.closed = true;
    for (const viewerId of [...this.entries.keys()]) {
      this.removeViewer(viewerId);
    }
    this.currentGeneration.clear();
    this.listeners.clear();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new SenderError(ErrorCodeEnum.SESSION_NOT_FOUND, 'The session is closed');
    }
  }

  private async negotiate(
    pc: PeerConnectionType,
    offerSdp: string,
  ): Promise<{ answerSdp: string; audioSender: RtpSenderType; track: MediaTrackType | null }> {
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    } catch (cause) {
      throw new SenderError(ErrorCodeEnum.INVALID_SDP, 'The offer was rejected by the WebRTC engine', { cause });
    }
    const transceiver = pc.getTransceivers().find((candidate) => candidate.receiver.track.kind === 'audio');
    if (transceiver === undefined) {
      throw new SenderError(ErrorCodeEnum.INVALID_SDP, 'The offer has no audio section');
    }
    const track = this.track;
    await transceiver.sender.replaceTrack(track);
    transceiver.direction = 'sendonly';

    const answer = await pc.createAnswer();
    if (answer.sdp === undefined) {
      throw new Error('The WebRTC engine created an answer without SDP');
    }
    await pc.setLocalDescription({ type: 'answer', sdp: tuneOpusSdp(answer.sdp, OpusParamsConst.SENDER) });
    await waitForIceGathering(pc);
    await this.limitBitrate(transceiver.sender);

    // Read back after gathering: only now does the description contain the ICE candidates.
    const answerSdp = pc.localDescription?.sdp;
    if (answerSdp === undefined) {
      throw new Error('The WebRTC engine has no local description after answering');
    }
    return { answerSdp, audioSender: transceiver.sender, track };
  }

  /** The limit only tunes quality, so a runtime that refuses it keeps its connection. */
  private async limitBitrate(sender: RtpSenderType): Promise<void> {
    try {
      const parameters = sender.getParameters();
      const encoding = parameters.encodings[0];
      if (encoding === undefined) {
        parameters.encodings = [{ maxBitrate: MAX_BITRATE_BPS, priority: 'high' }];
      } else {
        encoding.maxBitrate = MAX_BITRATE_BPS;
        encoding.priority = 'high';
      }
      await sender.setParameters(parameters);
    } catch (cause) {
      this.onWarning('Could not set the audio bitrate limit', cause);
    }
  }

  /**
   * `setTrack` only reaches viewers that are already in the list. If the track changed while
   * this viewer's answer was being made, the viewer still has the old one, so switch it now.
   */
  private async catchUpTrack(
    viewerId: string,
    audioSender: RtpSenderType,
    usedTrack: MediaTrackType | null,
  ): Promise<void> {
    if (this.track === usedTrack) {
      return;
    }
    try {
      await audioSender.replaceTrack(this.track);
    } catch (cause) {
      this.onWarning(`Could not switch the audio track for viewer ${viewerId}`, cause);
    }
  }

  private disconnect(entry: ViewerEntryType): void {
    entry.pc.removeEventListener('connectionstatechange', entry.onConnectionStateChange);
    entry.pc.close();
  }

  private addViewer(viewer: ViewerType, connection: ViewerConnectionType): void {
    const { pc, audioSender, generation } = connection;
    // Two offers for the same id can be answered at once. The later one wins, and the earlier
    // connection is closed here so it isn't left open with nothing pointing at it.
    const replaced = this.entries.get(viewer.id);
    if (replaced !== undefined) {
      this.disconnect(replaced);
    }
    const onConnectionStateChange = (): void => {
      this.syncViewerState(viewer.id, pc);
    };
    this.entries.set(viewer.id, { viewer, pc, audioSender, generation, onConnectionStateChange });
    pc.addEventListener('connectionstatechange', onConnectionStateChange);
    this.notify();
    // The state may have moved on while the answer was being made.
    this.syncViewerState(viewer.id, pc);
  }

  private resolveName(viewerName: string | undefined): string {
    const trimmed = viewerName?.trim() ?? '';
    if (trimmed.length > 0) {
      return trimmed;
    }
    this.defaultNameCount += 1;
    return `Listener ${this.defaultNameCount}`;
  }

  private syncViewerState(viewerId: string, pc: PeerConnectionType): void {
    const entry = this.entries.get(viewerId);
    if (entry?.pc !== pc) {
      return;
    }
    const connectionState = pc.connectionState;
    if (connectionState === 'failed' || connectionState === 'closed') {
      this.removeViewer(viewerId);
      return;
    }
    let state = ViewerStateEnum.CONNECTING;
    if (connectionState === 'connected') {
      state = ViewerStateEnum.CONNECTED;
    } else if (connectionState === 'disconnected') {
      state = ViewerStateEnum.DISCONNECTED;
    }
    if (entry.viewer.state !== state) {
      entry.viewer.state = state;
      this.notify();
    }
  }

  private notify(): void {
    const viewers = this.viewers;
    for (const listener of this.listeners) {
      try {
        listener(viewers);
      } catch (cause) {
        this.onWarning('A viewer-change listener threw an error', cause);
      }
    }
  }
}
