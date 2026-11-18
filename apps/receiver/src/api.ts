import {
  ErrorCodeEnum,
  type ErrorPayloadType,
  type IceServersResponseType,
  type InfoResponseType,
  type NearbySessionType,
  type SessionSummaryType,
  SessionModeEnum,
  iceServersResponseSchema,
  infoResponseSchema,
  nearbySessionSchema,
  sessionSummarySchema,
} from '@airsong/protocol';

import { ReceiverError, ReceiverErrorEnum, fromErrorPayload } from './errors.js';
import { WHEP_TIMEOUT_MS, request, type RawResponseType } from './net.js';

/** The subset of a Zod schema this module uses, so `zod` need not be a direct dependency. */
type ParserType<T> = { parse: (value: unknown) => T };

export type WhepResultType = {
  answerSdp: string;
  /** The `Location` header the sender returned, used to end the session later. */
  location: string | null;
};

function statusToKind(status: number): ReceiverErrorEnum {
  switch (status) {
    case 404:
      return ReceiverErrorEnum.SESSION_NOT_FOUND;
    case 409:
      return ReceiverErrorEnum.SESSION_FULL;
    case 401:
    case 403:
      return ReceiverErrorEnum.INVALID_CODE;
    default:
      return ReceiverErrorEnum.UNKNOWN;
  }
}

function isErrorPayload(value: unknown): value is ErrorPayloadType {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record['message'] === 'string' &&
    typeof record['code'] === 'string' &&
    (Object.values(ErrorCodeEnum) as string[]).includes(record['code'])
  );
}

/** Throws a mapped {@link ReceiverError} when the response is an HTTP error. */
function throwIfError(res: RawResponseType): void {
  if (res.status < 400) {
    return;
  }
  try {
    const data: unknown = JSON.parse(res.body);
    if (isErrorPayload(data)) {
      throw fromErrorPayload(data);
    }
  } catch (error) {
    if (error instanceof ReceiverError) {
      throw error;
    }
    // Body was not JSON: fall through to a status-based mapping.
  }
  throw new ReceiverError(statusToKind(res.status), `Request failed (${String(res.status)}).`);
}

function parseWith<T>(res: RawResponseType, parser: ParserType<T>): T {
  throwIfError(res);
  let data: unknown;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new ReceiverError(ReceiverErrorEnum.UNKNOWN, 'The server sent an invalid response.');
  }
  try {
    return parser.parse(data);
  } catch {
    throw new ReceiverError(ReceiverErrorEnum.UNKNOWN, 'The server response was not in the expected format.');
  }
}

/** `GET /api/info` — mode detection. */
export async function getInfo(signal?: AbortSignal): Promise<InfoResponseType> {
  const res = await request('/api/info', { signal });
  return parseWith(res, infoResponseSchema);
}

/** `GET /api/ice-servers` — STUN/TURN servers (empty in local mode). */
export async function getIceServers(signal?: AbortSignal): Promise<IceServersResponseType> {
  const res = await request('/api/ice-servers', { signal });
  return parseWith(res, iceServersResponseSchema);
}

/** `GET /api/sessions/nearby` — web-mode discovery of sessions on the same network. */
export async function getNearby(signal?: AbortSignal): Promise<NearbySessionType[]> {
  const res = await request('/api/sessions/nearby', { signal });
  throwIfError(res);
  let data: unknown;
  try {
    data = JSON.parse(res.body);
  } catch {
    throw new ReceiverError(ReceiverErrorEnum.UNKNOWN, 'The server sent an invalid response.');
  }
  if (!Array.isArray(data)) {
    throw new ReceiverError(ReceiverErrorEnum.UNKNOWN, 'The nearby list was not in the expected format.');
  }
  try {
    return data.map((item): NearbySessionType => nearbySessionSchema.parse(item));
  } catch {
    throw new ReceiverError(ReceiverErrorEnum.UNKNOWN, 'The nearby list was not in the expected format.');
  }
}

/** `GET /api/sessions/:code` — session name/platform, or SESSION_NOT_FOUND on 404. */
export async function getSessionSummary(code: string, signal?: AbortSignal): Promise<SessionSummaryType> {
  const res = await request(`/api/sessions/${encodeURIComponent(code)}`, { signal });
  return parseWith(res, sessionSummarySchema);
}

/** Builds the mode-specific WHEP POST URL, with an optional `name` query parameter. */
export function buildWhepUrl(mode: SessionModeEnum, code: string, name: string): string {
  const params = new URLSearchParams();
  if (name.length > 0) {
    params.set('name', name);
  }
  if (mode === SessionModeEnum.LOCAL) {
    params.set('k', code);
    return `/api/whep?${params.toString()}`;
  }
  const query = params.toString();
  return `/api/sessions/${encodeURIComponent(code)}/whep${query.length > 0 ? `?${query}` : ''}`;
}

/** Posts the SDP offer and returns the answer SDP plus the `Location` for later cleanup. */
export async function postWhep(url: string, offerSdp: string, signal?: AbortSignal): Promise<WhepResultType> {
  const res = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/sdp' },
    body: offerSdp,
    timeoutMs: WHEP_TIMEOUT_MS,
    signal,
  });
  if (res.status !== 201) {
    throwIfError(res);
    throw new ReceiverError(ReceiverErrorEnum.WEBRTC_FAILED, `Unexpected WHEP status (${String(res.status)}).`);
  }
  return { answerSdp: res.body, location: res.location };
}

/** Best-effort `DELETE` of the WHEP `Location` to end the session. Never throws. */
export async function deleteWhep(location: string): Promise<void> {
  try {
    await request(location, { method: 'DELETE', timeoutMs: WHEP_TIMEOUT_MS });
  } catch {
    // Cleanup is best-effort; the session also times out on the sender side.
  }
}
