import { type ErrorCodeEnum } from '@airsong/protocol';

import { ServerError } from './server_error.js';

/** One catalog entry: the HTTP status, message, and client-facing code for a server error. */
export type ServerErrorEntryType = {
  httpStatus: number;
  message: string;
  clientCode: ErrorCodeEnum;
};

/**
 * Server errors keyed by their id: `C0001-S00001-R00001-M0001` — Controller (4 digits),
 * Service (5), Repository (5, the in-memory stores), Module (4). A zero-filled slot means the
 * error isn't raised by that layer. The id is logged, never sent; clients get `clientCode` and
 * `message`. This starts empty and gains entries as the controllers and services are built.
 */
export const ServerErrorConst: Record<string, ServerErrorEntryType> = {};

const SERVER_ERROR_ID = /^C\d{4}-S\d{5}-R\d{5}-M\d{4}$/;

/** Builds a `ServerError` from its catalog id. Throws if the id is malformed or not in the catalog. */
export function serverError(id: string): ServerError {
  if (!SERVER_ERROR_ID.test(id)) {
    throw new Error(`Malformed server error id: ${id}`);
  }
  const entry = ServerErrorConst[id];
  if (entry === undefined) {
    throw new Error(`Unknown server error id: ${id}`);
  }
  return new ServerError({ id, httpStatus: entry.httpStatus, clientCode: entry.clientCode, message: entry.message });
}
