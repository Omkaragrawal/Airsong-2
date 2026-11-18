import { type ErrorCodeEnum } from '@airsong/protocol';

/** An error with the protocol code the receiver or server should be told. */
export class SenderError extends Error {
  public readonly code: ErrorCodeEnum;

  public constructor(code: ErrorCodeEnum, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SenderError';
    this.code = code;
  }
}
