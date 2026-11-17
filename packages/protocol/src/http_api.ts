/** Where signaling runs: through the hosted server, or on the sender's own device. */
export enum SessionModeEnum {
  WEB = 'WEB',
  LOCAL = 'LOCAL',
}

/** The platform a sender runs on. */
export enum PlatformEnum {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  MACOS = 'MACOS',
  WINDOWS = 'WINDOWS',
  LINUX = 'LINUX',
  WEB = 'WEB',
}

/** `POST /api/sessions` response. */
export type CreateSessionResponseType = {
  sessionId: string;
  code: string;
  /** Bearer token for the sender-only endpoints of this session. */
  senderToken: string;
  /** Epoch time in milliseconds. */
  expiresAt: number;
};

/** One entry of the `GET /api/sessions/nearby` response, which is an array of these. */
export type NearbySessionType = {
  code: string;
  name: string;
  platform: PlatformEnum;
};

/** `GET /api/sessions/:code` response. */
export type SessionSummaryType = {
  name: string;
  platform: PlatformEnum;
};

/**
 * One STUN or TURN server. It has the same shape as the browser's `RTCIceServer`, declared
 * here because this package also runs in Node, where the DOM types don't exist.
 */
export type IceServerType = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** `GET /api/ice-servers` response. In local mode `iceServers` is empty. */
export type IceServersResponseType = {
  iceServers: IceServerType[];
  /** How long the client may reuse these servers, in seconds. */
  ttl: number;
};

/** `GET /api/info` response. */
export type InfoResponseType = {
  mode: SessionModeEnum;
  name?: string;
  platform?: PlatformEnum;
  version: string;
};
