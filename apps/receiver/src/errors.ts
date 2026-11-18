import { ErrorCodeEnum, type ErrorPayloadType } from '@airsong/protocol';

/**
 * Every failure the receiver surfaces to the user, as a stable UI state. Server-returned
 * {@link ErrorCodeEnum} values are mapped onto these; the rest are client-side conditions.
 */
export enum ReceiverErrorEnum {
  SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
  TIMEOUT = 'TIMEOUT',
  INVALID_CODE = 'INVALID_CODE',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_FULL = 'SESSION_FULL',
  AUTOPLAY_BLOCKED = 'AUTOPLAY_BLOCKED',
  WEBRTC_FAILED = 'WEBRTC_FAILED',
  UNKNOWN = 'UNKNOWN',
}

/** An error with a UI-facing {@link ReceiverErrorEnum} kind and a human-readable message. */
export class ReceiverError extends Error {
  public readonly kind: ReceiverErrorEnum;

  public constructor(kind: ReceiverErrorEnum, message: string) {
    super(message);
    this.name = 'ReceiverError';
    this.kind = kind;
  }
}

const USER_MESSAGES: Record<ReceiverErrorEnum, string> = {
  [ReceiverErrorEnum.SERVER_UNREACHABLE]: "Can't reach the server. Check your connection and try again.",
  [ReceiverErrorEnum.TIMEOUT]: 'The server took too long to respond. Try again.',
  [ReceiverErrorEnum.INVALID_CODE]: 'That code does not look right. Codes are 6 characters.',
  [ReceiverErrorEnum.SESSION_NOT_FOUND]: 'No session with that code. Check it and try again.',
  [ReceiverErrorEnum.SESSION_FULL]: 'This session is full. Ask the host to free up a slot.',
  [ReceiverErrorEnum.AUTOPLAY_BLOCKED]: 'Tap play to start the audio.',
  [ReceiverErrorEnum.WEBRTC_FAILED]: 'The audio connection failed.',
  [ReceiverErrorEnum.UNKNOWN]: 'Something went wrong. Try again.',
};

const SERVER_CODE_MAP: Partial<Record<ErrorCodeEnum, ReceiverErrorEnum>> = {
  [ErrorCodeEnum.SESSION_NOT_FOUND]: ReceiverErrorEnum.SESSION_NOT_FOUND,
  [ErrorCodeEnum.NOT_FOUND]: ReceiverErrorEnum.SESSION_NOT_FOUND,
  [ErrorCodeEnum.SESSION_FULL]: ReceiverErrorEnum.SESSION_FULL,
  [ErrorCodeEnum.UNAUTHORIZED]: ReceiverErrorEnum.INVALID_CODE,
  [ErrorCodeEnum.INVALID_SDP]: ReceiverErrorEnum.WEBRTC_FAILED,
  [ErrorCodeEnum.SENDER_TIMEOUT]: ReceiverErrorEnum.TIMEOUT,
};

/** The message shown to the user for a given error kind. */
export function userMessageFor(kind: ReceiverErrorEnum): string {
  return USER_MESSAGES[kind];
}

/** Maps a server error payload onto a {@link ReceiverError}. */
export function fromErrorPayload(payload: ErrorPayloadType): ReceiverError {
  const kind = SERVER_CODE_MAP[payload.code] ?? ReceiverErrorEnum.UNKNOWN;
  return new ReceiverError(kind, payload.message);
}

/** Narrows an unknown thrown value to a {@link ReceiverError}, wrapping anything else as UNKNOWN. */
export function toReceiverError(error: unknown): ReceiverError {
  if (error instanceof ReceiverError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return new ReceiverError(ReceiverErrorEnum.UNKNOWN, message);
}
