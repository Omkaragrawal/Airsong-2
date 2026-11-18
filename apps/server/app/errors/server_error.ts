import { type ErrorCodeEnum } from '@airsong/protocol';

/** The fixed facts about a server error: its catalog id, HTTP status, client code, and message. */
export type ServerErrorOptionsType = {
  id: string;
  httpStatus: number;
  clientCode: ErrorCodeEnum;
  message: string;
};

/**
 * An error whose client-facing code and HTTP status are fixed, plus a server-only catalog id for
 * logs. The exception handler renders `{ code, message }` to the client and logs the id.
 */
export class ServerError extends Error {
  public readonly id: string;

  public readonly httpStatus: number;

  public readonly clientCode: ErrorCodeEnum;

  public constructor(options: ServerErrorOptionsType) {
    super(options.message);
    this.name = 'ServerError';
    this.id = options.id;
    this.httpStatus = options.httpStatus;
    this.clientCode = options.clientCode;
  }
}
