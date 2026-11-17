import { type IceServerType } from '@airsong/protocol';

/**
 * The parts of the WebRTC API this package calls, declared by shape.
 *
 * The package runs in browsers, Electron and React Native, and only browsers have the DOM
 * types. The browser's `RTCPeerConnection` and `react-native-webrtc`'s class both fit these
 * shapes, so each app passes in its own.
 */

/** An audio or video track. Only its kind is read here. */
export type MediaTrackType = {
  readonly kind: string;
};

export type EncodingParametersType = {
  maxBitrate?: number;
  priority?: string;
};

export type SendParametersType = {
  encodings: EncodingParametersType[];
};

export type RtpSenderType = {
  replaceTrack(track: MediaTrackType | null): Promise<void>;
  getParameters(): SendParametersType;
  setParameters(parameters: SendParametersType): Promise<void>;
};

export type TransceiverType = {
  direction: string;
  readonly receiver: { readonly track: MediaTrackType };
  readonly sender: RtpSenderType;
};

export type PeerConnectionType = {
  readonly iceGatheringState: string;
  readonly connectionState: string;
  readonly localDescription: { readonly sdp: string } | null;
  setRemoteDescription(description: { type: 'offer'; sdp: string }): Promise<void>;
  createAnswer(): Promise<{ sdp?: string }>;
  setLocalDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  getTransceivers(): TransceiverType[];
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  close(): void;
};

export type PeerConnectionConfigType = {
  iceServers: IceServerType[];
};

/** Creates a peer connection. In a browser: `(config) => new RTCPeerConnection(config)`. */
export type CreatePeerConnectionType = (config: PeerConnectionConfigType) => PeerConnectionType;
