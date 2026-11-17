import app from '@adonisjs/core/services/app';
import { ErrorCodeEnum, type ErrorPayloadType } from '@airsong/protocol';
import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http';

import { ServerError } from '#errors/server_error';

/** HTTP statuses AdonisJS raises for this server's requests, mapped to a client-facing code. */
const FRAMEWORK_STATUS_CODES: Record<number, ErrorCodeEnum> = {
  400: ErrorCodeEnum.BAD_REQUEST,
  404: ErrorCodeEnum.NOT_FOUND,
  413: ErrorCodeEnum.PAYLOAD_TOO_LARGE,
};

/** Reads a numeric HTTP status off an AdonisJS exception, or undefined for a plain error. */
function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

export default class HttpExceptionHandler extends ExceptionHandler {
  protected override debug = !app.inProduction;

  /**
   * Renders every error to the client as `{ code, message }`.
   * - A `ServerError` keeps its own code and status and logs its catalog id.
   * - An AdonisJS HTTP exception (unknown route, bad body, body too large) keeps its status and maps
   *   it to a client code.
   * - Anything else is unexpected: logged in full and returned as a generic 500.
   */
  // Async to match the base ExceptionHandler.handle signature, though this override awaits nothing.
  // eslint-disable-next-line @typescript-eslint/require-await
  public override async handle(error: unknown, ctx: HttpContext): Promise<void> {
    if (error instanceof ServerError) {
      ctx.logger.error({ err: error, errId: error.id }, error.message);
      const body: ErrorPayloadType = { code: error.clientCode, message: error.message };
      ctx.response.status(error.httpStatus).send(body);
      return;
    }

    const status = statusOf(error);
    const mappedCode = status === undefined ? undefined : FRAMEWORK_STATUS_CODES[status];
    if (status !== undefined && mappedCode !== undefined) {
      const message = error instanceof Error ? error.message : 'Request failed';
      ctx.logger.warn({ err: error, status }, message);
      const body: ErrorPayloadType = { code: mappedCode, message };
      ctx.response.status(status).send(body);
      return;
    }

    ctx.logger.error({ err: error }, 'Unhandled server error');
    const body: ErrorPayloadType = { code: ErrorCodeEnum.INTERNAL_ERROR, message: 'Internal server error' };
    ctx.response.status(500).send(body);
  }
}
