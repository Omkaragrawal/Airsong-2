/** Names of the server-sent events a sender receives, as they appear on the `event:` line. */
export enum SseEventEnum {
  OFFER = 'OFFER',
  VIEWER_LEFT = 'VIEWER_LEFT',
  PING = 'PING',
}

/** A receiver wants to join: the sender answers this SDP offer. */
export type OfferEventType = {
  viewerId: string;
  sdp: string;
  /** Always present: the server fills in a default when the receiver sent no name. */
  viewerName: string;
};

/** A receiver disconnected. */
export type ViewerLeftEventType = {
  viewerId: string;
};

/** Keep-alive. It carries no data. */
export type PingEventType = Record<string, never>;

/** Every event on the sender's stream, tagged by its event name. */
export type SseEventType =
  | { event: SseEventEnum.OFFER; data: OfferEventType }
  | { event: SseEventEnum.VIEWER_LEFT; data: ViewerLeftEventType }
  | { event: SseEventEnum.PING; data: PingEventType };
