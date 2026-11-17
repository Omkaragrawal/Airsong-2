import {
  ErrorCodeEnum,
  type ErrorPayloadType,
  ErrorStatusConst,
  generateCode,
  nameSchema,
  normalizeCode,
  sdpSchema,
} from '@airsong/protocol';

import { SenderError } from '../sender_error.js';
import { type SenderSession } from '../sender_session.js';

/** A local-mode WHEP request, already taken apart by the HTTP server that received it. */
export type LocalWhepRequestType = {
  method: 'POST' | 'DELETE';
  /** The `k` query parameter: the session code, which is the access key in local mode. */
  key: string;
  /** The `name` query parameter of a `POST`. */
  viewerName?: string;
  /** The last path segment of a `DELETE`. */
  viewerId?: string;
  /** The request body: the SDP offer of a `POST`. */
  body: string;
};

export type LocalWhepContextType = {
  session: SenderSession;
  /** The session code in its normalized form. */
  code: string;
};

export type LocalWhepResponseType = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

function errorResponse(code: ErrorCodeEnum, message: string): LocalWhepResponseType {
  const payload: ErrorPayloadType = { code, message };
  return {
    status: ErrorStatusConst[code],
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

/**
 * Handles one local-mode WHEP request. The sender's own HTTP server (native module or Electron
 * main process) calls it and writes the returned response. It never throws: every failure
 * comes back as an error response.
 */
export async function handleLocalWhep(
  request: LocalWhepRequestType,
  context: LocalWhepContextType,
): Promise<LocalWhepResponseType> {
  if (normalizeCode(request.key) !== context.code) {
    return errorResponse(ErrorCodeEnum.UNAUTHORIZED, 'The access key is wrong');
  }

  if (request.method === 'DELETE') {
    if (request.viewerId !== undefined) {
      context.session.removeViewer(request.viewerId);
    }
    return { status: 204, headers: {}, body: '' };
  }

  const offer = sdpSchema.safeParse(request.body);
  if (!offer.success) {
    return errorResponse(ErrorCodeEnum.INVALID_SDP, 'The request body is not a valid SDP offer');
  }

  // The name is only shown in the viewer list, so a bad one is dropped instead of failing the request.
  const viewerName = nameSchema.safeParse(request.viewerName);
  const viewerId = generateCode();
  try {
    const answerSdp = await context.session.answer(
      viewerId,
      offer.data,
      viewerName.success ? viewerName.data : undefined,
    );
    return {
      status: 201,
      headers: { 'content-type': 'application/sdp', 'location': `/api/whep/${viewerId}` },
      body: answerSdp,
    };
  } catch (error) {
    if (error instanceof SenderError) {
      return errorResponse(error.code, error.message);
    }
    return errorResponse(ErrorCodeEnum.INTERNAL_ERROR, 'The sender could not answer the offer');
  }
}
