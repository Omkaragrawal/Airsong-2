import { Logger } from '@adonisjs/core/logger';
import { HttpContext } from '@adonisjs/core/http';
import { type NextFn } from '@adonisjs/core/types/http';

/**
 * Binds the per-request `HttpContext` and `Logger` into the container, so they resolve to the
 * current request's values wherever they're injected.
 */
export default class ContainerBindingsMiddleware {
  public handle(ctx: HttpContext, next: NextFn): ReturnType<NextFn> {
    ctx.containerResolver.bindValue(HttpContext, ctx);
    ctx.containerResolver.bindValue(Logger, ctx.logger);

    return next();
  }
}
