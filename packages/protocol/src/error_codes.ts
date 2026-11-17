/**
 * Client-facing error codes for JSON endpoints. The server returns `{ code, message }`
 * with a matching HTTP status; clients switch on `code`. Add new codes here, never inline strings.
 */
export enum ErrorCodeEnum {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_FULL = 'SESSION_FULL',
  INVALID_SDP = 'INVALID_SDP',
  SENDER_TIMEOUT = 'SENDER_TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** HTTP status returned with each error code. */
export const ErrorStatusConst: Record<ErrorCodeEnum, number> = {
  [ErrorCodeEnum.SESSION_NOT_FOUND]: 404,
  [ErrorCodeEnum.SESSION_FULL]: 409,
  [ErrorCodeEnum.INVALID_SDP]: 400,
  [ErrorCodeEnum.SENDER_TIMEOUT]: 504,
  [ErrorCodeEnum.UNAUTHORIZED]: 401,
  [ErrorCodeEnum.RATE_LIMITED]: 429,
  [ErrorCodeEnum.INTERNAL_ERROR]: 500,
};

/** The JSON error envelope every failing endpoint returns. */
export type ErrorPayloadType = {
  code: ErrorCodeEnum;
  message: string;
};
