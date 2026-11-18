import { z } from 'zod';

import { ErrorCodeEnum } from './error_codes.js';
import { type CreateSessionResponseType, PlatformEnum } from './http_api.js';
import { type OfferEventType, type ViewerLeftEventType } from './sse_events.js';

/** Longest accepted SDP, in UTF-8 bytes. */
export const SDP_MAX_BYTES = 16_384;

/** Longest accepted session or viewer name, in characters. */
export const NAME_MAX_LENGTH = 40;

const textEncoder = new TextEncoder();

/** An SDP offer or answer. The size is checked in bytes, because that is what travels over HTTP. */
export const sdpSchema = z
  .string()
  .startsWith('v=0')
  .refine((sdp) => textEncoder.encode(sdp).length <= SDP_MAX_BYTES, {
    message: `SDP must be at most ${SDP_MAX_BYTES} bytes`,
  });

/**
 * A session or viewer name: trimmed, not empty, and free of control characters.
 * The length is counted in Unicode code points, so an emoji counts as one character.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => [...name].length <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  })
  .regex(/^\P{Cc}*$/u, { message: 'Name must not contain control characters' });

/** `POST /api/sessions` body. */
export const createSessionSchema = z.object({
  name: nameSchema,
  platform: z.enum(PlatformEnum),
  discoverable: z.boolean(),
});

/**
 * `POST /api/sessions/:id/answers/:viewerId` body: the sender's SDP answer, or why it couldn't answer.
 * Both shapes are strict, so a body with both keys, or any extra key, is rejected.
 */
export const answerSchema = z.union([
  z.strictObject({ sdp: sdpSchema }),
  z.strictObject({ error: z.enum(ErrorCodeEnum) }),
]);

/** `POST /api/sessions` response. The sender checks it, because the token and ids are used in later requests. */
export const createSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  code: z.string().min(1),
  senderToken: z.string().min(1),
  expiresAt: z.number(),
}) satisfies z.ZodType<CreateSessionResponseType>;

/** Data of an `OFFER` event. The sender checks it before answering. */
export const offerEventSchema = z.object({
  viewerId: z.string().min(1),
  sdp: sdpSchema,
  viewerName: nameSchema,
}) satisfies z.ZodType<OfferEventType>;

/** Data of a `VIEWER_LEFT` event. */
export const viewerLeftEventSchema = z.object({
  viewerId: z.string().min(1),
}) satisfies z.ZodType<ViewerLeftEventType>;

export type CreateSessionBodyType = z.infer<typeof createSessionSchema>;

export type AnswerBodyType = z.infer<typeof answerSchema>;
